from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.analytics import router as analytics_router
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.health import router as health_router
from app.routers.memory import router as memory_router
from app.routers.publications import router as publications_router



app = FastAPI(
    title='Reading Memory API',
    version='0.1.0',
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://socialbook-ayg8.onrender.com',
    ],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


# ============================================================
# ROUTERS
# ============================================================

app.include_router(health_router)
app.include_router(chat_router)
app.include_router(analytics_router)
app.include_router(auth_router)
app.include_router(memory_router)
app.include_router(publications_router)



# ============================================================
# OPTIONAL STATIC FRONTEND
# ============================================================

# static_directory = Path(__file__).resolve().parents[1] / 'static'
#
# if static_directory.is_dir():
#     app.mount(
#         '/',
#         StaticFiles(
#             directory=static_directory,
#             html=True,
#         ),
#         name='frontend',
#     )