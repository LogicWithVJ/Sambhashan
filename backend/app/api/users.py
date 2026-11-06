from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.users import PublicUserResponse

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/{user_id}", response_model=PublicUserResponse)
def search_user(
    user_id: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    normalized_user_id = user_id.strip().upper()
    user = db.scalar(
        select(User).where(func.upper(User.user_id) == normalized_user_id)
    )
    if user is None:
        raise HTTPException(status_code=404, detail="No user found with that User ID.")
    return user
