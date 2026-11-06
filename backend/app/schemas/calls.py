from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CallHistoryResponse(BaseModel):
    call_id: str
    caller_user_id: str
    receiver_user_id: str
    call_type: str
    status: str
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None
    duration_seconds: int

    model_config = ConfigDict(from_attributes=True)
