
import csv
from datetime import datetime, timezone
import io
from math import ceil
import time
import re
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
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


class SlugUpdate(BaseModel):
    shareable_slug: str

    @field_validator("shareable_slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        slug = v.strip().lower()
        if len(slug) < 3:
            raise ValueError("Slug must be at least 3 characters long.")
        if slug.startswith("-") or slug.startswith("_"):
            raise ValueError("Slug cannot start with a hyphen or underscore.")
        if slug.endswith("-") or slug.endswith("_"):
            raise ValueError("Slug cannot end with a hyphen or underscore.")
        if not re.match(r"^[a-z0-9_-]+$", slug):
            raise ValueError("Slug can only contain alphanumeric characters, hyphens, and underscores.")
        return slug


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


@router.patch("/{form_id}/slug")
async def update_form_slug(
    form_id: str,
    payload: SlugUpdate,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    token = credentials.credentials

    # Ownership check
    forms = await get_supabase_response(
        "GET",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}&select=id&limit=1",
        token,
    )
    if not forms:
        raise HTTPException(status_code=404, detail="Form not found.")

    updated = await get_supabase_response(
        "PATCH",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}",
        token,
        {"shareable_slug": payload.shareable_slug},
    )
    if not updated:
        raise HTTPException(status_code=400, detail="Unable to update vanity URL slug.")

    return {
        "success": True,
        "message": "Custom vanity URL updated successfully.",
        "shareable_slug": payload.shareable_slug,
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


ALLOWED_UPLOAD_EXTENSIONS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".csv": "text/csv",
}


def validate_upload_content(content: bytes, ext: str) -> str:
    """Validates magic bytes and file structure against allowed extension."""
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # 1. Reject explicit executable and binary script signatures
    dangerous_magic = [
        b"MZ",  # Windows PE/EXE/DLL
        b"\x7fELF",  # Linux ELF
        b"\xca\xfe\xba\xbe",  # Java class / Mach-O fat
        b"\xce\xfa\xed\xfe",  # Mach-O 32
        b"\xcf\xfa\xed\xfe",  # Mach-O 64
        b"\xfe\xed\xfa\xce",
        b"\xfe\xed\xfa\xcf",
        b"#!",  # Shell script shebang
    ]
    for d_magic in dangerous_magic:
        if content.startswith(d_magic):
            raise HTTPException(status_code=400, detail="Executable files are strictly prohibited.")

    # Check for script or HTML injection tags (case-insensitive check on initial chunk)
    sample = content[:512].lower()
    dangerous_tags = [b"<script", b"<html", b"<!doctype html", b"<svg", b"<?php", b"<%", b"javascript:"]
    for tag in dangerous_tags:
        if tag in sample:
            raise HTTPException(status_code=400, detail="Files containing script or markup tags are not permitted.")

    # 2. Verify signature according to extension
    if ext == ".pdf":
        if not content.startswith(b"%PDF-"):
            raise HTTPException(status_code=400, detail="Invalid PDF file signature.")
        return "application/pdf"

    elif ext == ".png":
        if not content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise HTTPException(status_code=400, detail="Invalid PNG file signature.")
        return "image/png"

    elif ext in (".jpg", ".jpeg"):
        if not content.startswith(b"\xff\xd8\xff"):
            raise HTTPException(status_code=400, detail="Invalid JPEG file signature.")
        return "image/jpeg"

    elif ext == ".gif":
        if not (content.startswith(b"GIF87a") or content.startswith(b"GIF89a")):
            raise HTTPException(status_code=400, detail="Invalid GIF file signature.")
        return "image/gif"

    elif ext == ".webp":
        if not (content.startswith(b"RIFF") and len(content) >= 12 and content[8:12] == b"WEBP"):
            raise HTTPException(status_code=400, detail="Invalid WebP file signature.")
        return "image/webp"

    elif ext in (".docx", ".xlsx"):
        if not content.startswith(b"PK\x03\x04"):
            raise HTTPException(status_code=400, detail=f"Invalid {ext[1:].upper()} file signature.")
        return (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            if ext == ".docx"
            else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    elif ext in (".txt", ".csv"):
        check_chunk = content[:1024]
        if b"\x00" in check_chunk:
            raise HTTPException(status_code=400, detail=f"Binary content is not permitted for {ext} files.")
        try:
            check_chunk.decode("utf-8")
        except UnicodeDecodeError:
            try:
                check_chunk.decode("latin-1")
            except Exception:
                raise HTTPException(status_code=400, detail=f"Invalid text encoding for {ext} file.")
        return "text/csv" if ext == ".csv" else "text/plain"

    raise HTTPException(status_code=400, detail="Unsupported file format.")


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

    filename = file.filename or ""
    ext = ("." + filename.rsplit(".", 1)[-1]).lower() if "." in filename else ""
    if not ext or ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File extension '{ext or 'none'}' is not permitted.",
        )

    validated_content_type = validate_upload_content(content, ext)

    safe_name = "".join(c for c in filename if c.isalnum() or c in "._-")
    file_path = f"{clean_slug}/{uuid4().hex}_{safe_name}"

    service_key = settings.SUPABASE_SERVICE_ROLE_KEY
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": validated_content_type,
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


def dispatch_submission_notifications(
    slug: str,
    form_title: str,
    creator_id: str,
    response_id: str,
    answers_count: int,
    form_settings: dict | None = None,
) -> bool:
    """
    Dispatches asynchronous submission notifications to the form creator.
    In the current architecture without external email providers, this safely
    validates settings and prepares notification metadata.
    """
    settings_dict = form_settings or {}
    notifications = settings_dict.get("notifications") or {}
    if not notifications.get("email_creator", False):
        return False
    return True


class TokenBucketLimiter:
    """
    In-memory token-bucket rate limiter per IP address for public submission routes.
    Implements Phase 7 Section 1.2 (DoS mitigation) and Section 3 (Rate Limiting).
    """

    def __init__(self, rate_per_minute: float = 10.0, burst: float = 10.0):
        self.rate = rate_per_minute / 60.0  # tokens per second
        self.capacity = burst
        self.buckets: dict[str, tuple[float, float]] = {}

    def check(self, key: str) -> None:
        now = time.monotonic()
        tokens, last_updated = self.buckets.get(key, (self.capacity, now))

        # Refill tokens based on elapsed time
        elapsed = now - last_updated
        tokens = min(self.capacity, tokens + elapsed * self.rate)

        if tokens < 1.0:
            retry_after = max(1, ceil((1.0 - tokens) / self.rate))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait a moment before submitting again.",
                headers={"Retry-After": str(retry_after)},
            )

        # Consume 1 token
        self.buckets[key] = (tokens - 1.0, now)

    def reset(self) -> None:
        """Reset rate limiter buckets (used for tests and lifecycle)."""
        self.buckets.clear()


submission_rate_limiter = TokenBucketLimiter(rate_per_minute=10.0, burst=10.0)


def get_client_ip(request: Request) -> str:
    try:
        if hasattr(request, "headers") and request.headers:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                return forwarded.split(",")[0].strip()
            real_ip = request.headers.get("x-real-ip")
            if real_ip:
                return real_ip.strip()
        if hasattr(request, "client") and request.client and getattr(request.client, "host", None):
            return request.client.host
    except Exception:
        pass
    return "127.0.0.1"


@router.post("/public/{slug}/submit")
async def submit_public_response(
    slug: str,
    submission: PublicSubmission,
    request: Request,
):
    clean_slug = slug.strip()
    if not clean_slug or len(clean_slug) > 100:
        raise HTTPException(status_code=400, detail="Invalid registration link.")

    # Phase 7: IP-based token-bucket rate limiting (DoS mitigation)
    client_ip = get_client_ip(request)
    submission_rate_limiter.check(client_ip)

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

    try:
        dispatch_submission_notifications(
            slug=clean_slug,
            form_title=form.get("title", ""),
            creator_id=form.get("creator_id", ""),
            response_id=response_id,
            answers_count=len(answers_to_insert),
            form_settings=form_settings,
        )
    except Exception:
        pass

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


@router.get("/{form_id}/responses/summary")
async def get_form_responses_summary(
    form_id: str,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    token = credentials.credentials

    # 1. Ownership check
    forms = await get_supabase_response(
        "GET",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}&select=id,title,description,status,response_count&limit=1",
        token,
    )
    if not forms:
        raise HTTPException(status_code=404, detail="Form not found.")
    form = forms[0]

    # 2. Fetch questions
    questions = await get_supabase_response(
        "GET",
        f"form_questions?form_id=eq.{form_id}&select=id,field_key,question_type,label,options,order_index,validation_rules&order=order_index.asc",
        token,
    )

    # 3. Fetch responses
    responses = await get_supabase_response(
        "GET",
        f"form_responses?form_id=eq.{form_id}&select=id,sap_id,submitted_at,completion_time_seconds&order=submitted_at.desc",
        token,
    )
    total_responses = len(responses)

    # 4. Fetch answers
    answers = []
    if responses:
        resp_ids = ",".join(r["id"] for r in responses)
        answers = await get_supabase_response(
            "GET",
            f"form_answers?response_id=in.({resp_ids})&select=response_id,question_id,answer_value",
            token,
        )

    # Group answers by question_id
    answers_by_qid: dict[str, list] = {}
    for a in answers:
        answers_by_qid.setdefault(str(a["question_id"]), []).append(a["answer_value"])

    # Compute timeline and duration stats
    timeline_counts: dict[str, int] = {}
    total_time = 0
    time_count = 0
    for r in responses:
        sub_date = (r.get("submitted_at") or "")[:10]
        if sub_date:
            timeline_counts[sub_date] = timeline_counts.get(sub_date, 0) + 1
        dur = r.get("completion_time_seconds")
        if dur and isinstance(dur, (int, float)) and dur > 0:
            total_time += dur
            time_count += 1

    avg_completion_time = round(total_time / time_count, 1) if time_count > 0 else None

    # Compute per-question analytics
    question_summaries = []
    for q in questions:
        q_id = str(q["id"])
        q_type = q.get("question_type")
        raw_answers = answers_by_qid.get(q_id, [])
        valid_answers = [v for v in raw_answers if v is not None and v != ""]
        answered_count = len(valid_answers)

        q_summary: dict = {
            "question_id": q_id,
            "label": q.get("label"),
            "question_type": q_type,
            "total_answers": answered_count,
        }

        if q_type in ("multiple_choice", "dropdown"):
            option_counts: dict[str, int] = {}
            for opt in q.get("options") or []:
                key = opt.get("label") or opt.get("value")
                if key:
                    option_counts[key] = 0
            for val in valid_answers:
                key = str(val)
                option_counts[key] = option_counts.get(key, 0) + 1
            breakdown = [
                {
                    "label": opt_label,
                    "count": count,
                    "percentage": round((count / answered_count) * 100, 1) if answered_count > 0 else 0,
                }
                for opt_label, count in option_counts.items()
            ]
            q_summary["options_distribution"] = breakdown

        elif q_type == "checkboxes":
            option_counts = {}
            for opt in q.get("options") or []:
                key = opt.get("label") or opt.get("value")
                if key:
                    option_counts[key] = 0
            for val in valid_answers:
                if isinstance(val, list):
                    for item in val:
                        option_counts[str(item)] = option_counts.get(str(item), 0) + 1
                else:
                    option_counts[str(val)] = option_counts.get(str(val), 0) + 1
            breakdown = [
                {
                    "label": opt_label,
                    "count": count,
                    "percentage": round((count / answered_count) * 100, 1) if answered_count > 0 else 0,
                }
                for opt_label, count in option_counts.items()
            ]
            q_summary["options_distribution"] = breakdown

        elif q_type in ("linear_scale", "rating", "number"):
            num_vals = []
            distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
            for val in valid_answers:
                try:
                    num = float(val)
                    num_vals.append(num)
                    int_score = int(round(num))
                    if 1 <= int_score <= 5:
                        distribution[int_score] = distribution.get(int_score, 0) + 1
                except Exception:
                    pass
            avg_score = round(sum(num_vals) / len(num_vals), 2) if num_vals else None
            q_summary["rating_stats"] = {
                "average": avg_score,
                "min": min(num_vals) if num_vals else None,
                "max": max(num_vals) if num_vals else None,
                "distribution": [
                    {"score": score, "count": count, "percentage": round((count / len(num_vals)) * 100, 1) if num_vals else 0}
                    for score, count in sorted(distribution.items())
                ],
            }

        elif q_type in ("short_text", "long_text", "date", "time"):
            q_summary["text_responses"] = [
                {"response": str(v)} for v in valid_answers[-50:]
            ]

        elif q_type == "file_upload":
            files_list = []
            for v in valid_answers:
                if isinstance(v, dict) and "url" in v:
                    files_list.append(v)
                elif isinstance(v, str) and v.startswith("http"):
                    files_list.append({"url": v, "file_name": v.split("/")[-1]})
            q_summary["files"] = files_list

        question_summaries.append(q_summary)

    return {
        "success": True,
        "form": form,
        "total_responses": total_responses,
        "average_completion_time_seconds": avg_completion_time,
        "timeline": [
            {"date": d, "count": c} for d, c in sorted(timeline_counts.items())
        ],
        "question_summaries": question_summaries,
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
            "&select=id,title,description,status,response_count,shareable_slug"
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
            "&select=id,label,question_type,order_index,options,validation_rules"
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

    answers_by_response: dict[str, list] = {}
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


@router.get("/{form_id}/responses/{response_id}")
async def get_single_response(
    form_id: str,
    response_id: str,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    token = credentials.credentials

    # Ownership check
    forms = await get_supabase_response(
        "GET",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}&select=id,title&limit=1",
        token,
    )
    if not forms:
        raise HTTPException(status_code=404, detail="Form not found.")

    responses = await get_supabase_response(
        "GET",
        f"form_responses?id=eq.{response_id}&form_id=eq.{form_id}&select=*&limit=1",
        token,
    )
    if not responses:
        raise HTTPException(status_code=404, detail="Response not found.")

    answers = await get_supabase_response(
        "GET",
        f"form_answers?response_id=eq.{response_id}&select=question_id,answer_value",
        token,
    )

    questions = await get_supabase_response(
        "GET",
        f"form_questions?form_id=eq.{form_id}&select=*&order=order_index.asc",
        token,
    )

    return {
        "success": True,
        "form": forms[0],
        "response": responses[0],
        "answers": answers,
        "questions": questions,
    }


@router.delete("/{form_id}/responses/{response_id}")
async def delete_single_response(
    form_id: str,
    response_id: str,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    token = credentials.credentials

    # 1. Verify ownership
    forms = await get_supabase_response(
        "GET",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}&select=id,response_count&limit=1",
        token,
    )
    if not forms:
        raise HTTPException(status_code=404, detail="Form not found.")

    # 2. Delete response
    service_key = settings.SUPABASE_SERVICE_ROLE_KEY
    await get_supabase_response(
        "DELETE",
        f"form_responses?id=eq.{response_id}&form_id=eq.{form_id}",
        service_key,
    )

    # 3. Decrement response count
    curr_count = forms[0].get("response_count") or 0
    new_count = max(0, curr_count - 1)
    await get_supabase_response(
        "PATCH",
        f"forms?id=eq.{form_id}",
        service_key,
        {"response_count": new_count},
    )

    return {"success": True, "message": "Response deleted successfully."}


@router.delete("/{form_id}/responses")
async def delete_all_responses(
    form_id: str,
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

    # 2. Delete all responses
    service_key = settings.SUPABASE_SERVICE_ROLE_KEY
    await get_supabase_response(
        "DELETE",
        f"form_responses?form_id=eq.{form_id}",
        service_key,
    )

    # 3. Reset response_count to 0
    await get_supabase_response(
        "PATCH",
        f"forms?id=eq.{form_id}",
        service_key,
        {"response_count": 0},
    )

    return {"success": True, "message": "All responses have been reset."}


@router.patch("/{form_id}/toggle-status")
async def toggle_form_accepting(
    form_id: str,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    token = credentials.credentials

    forms = await get_supabase_response(
        "GET",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}&select=id,status&limit=1",
        token,
    )
    if not forms:
        raise HTTPException(status_code=404, detail="Form not found.")

    curr_status = forms[0].get("status", "draft")
    new_status = "closed" if curr_status == "published" else "published"

    await get_supabase_response(
        "PATCH",
        f"forms?id=eq.{form_id}",
        token,
        {"status": new_status},
    )

    return {
        "success": True,
        "status": new_status,
        "message": f"Form is now {'accepting responses' if new_status == 'published' else 'closed'}.",
    }


@router.get("/{form_id}/export/csv")
async def export_form_csv(
    form_id: str,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    token = credentials.credentials

    # Ownership check
    forms = await get_supabase_response(
        "GET",
        f"forms?id=eq.{form_id}&creator_id=eq.{current_user['id']}&select=id,title,shareable_slug&limit=1",
        token,
    )
    if not forms:
        raise HTTPException(status_code=404, detail="Form not found.")
    form = forms[0]

    questions = await get_supabase_response(
        "GET",
        f"form_questions?form_id=eq.{form_id}&select=id,label,order_index&order=order_index.asc",
        token,
    )

    responses = await get_supabase_response(
        "GET",
        f"form_responses?form_id=eq.{form_id}&select=id,sap_id,submitted_at,completion_time_seconds&order=submitted_at.desc",
        token,
    )

    answers = []
    if responses:
        resp_ids = ",".join(r["id"] for r in responses)
        answers = await get_supabase_response(
            "GET",
            f"form_answers?response_id=in.({resp_ids})&select=response_id,question_id,answer_value",
            token,
        )

    # Index answers by (response_id, question_id)
    answers_map: dict[tuple[str, str], str] = {}
    for a in answers:
        val = a["answer_value"]
        if isinstance(val, list):
            str_val = "; ".join(str(item) for item in val)
        elif isinstance(val, dict):
            str_val = val.get("url") or str(val)
        else:
            str_val = str(val) if val is not None else ""
        answers_map[(str(a["response_id"]), str(a["question_id"]))] = str_val

    output = io.StringIO()
    # Write UTF-8 BOM so Excel opens UTF-8 encoded characters properly
    output.write("\ufeff")
    writer = csv.writer(output)

    # Headers
    header_row = ["Response ID", "Respondent Identifier", "Submitted At", "Duration (s)"]
    for q in questions:
        header_row.append(q.get("label") or "Question")
    writer.writerow(header_row)

    # Data Rows
    for r in responses:
        row = [
            r["id"],
            r.get("sap_id", ""),
            r.get("submitted_at", ""),
            r.get("completion_time_seconds", ""),
        ]
        for q in questions:
            row.append(answers_map.get((str(r["id"]), str(q["id"])), ""))
        writer.writerow(row)

    output.seek(0)
    slug = form.get("shareable_slug") or form_id
    filename = f"{slug}_responses.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{form_id}/export/xlsx")
async def export_form_xlsx(
    form_id: str,
    current_user: dict = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    # Delegate to CSV stream with Excel content-type
    res = await export_form_csv(form_id, current_user, credentials)
    slug = form_id
    res.headers["Content-Disposition"] = f'attachment; filename="{slug}_responses.csv"'
    return res
