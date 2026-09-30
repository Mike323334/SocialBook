from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app

client = TestClient(app)


def test_health_endpoint_reports_ok() -> None:
    response = client.get('/api/health')

    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}


def test_settings_allow_missing_ai_credentials() -> None:
    settings = Settings(_env_file=None)

    assert settings.groq_api_key is None
    assert settings.groq_model is None