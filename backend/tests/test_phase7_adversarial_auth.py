import pytest
from unittest.mock import AsyncMock, patch
from starlette.testclient import TestClient

from app.main import app
from app.core.security import get_current_user, security_scheme
from fastapi.security import HTTPAuthorizationCredentials


# Test IDs
USER_A_ID = "00000000-0000-0000-0000-00000000000a"
USER_B_ID = "00000000-0000-0000-0000-00000000000b"

FORM_A_ID = "11111111-1111-1111-1111-11111111111a"
FORM_B_ID = "22222222-2222-2222-2222-22222222222b"
FORM_CLOSED_B_ID = "33333333-3333-3333-3333-33333333333b"
FORM_DRAFT_B_ID = "44444444-4444-4444-4444-44444444444b"

RESP_B_ID = "55555555-5555-5555-5555-55555555555b"

# Mock Database records
DB_FORMS = {
    FORM_A_ID: {
        "id": FORM_A_ID,
        "creator_id": USER_A_ID,
        "title": "User A Legitimate Form",
        "description": "Form owned by User A",
        "status": "published",
        "shareable_slug": "slug-a",
        "response_count": 0,
        "settings": {"allow_multiple_responses": True},
        "theme": {},
    },
    FORM_B_ID: {
        "id": FORM_B_ID,
        "creator_id": USER_B_ID,
        "title": "User B Confidential Form",
        "description": "Sensitive User B Data",
        "status": "published",
        "shareable_slug": "slug-b",
        "response_count": 1,
        "settings": {"allow_multiple_responses": False},
        "theme": {},
    },
    FORM_CLOSED_B_ID: {
        "id": FORM_CLOSED_B_ID,
        "creator_id": USER_B_ID,
        "title": "User B Closed Form",
        "status": "closed",
        "shareable_slug": "slug-closed-b",
        "response_count": 5,
        "settings": {},
        "theme": {},
    },
    FORM_DRAFT_B_ID: {
        "id": FORM_DRAFT_B_ID,
        "creator_id": USER_B_ID,
        "title": "User B Draft Form",
        "status": "draft",
        "shareable_slug": "slug-draft-b",
        "response_count": 0,
        "settings": {},
        "theme": {},
    },
}

DB_RESPONSES = {
    RESP_B_ID: {
        "id": RESP_B_ID,
        "form_id": FORM_B_ID,
        "sap_id": "secret_respondent_b",
        "submitted_at": "2026-11-04T12:00:00Z",
        "completion_time_seconds": 30,
    }
}


async def mock_supabase_router(method: str, path: str, token: str, data: dict = None):
    """Simulates PostgREST RLS and filtering mechanics."""
    # 1. Forms queries
    if path.startswith("forms?"):
        creator_match = None
        id_match = None
        slug_match = None

        for param in path.split("forms?")[1].split("&"):
            if param.startswith("creator_id=eq."):
                creator_match = param.split("creator_id=eq.")[1]
            elif param.startswith("id=eq."):
                id_match = param.split("id=eq.")[1]
            elif param.startswith("shareable_slug=eq."):
                slug_match = param.split("shareable_slug=eq.")[1]

        results = []
        for f in DB_FORMS.values():
            if id_match and f["id"] != id_match:
                continue
            if creator_match and f["creator_id"] != creator_match:
                continue
            if slug_match and f["shareable_slug"] != slug_match:
                continue
            results.append(dict(f))

        return results

    # 2. Form questions queries
    elif path.startswith("form_questions?"):
        return []

    # 3. Form responses queries
    elif path.startswith("form_responses?"):
        form_id_match = None
        resp_id_match = None
        for param in path.split("form_responses?")[1].split("&"):
            if param.startswith("form_id=eq."):
                form_id_match = param.split("form_id=eq.")[1]
            elif param.startswith("id=eq."):
                resp_id_match = param.split("id=eq.")[1]

        results = []
        for r in DB_RESPONSES.values():
            if form_id_match and r["form_id"] != form_id_match:
                continue
            if resp_id_match and r["id"] != resp_id_match:
                continue
            results.append(dict(r))
        return results

    # 4. Form answers
    elif path.startswith("form_answers?"):
        return []

    return []


@pytest.fixture(autouse=True)
def setup_auth_and_mocks():
    """Sets up default authentication as User A and patches Supabase PostgREST client."""
    user_a = {"id": USER_A_ID, "email": "user_a@hypervision.local"}
    creds_a = HTTPAuthorizationCredentials(scheme="Bearer", credentials="jwt_token_user_a")

    app.dependency_overrides[get_current_user] = lambda: user_a
    app.dependency_overrides[security_scheme] = lambda: creds_a

    with patch("app.api.v1.endpoints.forms.get_supabase_response", new=AsyncMock(side_effect=mock_supabase_router)):
        yield

    app.dependency_overrides.clear()


client = TestClient(app)


# =====================================================================
# 1. READ ATTACKS: User A cannot read User B's forms or data
# =====================================================================

def test_adversarial_read_foreign_form_builder_rejected_with_404():
    """User A attempts to inspect User B's form builder schema."""
    res = client.get(f"/api/v1/forms/{FORM_B_ID}/builder")
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


def test_adversarial_read_foreign_responses_summary_rejected_with_404():
    """User A attempts to view User B's response analytics."""
    res = client.get(f"/api/v1/forms/{FORM_B_ID}/responses/summary")
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


def test_adversarial_read_foreign_responses_list_rejected_with_404():
    """User A attempts to view User B's submitted responses list."""
    res = client.get(f"/api/v1/forms/{FORM_B_ID}/responses")
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


def test_adversarial_read_foreign_single_response_rejected_with_404():
    """User A attempts to inspect a single private response belonging to User B's form."""
    res = client.get(f"/api/v1/forms/{FORM_B_ID}/responses/{RESP_B_ID}")
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


def test_adversarial_export_foreign_csv_rejected_with_404():
    """User A attempts to download CSV export of User B's responses."""
    res = client.get(f"/api/v1/forms/{FORM_B_ID}/export/csv")
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


def test_adversarial_export_foreign_xlsx_rejected_with_404():
    """User A attempts to download XLSX export of User B's responses."""
    res = client.get(f"/api/v1/forms/{FORM_B_ID}/export/xlsx")
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


# =====================================================================
# 2. WRITE / MUTATION ATTACKS: User A cannot alter User B's resources
# =====================================================================

def test_adversarial_update_foreign_form_rejected_with_404():
    """User A attempts to update title/description of User B's form."""
    res = client.patch(
        f"/api/v1/forms/{FORM_B_ID}",
        json={"title": "Hacked Title", "description": "Compromised"}
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


def test_adversarial_update_foreign_builder_rejected_with_404():
    """User A attempts to rewrite User B's questions."""
    res = client.put(
        f"/api/v1/forms/{FORM_B_ID}/builder",
        json={"title": "Hijacked", "questions": []}
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


def test_adversarial_update_foreign_slug_rejected_with_404():
    """User A attempts to change User B's custom vanity slug."""
    res = client.patch(
        f"/api/v1/forms/{FORM_B_ID}/slug",
        json={"shareable_slug": "stolen-slug"}
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


def test_adversarial_toggle_foreign_status_rejected_with_404():
    """User A attempts to close or pause User B's active form."""
    res = client.patch(f"/api/v1/forms/{FORM_B_ID}/toggle-status")
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


def test_adversarial_duplicate_foreign_form_rejected_with_404():
    """User A attempts to duplicate User B's private form into their account."""
    res = client.post(f"/api/v1/forms/{FORM_B_ID}/duplicate")
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


# =====================================================================
# 3. DELETE ATTACKS: User A cannot delete User B's form or responses
# =====================================================================

def test_adversarial_delete_foreign_form_rejected_with_404():
    """User A attempts to delete User B's form."""
    res = client.delete(f"/api/v1/forms/{FORM_B_ID}")
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


def test_adversarial_delete_foreign_single_response_rejected_with_404():
    """User A attempts to delete a single response belonging to User B's form."""
    res = client.delete(f"/api/v1/forms/{FORM_B_ID}/responses/{RESP_B_ID}")
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


def test_adversarial_delete_foreign_all_responses_rejected_with_404():
    """User A attempts to purge all responses of User B's form."""
    res = client.delete(f"/api/v1/forms/{FORM_B_ID}/responses")
    assert res.status_code == 404
    assert res.json()["detail"] == "Form not found."


# =====================================================================
# 4. UNCHECKED ID MANIPULATION: Supplying User A form with User B response
# =====================================================================

def test_cross_entity_id_manipulation_rejected():
    """User A specifies their own form_id but supplies User B's response_id to delete."""
    res = client.delete(f"/api/v1/forms/{FORM_A_ID}/responses/{RESP_B_ID}")
    assert res.status_code in (200, 404)


# =====================================================================
# 5. UNAUTHENTICATED GUARDS & PUBLIC ACCESS BOUNDARIES
# =====================================================================

def test_unauthenticated_request_to_protected_route_rejected_with_401():
    """Requests without credentials cannot touch creator routes."""
    app.dependency_overrides.clear()
    res = client.get(f"/api/v1/forms/{FORM_B_ID}/builder")
    assert res.status_code == 401


def test_anonymous_cannot_submit_to_closed_form():
    """Public users cannot submit responses to a closed form (403 Forbidden)."""
    payload = {
        "respondent_identifier": "anon_user",
        "answers": []
    }
    res = client.post("/api/v1/forms/public/slug-closed-b/submit", json=payload)
    assert res.status_code == 403
    assert "closed" in res.json()["detail"].lower()


def test_anonymous_cannot_submit_to_draft_form():
    """Public users cannot submit responses to an unpublished draft form (403 Forbidden)."""
    payload = {
        "respondent_identifier": "anon_user",
        "answers": []
    }
    res = client.post("/api/v1/forms/public/slug-draft-b/submit", json=payload)
    assert res.status_code == 403
    assert "not accepting" in res.json()["detail"].lower() or "closed" in res.json()["detail"].lower()


# =====================================================================
# 6. CONTROL TEST: Valid owner CAN access their own resources
# =====================================================================

def test_owner_can_access_own_form():
    """User A CAN successfully view their own form (control test)."""
    res = client.get(f"/api/v1/forms/{FORM_A_ID}/builder")
    assert res.status_code == 200
    assert res.json()["form"]["title"] == "User A Legitimate Form"
