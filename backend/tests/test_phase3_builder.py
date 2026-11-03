import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.core.security import get_current_user, security_scheme
from fastapi.security import HTTPAuthorizationCredentials


def test_builder_endpoints():
    client = TestClient(app)

    # 1. Unauthenticated request to GET /forms/{id}/builder should return 401
    res = client.get("/api/v1/forms/test-form-id/builder")
    assert res.status_code == 401, f"Expected 401 for unauthenticated GET builder, got {res.status_code}"
    print("[PASS] Unauthenticated GET /forms/{id}/builder properly rejected with 401")

    # 2. Unauthenticated request to PUT /forms/{id}/builder should return 401
    res = client.put(
        "/api/v1/forms/test-form-id/builder",
        json={
            "title": "Test Title",
            "questions": [],
        },
    )
    assert res.status_code == 401, f"Expected 401 for unauthenticated PUT builder, got {res.status_code}"
    print("[PASS] Unauthenticated PUT /forms/{id}/builder properly rejected with 401")

    # 3. Test validation rules with mocked auth
    mock_user = {"id": "00000000-0000-0000-0000-000000000001", "email": "test@hypervision.local"}
    mock_creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="mock_token")

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[security_scheme] = lambda: mock_creds

    try:
        # Empty title should trigger 422 Unprocessable Entity
        res = client.put(
            "/api/v1/forms/00000000-0000-0000-0000-000000000002/builder",
            json={
                "title": "",
                "questions": [],
            },
            headers={"Authorization": "Bearer mock_token"},
        )
        assert res.status_code == 422, f"Expected 422 for empty title validation, got {res.status_code}"
        print("[PASS] Builder schema enforces non-empty title validation (422)")

        # Invalid question type should trigger 422 Unprocessable Entity
        res = client.put(
            "/api/v1/forms/00000000-0000-0000-0000-000000000002/builder",
            json={
                "title": "Valid Title",
                "questions": [
                    {
                        "label": "Invalid Type Question",
                        "question_type": "unsupported_unknown_type",
                    }
                ],
            },
            headers={"Authorization": "Bearer mock_token"},
        )
        assert res.status_code == 422, f"Expected 422 for invalid question type, got {res.status_code}"
        print("[PASS] Builder schema enforces valid question type enumeration (422)")

        # Invalid form status should trigger 422
        res = client.put(
            "/api/v1/forms/00000000-0000-0000-0000-000000000002/builder",
            json={
                "title": "Valid Title",
                "status": "invalid_status_value",
                "questions": [],
            },
            headers={"Authorization": "Bearer mock_token"},
        )
        assert res.status_code == 422, f"Expected 422 for invalid status value, got {res.status_code}"
        print("[PASS] Builder schema enforces valid status enumeration (422)")

    finally:
        # Clean up overrides
        app.dependency_overrides.clear()

    print("All Phase 3 Builder API validation and security tests passed!")


if __name__ == "__main__":
    test_builder_endpoints()
