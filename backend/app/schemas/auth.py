from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, field_validator

from app.services.auth import normalize_mobile


class RegistrationRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    mobile_number: str = Field(min_length=6, max_length=24)
    password: str = Field(min_length=8, max_length=128)
    email: EmailStr | None = None

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Full name is required.")
        return value

    @field_validator("mobile_number")
    @classmethod
    def validate_mobile_number(cls, value: str) -> str:
        try:
            return normalize_mobile(value)
        except ValueError as exc:
            raise ValueError("Enter a valid mobile number.") from exc


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class RegistrationResponse(BaseModel):
    user_id: str
    full_name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    user_id: str
    full_name: str
    mobile_number: str
    email: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MobileSessionResponse(UserResponse):
    access_token: str
    token_type: str = "bearer"


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    profile_picture_url: HttpUrl | None = None
    preferred_language: str | None = Field(default=None, max_length=64)
    country: str | None = Field(default=None, max_length=100)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Full name cannot be empty.")
        return value

    @field_validator("preferred_language", "country")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class ProfileResponse(BaseModel):
    user_id: str
    full_name: str
    mobile_number: str
    email: str | None
    profile_picture_url: str | None
    preferred_language: str | None
    country: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
