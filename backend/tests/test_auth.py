import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.auth import get_db
from app.core.config import Settings, get_settings
from app.db.base import Base
from app.main import app
from app.models import Profile, User


@pytest.fixture
def auth_client():
    engine = create_engine(
        'sqlite+pysqlite:///:memory:',
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    settings = Settings(_env_file=None, jwt_secret='test-signing-secret')

    def override_db():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_register_creates_account_and_profile_then_allows_logout(auth_client: TestClient) -> None:
    response = auth_client.post('/api/auth/register', json={
        'email': ' Reader@Example.test ',
        'username': 'Reader_One',
        'display_name': 'Reader One',
        'password': 'a-long-test-password',
    })

    assert response.status_code == 201
    assert response.json()['username'] == 'reader_one'
    assert response.headers['set-cookie'].startswith('reading-memory-session=')
    assert auth_client.get('/api/auth/me').json()['email'] == 'reader@example.test'

    logout = auth_client.post('/api/auth/logout')
    assert logout.status_code == 204


def test_registration_requires_unique_username_and_rejects_client_user_id(auth_client: TestClient) -> None:
    body = {
        'email': 'reader@example.test',
        'username': 'reader_one',
        'display_name': 'Reader One',
        'password': 'a-long-test-password',
    }
    assert auth_client.post('/api/auth/register', json=body).status_code == 201

    duplicate = {**body, 'email': 'other@example.test'}
    assert auth_client.post('/api/auth/register', json=duplicate).status_code == 409

    forged = {**body, 'email': 'third@example.test', 'username': 'reader_three', 'user_id': 'other-user'}
    assert auth_client.post('/api/auth/register', json=forged).status_code == 422


def test_login_rejects_wrong_password(auth_client: TestClient) -> None:
    auth_client.post('/api/auth/register', json={
        'email': 'reader@example.test',
        'username': 'reader_one',
        'display_name': 'Reader One',
        'password': 'a-long-test-password',
    })
    response = auth_client.post('/api/auth/login', json={
        'email': 'reader@example.test',
        'password': 'incorrect-password',
    })

    assert response.status_code == 401