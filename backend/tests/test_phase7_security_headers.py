import pytest
from starlette.testclient import TestClient
from app.main import app


def test_security_headers_on_health():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200

    headers = response.headers
    assert headers.get("Strict-Transport-Security") == "max-age=31536000; includeSubDomains"
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("Content-Security-Policy") == "default-src 'self'; frame-ancestors 'none'"


def test_security_headers_on_api_v1_health():
    client = TestClient(app)
    response = client.get("/api/v1/health")
    assert response.status_code == 200

    headers = response.headers
    assert headers.get("Strict-Transport-Security") == "max-age=31536000; includeSubDomains"
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("Content-Security-Policy") == "default-src 'self'; frame-ancestors 'none'"


def test_security_headers_on_error_response():
    client = TestClient(app)
    # Unauthenticated request to protected endpoint produces 401
    response = client.get("/api/v1/forms/")
    assert response.status_code == 401

    headers = response.headers
    assert headers.get("Strict-Transport-Security") == "max-age=31536000; includeSubDomains"
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("Content-Security-Policy") == "default-src 'self'; frame-ancestors 'none'"


def test_security_headers_with_cors():
    client = TestClient(app)
    # Request with Origin header
    response = client.get(
        "/health",
        headers={"Origin": "http://localhost:3000"}
    )
    assert response.status_code == 200
    headers = response.headers

    # Security headers must be present
    assert headers.get("Strict-Transport-Security") == "max-age=31536000; includeSubDomains"
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("Content-Security-Policy") == "default-src 'self'; frame-ancestors 'none'"

    # CORS header must also be present
    assert headers.get("access-control-allow-origin") == "http://localhost:3000"


if __name__ == "__main__":
    test_security_headers_on_health()
    test_security_headers_on_api_v1_health()
    test_security_headers_on_error_response()
    test_security_headers_with_cors()
    print("All security header tests passed successfully!")
