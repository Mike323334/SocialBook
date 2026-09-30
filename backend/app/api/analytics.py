import secrets
from functools import lru_cache
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from app.analytics.store import AnalyticsStore
from app.core.config import Settings, get_settings

router = APIRouter(prefix='/api/analytics', tags=['analytics'])


class AnalyticsEventRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    event: Literal['daily_visit', 'question', 'book_upload']
    visitor_id: UUID


class AnalyticsEventResponse(BaseModel):
    accepted: bool


class DailyMetric(BaseModel):
    date: date
    users: int
    questions: int
    books_uploaded: int


class AnalyticsReport(BaseModel):
    days: list[DailyMetric]


def get_analytics_store(settings: Settings = Depends(get_settings)) -> AnalyticsStore:
    database_location = (
        settings.supabase_database_url.get_secret_value()
        if settings.supabase_database_url is not None
        else settings.analytics_db_path
    )
    return _analytics_store_for_location(database_location)


@lru_cache(maxsize=4)
def _analytics_store_for_location(database_location: str) -> AnalyticsStore:
    return AnalyticsStore(database_location)


def require_analytics_admin(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = settings.analytics_admin_token
    if expected is None:
        raise HTTPException(status_code=503, detail='Analytics reporting is not configured.')
    if authorization is None or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Analytics admin token required.')
    supplied = authorization.removeprefix('Bearer ')
    if not secrets.compare_digest(supplied, expected.get_secret_value()):
        raise HTTPException(status_code=401, detail='Analytics admin token is invalid.')


@router.post('/events', response_model=AnalyticsEventResponse, status_code=202)
def record_analytics_event(
    request: AnalyticsEventRequest,
    store: AnalyticsStore = Depends(get_analytics_store),
) -> AnalyticsEventResponse:
    store.record_event(request.event, request.visitor_id)
    return AnalyticsEventResponse(accepted=True)


@router.get('/daily', response_model=AnalyticsReport, dependencies=[Depends(require_analytics_admin)])
def read_daily_analytics(
    days: int = Query(default=30, ge=1, le=90),
    store: AnalyticsStore = Depends(get_analytics_store),
) -> AnalyticsReport:
    end_day = datetime.now(timezone.utc).date()
    start_day = end_day - timedelta(days=days - 1)
    stored = {
        row['date']: row
        for row in store.get_daily_metrics(start_day, end_day)
    }
    report = [
        DailyMetric.model_validate(stored.get(
            (start_day + timedelta(days=offset)).isoformat(),
            {
                'date': (start_day + timedelta(days=offset)).isoformat(),
                'users': 0,
                'questions': 0,
                'books_uploaded': 0,
            },
        ))
        for offset in range(days)
    ]
    return AnalyticsReport(days=report)