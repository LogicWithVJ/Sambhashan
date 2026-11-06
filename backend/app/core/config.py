from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./linguaconnect.db"
    secret_key: str = "local-development-only-change-this-secret"
    access_token_expire_minutes: int = 60
    session_cookie_name: str = "linguaconnect_session"
    cookie_secure: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
