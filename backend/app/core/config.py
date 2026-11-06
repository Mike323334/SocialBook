from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )

    environment: str = 'development'

    # Main PostgreSQL database (Neon)
    database_url: SecretStr | None = None

    # Authentication
    jwt_secret: SecretStr | None = None
    jwt_expire_minutes: int = 60

    # AI configuration
    groq_api_key: SecretStr | None = None
    groq_model: str | None = None
    groq_api_url: str = 'https://api.groq.com/openai/v1/chat/completions'

    # Analytics administration
    analytics_admin_token: SecretStr | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()