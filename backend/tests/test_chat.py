from fastapi.testclient import TestClient

from app.api import chat as chat_api
from app.core.config import Settings, get_settings
from app.main import app

client = TestClient(app)


def test_chat_with_no_retrieved_context_returns_insufficient_evidence() -> None:
    response = client.post('/api/chat', json={'question': 'What is this about?', 'context': []})

    assert response.status_code == 200
    assert 'enough relevant text' in response.json()['answer']
    assert response.json()['citations'] == []


def test_chat_reports_missing_groq_configuration() -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None)
    try:
        response = client.post('/api/chat', json={
            'question': 'What does the author say about memory?',
            'context': [{
                'document_id': 'book-1',
                'title': 'Test book',
                'page_number': 1,
                'text': 'The author describes memory as shaped by attention.',
                'score': 0.9,
            }],
        })
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert 'GROQ_API_KEY' in response.json()['detail']


def test_chat_rejects_context_over_budget() -> None:
    response = client.post('/api/chat', json={
        'question': 'Explain this passage.',
        'context': [{
            'document_id': 'book-1',
            'title': 'Test book',
            'page_number': index + 1,
            'text': 'x' * 3000,
            'score': 0.5,
        } for index in range(4)],
    })

    assert response.status_code == 422


def test_chat_rejects_imported_chat_context() -> None:
    response = client.post('/api/chat', json={
        'question': 'How does my past opinion relate to this passage?',
        'context': [{
            'source_type': 'imported_chat',
            'document_id': 'book-1',
            'title': 'My view of the book',
            'category': 'book_opinion',
            'page_number': None,
            'text': 'User: I think memory is involuntary.',
            'score': 0.8,
        }],
    })

    assert response.status_code == 422