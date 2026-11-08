from datetime import datetime, timedelta, timezone
import secrets

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jwt import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    MobileSessionResponse,
    ProfileResponse,
    ProfileUpdateRequest,
    RegistrationRequest,
    RegistrationResponse,
    UserResponse,
)
from app.services.auth import hash_password, normalize_mobile, verify_password

router = APIRouter(prefix="/api/auth", tags=["authentication"])
settings = get_settings()


def _create_access_token(user_id: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    return jwt.encode(
        {"sub": user_id, "exp": expires_at},
        settings.secret_key,
        algorithm="HS256",
    )


def _set_session_cookie(response: Response, user_id: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=_create_access_token(user_id),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    authorization = request.headers.get("Authorization", "")
    if authorization:
        scheme, _, credentials = authorization.partition(" ")
        if scheme.lower() != "bearer" or not credentials.strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="A valid bearer token is required.",
            )
        token = credentials.strip()
    else:
        token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please sign in to continue.",
        )

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not isinstance(user_id, str):
            raise InvalidTokenError("Invalid subject")
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session is invalid or has expired. Please sign in again.",
        ) from exc

    user = db.scalar(select(User).where(User.user_id == user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your account could not be found. Please sign in again.",
        )
    return user


@router.post(
    "/register",
    response_model=RegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(payload: RegistrationRequest, db: Session = Depends(get_db)) -> User:
    mobile_number = normalize_mobile(payload.mobile_number)
    if db.scalar(select(User.id).where(User.mobile_number == mobile_number)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This mobile number is already registered.",
        )

    user = User(
        user_id=f"LC{secrets.token_hex(5).upper()}",
        full_name=payload.full_name.strip(),
        mobile_number=mobile_number,
        email=payload.email.strip() if payload.email else None,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if db.scalar(select(User.id).where(User.mobile_number == mobile_number)) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This mobile number is already registered.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not create the account. Please try again.",
        ) from exc
    db.refresh(user)
    return user


@router.post("/login", response_model=UserResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> User:
    identifier = payload.identifier.strip()
    if identifier.upper().startswith("LC"):
        user = db.scalar(select(User).where(User.user_id == identifier.upper()))
    else:
        try:
            mobile_number = normalize_mobile(identifier)
        except ValueError:
            user = None
        else:
            user = db.scalar(select(User).where(User.mobile_number == mobile_number))

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect mobile number/User ID or password.",
        )

    _set_session_cookie(response, user.user_id)
    return user


@router.post("/mobile-login", response_model=MobileSessionResponse)
def mobile_login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    identifier = payload.identifier.strip()
    if identifier.upper().startswith("LC"):
        user = db.scalar(select(User).where(User.user_id == identifier.upper()))
    else:
        try:
            mobile_number = normalize_mobile(identifier)
        except ValueError:
            user = None
        else:
            user = db.scalar(select(User).where(User.mobile_number == mobile_number))

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect mobile number/User ID or password.",
        )

    user_response = UserResponse.model_validate(user).model_dump()
    return {
        **user_response,
        "access_token": _create_access_token(user.user_id),
        "token_type": "bearer",
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> Response:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserResponse)
def read_current_user(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/profile", response_model=ProfileResponse)
def read_profile(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/profile", response_model=ProfileResponse)
def update_profile(
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    updates = payload.model_dump(exclude_unset=True)
    if "profile_picture_url" in updates and updates["profile_picture_url"] is not None:
        updates["profile_picture_url"] = str(updates["profile_picture_url"])
    for field, value in updates.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user
