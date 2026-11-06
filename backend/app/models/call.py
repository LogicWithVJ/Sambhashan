from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CallRecord(Base):
    __tablename__ = "call_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    call_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    caller_user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), index=True)
    receiver_user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), index=True)
    call_type: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
