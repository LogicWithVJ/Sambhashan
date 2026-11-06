from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PublicUserResponse(BaseModel):
    user_id: str
    full_name: str
    profile_picture_url: str | None
    preferred_language: str | None
    country: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
