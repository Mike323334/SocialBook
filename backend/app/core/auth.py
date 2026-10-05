from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models import User


SESSION_COOKIE = "reading-memory-session"


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    if settings.jwt_secret is None:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured.",
        )

    token = request.cookies.get(SESSION_COOKIE)

    if token is None:
        raise HTTPException(
            status_code=401,
            detail="Sign in to continue.",
        )

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=["HS256"],
        )

        user_id = UUID(payload["sub"])

    except (jwt.InvalidTokenError, KeyError, ValueError) as error:
        raise HTTPException(
            status_code=401,
            detail="Session is invalid or expired.",
        ) from error

    user = db.get(User, user_id)

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Account no longer exists.",
        )

    return user