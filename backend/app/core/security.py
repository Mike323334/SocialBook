import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from fastapi import HTTPException

from app.core.config import Settings


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode('utf-8'), salt=salt, n=2**14, r=8, p=1, dklen=32)
    salt_encoded = base64.urlsafe_b64encode(salt).decode('ascii')
    digest_encoded = base64.urlsafe_b64encode(digest).decode('ascii')
    return f'scrypt$16384$8$1${salt_encoded}${digest_encoded}'


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n_value, r_value, p_value, salt_value, digest_value = encoded.split('$')
        if algorithm != 'scrypt':
            return False
        salt = base64.urlsafe_b64decode(salt_value)
        expected = base64.urlsafe_b64decode(digest_value)
        actual = hashlib.scrypt(
            password.encode('utf-8'),
            salt=salt,
            n=int(n_value),
            r=int(r_value),
            p=int(p_value),
            dklen=len(expected),
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_session_token(user_id: UUID, settings: Settings) -> str:
    if settings.jwt_secret is None:
        raise HTTPException(status_code=503, detail='Authentication is not configured.')
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {'sub': str(user_id), 'exp': expires_at},
        settings.jwt_secret.get_secret_value(),
        algorithm='HS256',
    )