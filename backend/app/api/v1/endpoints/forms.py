
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator

from app.core.config import settings
from app.core.security import get_current_user, security_scheme

router = APIRouter(prefix="/forms", tags=["Forms"])


class FormCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)


class FormUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class PublicAnswer(BaseModel):
    question_id: UUID
    answer_value: str | list | dict | int | float | bool | None


class PublicSubmission(BaseModel):
    sap_id: str = Field(min_length=1, max_length=100)
    answers: list[PublicAnswer] = Field(max_length=100)

    @field_validator("sap_id")
    @classmethod
    def validate_sap_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("SAP ID cannot be empty.")
        return value


async def get_supabase_response(
    method: str,
    endpoint: str,
    token: str,
    data: dict | list | None = None,
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
        "title": form.title.strip(),
        "description": form.description,
        "status": "draft",
    }

    if not form_data["title"]:
        raise HTTPException(status_code=400, detail="Event name cannot be empty.")

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


# Duplicate Form API
@router.post("/{form_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def duplicate_form(
    form_id: UUID,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    token = credentials.credentials

    # Fetch the original form and verify ownership.
    original_forms = await get_supabase_response(
        "GET",
        (
            f"forms?id=eq.{form_id}"
            f"&creator_id=eq.{current_user['id']}"
            "&select=*"
            "&limit=1"
        ),
        token,
    )

    if not original_forms:
        raise HTTPException(status_code=404, detail="Form not found.")

    original = original_forms[0]

    # Fetch all questions belonging to the original form.
    original_questions = await get_supabase_response(
        "GET",
        (
            f"form_questions?form_id=eq.{form_id}"
            "&select=field_key,question_type,label,description,"
            "order_index,is_required,validation_rules,options"
            "&order=order_index.asc"
        ),
        token,
    )

    # Create a new form with a fresh ID and shareable slug.
    new_form_data = {
        "creator_id": current_user["id"],
        "shareable_slug": uuid4().hex,
        "title": f"{original['title']} (Copy)",
        "description": original.get("description") or "",
        "status": "draft",
        "settings": original.get("settings") or {},
        "theme": original.get("theme") or {},
        "response_count": 0,
    }

    new_forms = await get_supabase_response(
        "POST",
        "forms",
        token,
        new_form_data,
    )

    if not new_forms:
        raise HTTPException(
            status_code=500,
            detail="Unable to create the duplicate form.",
        )

    new_form = new_forms[0]

    # Copy questions using new IDs and the new form ID.
    if original_questions:
        copied_questions = [
            {
                **question,
                "form_id": new_form["id"],
            }
            for question in original_questions
        ]

        try:
            await get_supabase_response(
                "POST",
                "form_questions",
                token,
                copied_questions,
            )
        except HTTPException:
            # Remove the new form if copying its questions fails.
            try:
                await get_supabase_response(
                    "DELETE",
                    (
                        f"forms?id=eq.{new_form['id']}"
                        f"&creator_id=eq.{current_user['id']}"
                    ),
                    token,
                )
            except HTTPException:
                pass

            raise HTTPException(
                status_code=500,
                detail="Unable to copy the form questions. Please try again.",
            )

    return {
        "success": True,
        "message": "Form duplicated successfully.",
        "form": new_form,
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


@router.get("/public/{slug}")
async def get_public_form(slug: str):
    if not slug or len(slug) > 100 or not slug.isalnum():
        raise HTTPException(status_code=400, detail="Invalid registration link.")

    token = settings.SUPABASE_ANON_KEY

    forms = await get_supabase_response(
        "GET",
        (
            "forms?select=id,title,description,settings,theme,shareable_slug"
            f"&shareable_slug=eq.{slug}"
            "&status=eq.published"
            "&limit=1"
        ),
        token,
    )

    if not forms:
        raise HTTPException(
            status_code=404,
            detail="This registration form is unavailable.",
        )

    form = forms[0]

    questions = await get_supabase_response(
        "GET",
        (
            "form_questions?select=id,field_key,question_type,label,"
            "description,order_index,is_required,validation_rules,options"
            f"&form_id=eq.{form['id']}"
            "&order=order_index.asc"
        ),
        token,
    )

    return {
        "success": True,
        "form": form,
        "questions": questions,
    }


@router.post("/public/{slug}/submit")
async def submit_public_response(
    slug: str,
    submission: PublicSubmission,
):
    if not slug or len(slug) > 100:
        raise HTTPException(status_code=400, detail="Invalid registration link.")

    payload = {
        "p_slug": slug,
        "p_sap_id": submission.sap_id,
        "p_answers": [
            {
                "question_id": str(answer.question_id),
                "answer_value": answer.answer_value,
            }
            for answer in submission.answers
        ],
    }

    service_key = settings.SUPABASE_SERVICE_ROLE_KEY

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{settings.SUPABASE_URL}/rest/v1/rpc/submit_public_response",
                headers={
                    "apikey": service_key,
                    "Authorization": f"Bearer {service_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

    except httpx.RequestError:
        raise HTTPException(
            status_code=503,
            detail="Registration service is temporarily unavailable.",
        )

    if response.status_code >= 400:
        try:
            error_data = response.json()
            error_message = str(error_data.get("message", "")).lower()
        except ValueError:
            error_message = ""

        if "duplicate" in error_message or "already registered" in error_message:
            raise HTTPException(
                status_code=409,
                detail="You have already registered for this event.",
            )

        if "not found" in error_message or "not published" in error_message:
            raise HTTPException(
                status_code=404,
                detail="This registration form is unavailable.",
            )

        if "required" in error_message:
            raise HTTPException(
                status_code=422,
                detail="Please complete all required questions.",
            )

        raise HTTPException(
            status_code=400,
            detail="Your registration could not be submitted. Please check your answers.",
        )

    return {
        "success": True,
        "message": "Your registration has been submitted successfully.",
        "response_id": response.json(),
    }


@router.get("/{form_id}/responses")
async def get_form_responses(
    form_id: str,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    token = credentials.credentials

    forms = await get_supabase_response(
        "GET",
        (
            f"forms?id=eq.{form_id}"
            f"&creator_id=eq.{current_user['id']}"
            "&select=id,title,description,status,response_count"
            "&limit=1"
        ),
        token,
    )

    if not forms:
        raise HTTPException(status_code=404, detail="Event not found.")

    responses = await get_supabase_response(
        "GET",
        (
            f"form_responses?form_id=eq.{form_id}"
            "&select=id,sap_id,submitted_at,completion_time_seconds"
            "&order=submitted_at.desc"
        ),
        token,
    )

    questions = await get_supabase_response(
        "GET",
        (
            f"form_questions?form_id=eq.{form_id}"
            "&select=id,label,question_type,order_index"
            "&order=order_index.asc"
        ),
        token,
    )

    answers = []

    if responses:
        response_ids = ",".join(response["id"] for response in responses)

        answers = await get_supabase_response(
            "GET",
            (
                "form_answers"
                f"?response_id=in.({response_ids})"
                "&select=response_id,question_id,answer_value"
            ),
            token,
        )

    answers_by_response = {}

    for answer in answers:
        response_id = answer["response_id"]
        answers_by_response.setdefault(response_id, []).append(answer)

    for response in responses:
        response["answers"] = answers_by_response.get(response["id"], [])

    return {
        "success": True,
        "form": forms[0],
        "questions": questions,
        "responses": responses,
    }
