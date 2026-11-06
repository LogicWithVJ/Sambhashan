from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

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
