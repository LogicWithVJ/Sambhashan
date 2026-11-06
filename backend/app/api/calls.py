from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.call import CallRecord
from app.models.user import User
from app.schemas.calls import CallHistoryResponse

router = APIRouter(prefix="/api/calls", tags=["calls"])


@router.get("/history", response_model=list[CallHistoryResponse])
def call_history(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CallRecord]:
    return list(
        db.scalars(
            select(CallRecord)
            .where(
                or_(
                    CallRecord.caller_user_id == user.user_id,
                    CallRecord.receiver_user_id == user.user_id,
                )
            )
            .order_by(CallRecord.created_at.desc())
            .limit(50)
        )
    )
