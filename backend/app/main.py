from fastapi import FastAPI

from app.api.analytics import router as analytics_router
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.health import router as health_router

app = FastAPI(title='Reading Memory API', version='0.1.0')
app.include_router(health_router)
app.include_router(chat_router)
app.include_router(analytics_router)
app.include_router(auth_router)