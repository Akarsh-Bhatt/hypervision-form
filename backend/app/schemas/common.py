from typing import Optional, Any, Generic, TypeVar
from pydantic import BaseModel
from datetime import datetime

DataT = TypeVar("DataT")


class HealthCheckResponse(BaseModel):
    status: str
    project: str
    version: str
    environment: str
    timestamp: datetime
    supabase_connected: bool


class StandardResponse(BaseModel, Generic[DataT]):
    success: bool
    data: Optional[DataT] = None
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    detail: Optional[Any] = None
