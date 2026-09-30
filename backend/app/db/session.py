from collections.abc import Generator
from functools import lru_cache

from fastapi import Depends, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings


@lru_cache(maxsize=2)
def get_engine(database_url: str) -> Engine:
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql+psycopg://', 1)
    elif database_url.startswith('postgresql://'):
        database_url = database_url.replace('postgresql://', 'postgresql+psycopg://', 1)
    return create_engine(database_url, pool_pre_ping=True, pool_size=2, max_overflow=3)


def get_db(settings: Settings = Depends(get_settings)) -> Generator[Session, None, None]:
    if settings.database_url is None:
        raise HTTPException(status_code=503, detail='Social features require DATABASE_URL configuration.')

    with Session(get_engine(settings.database_url.get_secret_value())) as session:
        yield session