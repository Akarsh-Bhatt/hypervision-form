from fastapi import APIRouter, Depends

from app.core.security import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/me")
async def get_authenticated_user(
    current_user: dict = Depends(get_current_user),
):
    return {
        "success": True,
        "message": "Authentication successful",
        "user": {
            "id": current_user.get("id"),
            "email": current_user.get("email"),
        },
    }
