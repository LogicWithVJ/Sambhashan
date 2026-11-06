from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.auth import router as auth_router
from app.api.calls import router as calls_router
from app.api.users import router as users_router
from app.core.config import get_settings
from app.core.database import Base, create_database_engine
from app.models.user import User  # noqa: F401 - register model metadata
from app.models.call import CallRecord  # noqa: F401 - register model metadata
from app.realtime import create_socket_app


def create_app(database_url: str | None = None) -> FastAPI:
    settings = get_settings()
    engine = create_database_engine(database_url or settings.database_url)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        Base.metadata.create_all(bind=engine)
        yield
        engine.dispose()

    app = FastAPI(title="Sambhashan API", lifespan=lifespan)
    from sqlalchemy.orm import sessionmaker

    app.state.session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )
    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(calls_router)

    @app.get("/api/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


api_app = create_app()
app = create_socket_app(api_app)
