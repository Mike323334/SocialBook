import re
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.security import create_session_token, hash_password, verify_password
from app.db.session import get_db
from app.models import Profile, User


router = APIRouter(
    prefix="/api/auth",
    tags=["authentication"],
)

session_cookie = "reading-memory-session"


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=5, max_length=320)
    username: str = Field(min_length=3, max_length=32)
    display_name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()

        if normalized.count("@") != 1 or "." not in normalized.rsplit("@", 1)[1]:
            raise ValueError("Enter a valid email address.")

        return normalized

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        normalized = value.strip().lower()

        if not re.fullmatch(r"[a-z0-9_]{3,32}", normalized):
            raise ValueError(
                "Username must use 3-32 letters, numbers, or underscores."
            )

        return normalized

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        return value.strip()


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class AccountResponse(BaseModel):
    id: UUID
    email: str
    username: str
    display_name: str


def set_session_cookie(
    response: Response,
    user_id: UUID,
    settings: Settings,
) -> None:
    response.set_cookie(
        key=session_cookie,
        value=create_session_token(user_id, settings),
        max_age=settings.jwt_expire_minutes * 60,
        httponly=True,
        secure=settings.environment.lower() not in {"development", "test"},
        samesite="lax",
        path="/",
    )


def account_response(
    user: User,
    profile: Profile,
) -> AccountResponse:
    return AccountResponse(
        id=user.id,
        email=user.email,
        username=profile.username,
        display_name=profile.display_name,
    )


@router.post(
    "/register",
    response_model=AccountResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    request: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AccountResponse:
    if settings.jwt_secret is None:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured.",
        )

    existing = db.scalar(
        select(User.id)
        .outerjoin(Profile, Profile.user_id == User.id)
        .where(
            or_(
                User.email == request.email,
                Profile.username == request.username,
            )
        )
    )

    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="Email or username is already in use.",
        )

    user = User(
        email=request.email,
        password_hash=hash_password(request.password),
    )

    db.add(user)
    db.flush()

    profile = Profile(
        user_id=user.id,
        username=request.username,
        display_name=request.display_name,
    )

    db.add(profile)

    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Email or username is already in use.",
        ) from error

    db.refresh(user)
    db.refresh(profile)

    set_session_cookie(
        response,
        user.id,
        settings,
    )

    return account_response(user, profile)


@router.post(
    "/login",
    response_model=AccountResponse,
)
def login(
    request: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AccountResponse:
    if settings.jwt_secret is None:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured.",
        )

    user = db.scalar(
        select(User).where(User.email == request.email)
    )

    if user is None or not verify_password(
        request.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=401,
            detail="Email or password is incorrect.",
        )

    profile = db.scalar(
        select(Profile).where(Profile.user_id == user.id)
    )

    if profile is None:
        raise HTTPException(
            status_code=409,
            detail="Account profile is missing.",
        )

    set_session_cookie(
        response,
        user.id,
        settings,
    )

    return account_response(user, profile)


@router.get(
    "/me",
    response_model=AccountResponse,
)
def current_account(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AccountResponse:
    if settings.jwt_secret is None:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured.",
        )

    token = request.cookies.get(session_cookie)

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

    profile = db.scalar(
        select(Profile).where(Profile.user_id == user_id)
    )

    if user is None or profile is None:
        raise HTTPException(
            status_code=401,
            detail="Account no longer exists.",
        )

    return account_response(user, profile)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
def logout(response: Response) -> None:
    response.delete_cookie(
        key=session_cookie,
        path="/",
        httponly=True,
        samesite="lax",
    )   