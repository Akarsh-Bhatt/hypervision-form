from fastapi import APIRouter
from datetime import datetime, timezone
from app.schemas.common import HealthCheckResponse
from app.core.config import settings
from app.core.supabase import get_supabase_client

router = APIRouter()


@router.get("/health", response_model=HealthCheckResponse, tags=["Health"])
async def check_health():
    """
    Returns service health status, project metadata, and Supabase connectivity status.
    """
    client = get_supabase_client()
    supabase_connected = client is not None

    return HealthCheckResponse(
        status="healthy",
        project=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc),
        supabase_connected=supabase_connected
    )
