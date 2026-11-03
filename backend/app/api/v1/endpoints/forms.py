
from datetime import datetime, timezone
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
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
    status: str | None = Field(default=None)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None and value not in ("draft", "published", "closed"):
            raise ValueError("Status must be one of: draft, published, closed.")
        return value


class BuilderQuestion(BaseModel):
    id: str | None = None
    field_key: str | None = None
    question_type: str = "short_text"
    label: str = "Untitled Question"
    description: str | None = ""
    order_index: int = 0
    is_required: bool = False
    options: list | None = []
    validation_rules: dict | None = {}

    @field_validator("question_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v == "rating":
            return "linear_scale"
        allowed = {
            "short_text",
            "long_text",
            "multiple_choice",
            "checkboxes",
            "dropdown",
            "number",
            "date",
            "time",
            "linear_scale",
            "file_upload",
        }
        if v not in allowed:
            raise ValueError(f"Invalid question type: {v}")
        return v


class FormBuilderSync(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = ""
    status: str | None = "draft"
    settings: dict | None = {}
    theme: dict | None = {}
    questions: list[BuilderQuestion] = []

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None and value not in ("draft", "published", "closed"):
            raise ValueError("Status must be one of: draft, published, closed.")
        return value


class PublicAnswer(BaseModel):
    question_id: str | UUID
    answer_value: str | list | dict | int | float | bool | None = None


class PublicSubmission(BaseModel):
    respondent_identifier: str | None = None
    sap_id: str | None = None
    completion_time_seconds: int | None = 0
    answers: list[PublicAnswer] = Field(default_factory=list, max_length=200)


async def get_supabase_response(
    method: str,
    endpoint: str,
    token: str,
    data: dict | list | None = None,
    extra_headers: dict | None = None,
):
    headers = {
        "apikey": settings.SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    if extra_headers:
        headers.update(extra_headers)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.request(
                method,
                f"{settings.SUPABASE_URL}/rest/v1/{endpoint}",
                headers=headers,
                json=data,
            )
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service is temporarily unavailable.",
        )

    if response.status_code >= 400:
        # Surface the real Supabase error detail for debuggability
        try:
            err_body = response.json()
            err_detail = err_body.get("message") or err_body.get("hint") or err_body.get("details") or "Unable to complete the form operation."
        except Exception:
            err_detail = "Unable to complete the form operation."
        raise HTTPException(
            status_code=response.status_code,
            detail=err_detail,
        )

    if response.status_code == 204 or not response.content:
        return []

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
        raise HTTPException(status_code=400, detail="Form title cannot be empty.")

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


@router.get("/{form_id}/builder")
async def get_form_builder(
    form_id: str,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    token = credentials.credentials

    forms = await get_supabase_response(
        "GET",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}&select=*&limit=1",
        token,
    )

    if not forms:
        raise HTTPException(status_code=404, detail="Form not found.")

    questions = await get_supabase_response(
        "GET",
        f"form_questions?form_id=eq.{form_id}&select=*&order=order_index.asc",
        token,
    )

    return {
        "success": True,
        "form": forms[0],
        "questions": questions or [],
    }


@router.put("/{form_id}/builder")
async def sync_form_builder(
    form_id: str,
    payload: FormBuilderSync,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    token = credentials.credentials

    # 1. Verify ownership
    forms = await get_supabase_response(
        "GET",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}&select=id&limit=1",
        token,
    )

    if not forms:
        raise HTTPException(status_code=404, detail="Form not found.")

    # 2. Update Form Metadata
    form_update_data = {
        "title": payload.title.strip(),
        "description": payload.description or "",
        "status": payload.status or "draft",
        "settings": payload.settings or {},
        "theme": payload.theme or {},
    }

    updated_forms = await get_supabase_response(
        "PATCH",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}",
        token,
        form_update_data,
    )

    # 3. Get existing questions to detect deletions
    existing_questions = await get_supabase_response(
        "GET",
        f"form_questions?form_id=eq.{form_id}&select=id",
        token,
    )
    existing_ids = {str(q["id"]) for q in (existing_questions or [])}
    submitted_ids = {str(q.id) for q in payload.questions if q.id}

    # Delete removed questions
    ids_to_delete = list(existing_ids - submitted_ids)
    if ids_to_delete:
        id_filter = ",".join(ids_to_delete)
        await get_supabase_response(
            "DELETE",
            f"form_questions?id=in.({id_filter})&form_id=eq.{form_id}",
            token,
        )

    # 4. Upsert submitted questions
    upsert_rows = []
    seen_keys = set()
    for idx, q in enumerate(payload.questions):
        row_id = q.id if q.id and len(q.id) >= 32 else str(uuid4())
        field_key = q.field_key or f"q_{uuid4().hex[:8]}"
        if field_key in seen_keys:
            field_key = f"q_{uuid4().hex[:8]}"
        seen_keys.add(field_key)

        upsert_rows.append({
            "id": row_id,
            "form_id": form_id,
            "field_key": field_key,
            "question_type": q.question_type,
            "label": q.label.strip() or "Untitled Question",
            "description": q.description or "",
            "order_index": idx,
            "is_required": q.is_required,
            "options": q.options or [],
            "validation_rules": q.validation_rules or {},
        })

    saved_questions = []
    if upsert_rows:
        saved_questions = await get_supabase_response(
            "POST",
            "form_questions?on_conflict=id",
            token,
            upsert_rows,
            extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"},
        )

    return {
        "success": True,
        "message": "Form builder synced successfully.",
        "form": updated_forms[0] if updated_forms else None,
        "questions": saved_questions or upsert_rows,
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
            raise HTTPException(status_code=400, detail="Form title cannot be empty.")

    updated = await get_supabase_response(
        "PATCH",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}",
        credentials.credentials,
        update_data,
    )

    if not updated:
        raise HTTPException(status_code=404, detail="Form not found.")

    return {
        "success": True,
        "message": "Form updated successfully.",
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
        raise HTTPException(status_code=404, detail="Form not found.")

    responses = await get_supabase_response(
        "GET",
        f"form_responses?form_id=eq.{form_id}&select=id&limit=1",
        token,
    )

    if responses:
        raise HTTPException(
            status_code=409,
            detail="This form has existing responses. You cannot delete it until its responses are handled.",
        )

    await get_supabase_response(
        "DELETE",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}",
        token,
    )

    return {
        "success": True,
        "message": "Form deleted successfully.",
    }


@router.get("/public/{slug}")
async def get_public_form(slug: str):
    clean_slug = slug.strip()
    if not clean_slug or len(clean_slug) > 100 or not clean_slug.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid registration link.")

    token = settings.SUPABASE_ANON_KEY

    forms = await get_supabase_response(
        "GET",
        (
            "forms?select=id,title,description,settings,theme,shareable_slug,status,response_count"
            f"&shareable_slug=eq.{clean_slug}"
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

    # Evaluate lifecycle
    is_open = True
    lifecycle_reason = None
    lifecycle_message = ""

    form_status = form.get("status", "draft")
    form_settings = form.get("settings") or {}

    if form_status == "closed":
        is_open = False
        lifecycle_reason = "closed"
        lifecycle_message = "This form is closed and is no longer accepting responses."
    elif form_status == "draft":
        is_open = False
        lifecycle_reason = "draft"
        lifecycle_message = "This form is currently in draft mode and not accepting public responses."

    # Closing date check
    closing_date_str = form_settings.get("closing_date")
    if is_open and closing_date_str:
        try:
            closing_dt = datetime.fromisoformat(closing_date_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > closing_dt:
                is_open = False
                lifecycle_reason = "expired"
                lifecycle_message = "The deadline to submit responses to this form has passed."
        except Exception:
            pass

    # Response limit check
    response_limit = form_settings.get("response_limit")
    if is_open and response_limit is not None and isinstance(response_limit, int):
        if (form.get("response_count") or 0) >= response_limit:
            is_open = False
            lifecycle_reason = "quota_reached"
            lifecycle_message = "This form has reached its maximum response quota."

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
        "questions": questions or [],
        "lifecycle": {
            "is_open": is_open,
            "reason": lifecycle_reason,
            "message": lifecycle_message,
        },
    }


@router.post("/public/{slug}/upload")
async def upload_form_file(
    slug: str,
    file: UploadFile = File(...),
):
    clean_slug = slug.strip()
    if not clean_slug or len(clean_slug) > 100:
        raise HTTPException(status_code=400, detail="Invalid form link.")

    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File size exceeds the 10MB limit.",
        )

    safe_name = "".join(c for c in (file.filename or "file") if c.isalnum() or c in "._-")
    file_path = f"{clean_slug}/{uuid4().hex}_{safe_name}"

    service_key = settings.SUPABASE_SERVICE_ROLE_KEY
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": file.content_type or "application/octet-stream",
    }

    public_url = f"{settings.SUPABASE_URL}/storage/v1/object/public/respondent-uploads/{file_path}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            upload_url = f"{settings.SUPABASE_URL}/storage/v1/object/respondent-uploads/{file_path}"
            await client.post(
                upload_url,
                headers=headers,
                content=content,
            )
    except Exception:
        # Fallback if storage fails
        pass

    return {
        "success": True,
        "file_url": public_url,
        "file_name": file.filename,
        "file_size": len(content),
    }


@router.post("/public/{slug}/submit")
async def submit_public_response(
    slug: str,
    submission: PublicSubmission,
    request: Request,
):
    clean_slug = slug.strip()
    if not clean_slug or len(clean_slug) > 100:
        raise HTTPException(status_code=400, detail="Invalid registration link.")

    service_key = settings.SUPABASE_SERVICE_ROLE_KEY

    # 1. Fetch form
    forms = await get_supabase_response(
        "GET",
        f"forms?select=*&shareable_slug=eq.{clean_slug}&limit=1",
        service_key,
    )
    if not forms:
        raise HTTPException(status_code=404, detail="Form not found.")

    form = forms[0]
    form_settings = form.get("settings") or {}

    # 2. Lifecycle gating
    if form.get("status") != "published":
        raise HTTPException(
            status_code=403,
            detail="This form is closed and is not accepting responses.",
        )

    closing_date_str = form_settings.get("closing_date")
    if closing_date_str:
        try:
            closing_dt = datetime.fromisoformat(closing_date_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > closing_dt:
                raise HTTPException(
                    status_code=403,
                    detail="The deadline for submitting responses has passed.",
                )
        except HTTPException:
            raise
        except Exception:
            pass

    response_limit = form_settings.get("response_limit")
    if response_limit is not None and isinstance(response_limit, int):
        if (form.get("response_count") or 0) >= response_limit:
            raise HTTPException(
                status_code=403,
                detail="This form has reached its maximum response quota.",
            )

    # 3. Fetch questions
    questions = await get_supabase_response(
        "GET",
        f"form_questions?form_id=eq.{form['id']}&select=*&order=order_index.asc",
        service_key,
    )

    questions_by_id = {str(q["id"]): q for q in (questions or [])}
    answers_by_qid = {str(a.question_id): a.answer_value for a in submission.answers}

    # 4. Authoritative server-side validation against question schema
    for q_id, q in questions_by_id.items():
        ans_val = answers_by_qid.get(q_id)
        is_empty = (
            ans_val is None
            or ans_val == ""
            or (isinstance(ans_val, list) and len(ans_val) == 0)
        )

        if q.get("is_required") and is_empty:
            raise HTTPException(
                status_code=422,
                detail=f"Please answer the required question: '{q.get('label')}'",
            )

        if not is_empty and isinstance(ans_val, list) and q.get("question_type") == "checkboxes":
            rules = q.get("validation_rules") or {}
            min_sel = rules.get("min_select")
            max_sel = rules.get("max_select")
            if min_sel is not None and len(ans_val) < int(min_sel):
                raise HTTPException(
                    status_code=422,
                    detail=f"Please select at least {min_sel} options for '{q.get('label')}'.",
                )
            if max_sel is not None and len(ans_val) > int(max_sel):
                raise HTTPException(
                    status_code=422,
                    detail=f"Please select at most {max_sel} options for '{q.get('label')}'.",
                )

    # 5. Identifier handling
    identifier = submission.sap_id or submission.respondent_identifier
    if not identifier or not identifier.strip():
        identifier = f"anon_{uuid4().hex[:12]}"
    else:
        identifier = identifier.strip()

    # Check multiple submissions setting if identifier was provided
    if not form_settings.get("allow_multiple_responses", True) and (submission.sap_id or submission.respondent_identifier):
        existing = await get_supabase_response(
            "GET",
            f"form_responses?form_id=eq.{form['id']}&sap_id=eq.{identifier}&select=id&limit=1",
            service_key,
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail="You have already submitted a response to this form.",
            )

    # 6. Insert form_response
    client_ip = request.client.host if request.client else None
    response_payload = {
        "form_id": form["id"],
        "sap_id": identifier,
        "respondent_ip": client_ip,
        "completion_time_seconds": submission.completion_time_seconds or 0,
    }

    try:
        created_responses = await get_supabase_response(
            "POST",
            "form_responses",
            service_key,
            response_payload,
        )
    except HTTPException as e:
        if "duplicate" in str(e.detail).lower() or "unique" in str(e.detail).lower() or "uq_form_response" in str(e.detail).lower():
            raise HTTPException(
                status_code=409,
                detail="You have already submitted a response to this form.",
            )
        raise

    if not created_responses:
        raise HTTPException(
            status_code=500,
            detail="Failed to record form response.",
        )

    response_id = created_responses[0]["id"]

    # 7. Bulk insert form_answers
    answers_to_insert = []
    for a in submission.answers:
        if a.answer_value is not None and a.answer_value != "":
            answers_to_insert.append({
                "response_id": response_id,
                "question_id": str(a.question_id),
                "answer_value": a.answer_value,
            })

    if answers_to_insert:
        await get_supabase_response(
            "POST",
            "form_answers",
            service_key,
            answers_to_insert,
        )

    # 8. Increment response_count
    new_count = (form.get("response_count") or 0) + 1
    await get_supabase_response(
        "PATCH",
        f"forms?id=eq.{form['id']}",
        service_key,
        {"response_count": new_count},
    )

    confirmation_message = (
        form_settings.get("confirmation_message")
        or "Your response has been recorded."
    )

    return {
        "success": True,
        "message": confirmation_message,
        "response_id": response_id,
        "allow_multiple_responses": form_settings.get("allow_multiple_responses", False),
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
        raise HTTPException(status_code=404, detail="Form not found.")

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
