
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.security import get_current_user, security_scheme

router = APIRouter(prefix="/forms", tags=["Forms"])


class FormCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)


class FormUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


async def get_supabase_response(
    method: str,
    endpoint: str,
    token: str,
    data: dict | None = None,
):
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.request(
            method,
            f"{settings.SUPABASE_URL}/rest/v1/{endpoint}",
            headers={
                "apikey": settings.SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            json=data,
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=response.status_code,
            detail="Unable to complete the form operation.",
        )

    return response.json()


@router.get("/")
async def get_forms(
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    forms = await get_supabase_response(
        "GET",
        f"forms?select=*&creator_id=eq.{current_user['id']}&order=updated_at.desc",
        credentials.credentials,
    )

    return {"success": True, "forms": forms}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_form(
    form: FormCreate,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    form_data = {
        "creator_id": current_user["id"],
        "shareable_slug": uuid4().hex,
        "title": form.title,
        "description": form.description,
        "status": "draft",
    }

    created_form = await get_supabase_response(
        "POST",
        "forms",
        credentials.credentials,
        form_data,
    )

    return {
        "success": True,
        "message": "Form created successfully.",
        "form": created_form[0] if created_form else None,
    }


@router.patch("/{form_id}")
async def update_form(
    form_id: str,
    form: FormUpdate,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    update_data = form.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(status_code=400, detail="No changes provided.")

    if "title" in update_data and update_data["title"] is not None:
        update_data["title"] = update_data["title"].strip()
        if not update_data["title"]:
            raise HTTPException(status_code=400, detail="Event name cannot be empty.")

    updated = await get_supabase_response(
        "PATCH",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}",
        credentials.credentials,
        update_data,
    )

    if not updated:
        raise HTTPException(status_code=404, detail="Event not found.")

    return {
        "success": True,
        "message": "Event updated successfully.",
        "form": updated[0],
    }


@router.delete("/{form_id}")
async def delete_form(
    form_id: str,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    token = credentials.credentials

    existing = await get_supabase_response(
        "GET",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}&select=id",
        token,
    )

    if not existing:
        raise HTTPException(status_code=404, detail="Event not found.")

    responses = await get_supabase_response(
        "GET",
        f"form_responses?form_id=eq.{form_id}&select=id&limit=1",
        token,
    )

    if responses:
        raise HTTPException(
            status_code=409,
            detail="This event has registrations. You cannot delete it until its responses are handled.",
        )

    await get_supabase_response(
        "DELETE",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}",
        token,
    )

    return {
        "success": True,
        "message": "Event deleted successfully.",
    }
