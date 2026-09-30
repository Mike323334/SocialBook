from datetime import date, datetime, timezone
from unittest.mock import patch
from uuid import UUID

from fastapi.testclient import TestClient

from app.analytics.store import AnalyticsStore
from app.api.analytics import get_analytics_store
from app.core.config import Settings, get_settings
from app.main import app

client = TestClient(app)


def test_configured_supabase_url_is_used_for_analytics_store() -> None:
    settings = Settings(
        _env_file=None,
        supabase_database_url='postgresql://user:password@db.example.test/postgres',
    )
    with patch('app.api.analytics._analytics_store_for_location') as store_factory:
        result = get_analytics_store(settings)

    assert result is store_factory.return_value
    store_factory.assert_called_once_with('postgresql://user:password@db.example.test/postgres')


def test_analytics_counts_questions_books_and_unique_daily_visitors(tmp_path) -> None:
    store = AnalyticsStore(str(tmp_path / 'analytics.sqlite3'))
    app.dependency_overrides[get_analytics_store] = lambda: store
    day = datetime.now(timezone.utc).date().isoformat()
    visitor_one = str(UUID('00000000-0000-0000-0000-000000000001'))
    visitor_two = str(UUID('00000000-0000-0000-0000-000000000002'))
    try:
        for event, visitor in [
            ('daily_visit', visitor_one),
            ('question', visitor_one),
            ('book_upload', visitor_one),
            ('daily_visit', visitor_one),
            ('question', visitor_two),
        ]:
            response = client.post('/api/analytics/events', json={
                'event': event,
                'visitor_id': visitor,
            })
            assert response.status_code == 202

        settings = Settings(_env_file=None, analytics_admin_token='test-admin-secret')
        app.dependency_overrides[get_settings] = lambda: settings
        report = client.get(
            '/api/analytics/daily?days=1',
            headers={'Authorization': 'Bearer test-admin-secret'},
        )
    finally:
        app.dependency_overrides.clear()

    assert report.status_code == 200
    assert report.json()['days'] == [{
        'date': day,
        'users': 2,
        'questions': 2,
        'books_uploaded': 1,
    }]


def test_analytics_event_rejects_question_and_book_content(tmp_path) -> None:
    store = AnalyticsStore(str(tmp_path / 'analytics.sqlite3'))
    app.dependency_overrides[get_analytics_store] = lambda: store
    try:
        response = client.post('/api/analytics/events', json={
            'event': 'question',
            'visitor_id': '00000000-0000-0000-0000-000000000001',
            'question': 'Private question content',
            'answer': 'Private answer content',
            'book_title': 'Private book title',
        })
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    today = datetime.now(timezone.utc).date()
    assert store.get_daily_metrics(today, today) == []


def test_daily_analytics_requires_admin_token(tmp_path) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None,
        analytics_admin_token='test-admin-secret',
    )
    try:
        missing = client.get('/api/analytics/daily?days=1')
        incorrect = client.get(
            '/api/analytics/daily?days=1',
            headers={'Authorization': 'Bearer wrong-token'},
        )
    finally:
        app.dependency_overrides.clear()

    assert missing.status_code == 401
    assert incorrect.status_code == 401
