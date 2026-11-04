import json
import logging
import io
import pytest
from starlette.testclient import TestClient
from app.main import app
from app.core.logging import (
    StructuredJSONFormatter,
    setup_structured_logging,
    logger,
    sanitize_value,
)


def test_structured_json_formatter_output():
    """Verify that StructuredJSONFormatter emits valid single-line JSON with standard fields."""
    formatter = StructuredJSONFormatter()
    record = logging.LogRecord(
        name="hypervision.test",
        level=logging.INFO,
        pathname="test_path.py",
        lineno=10,
        msg="Test log message",
        args=(),
        exc_info=None,
    )
    record.request_id = "test-uuid-123"
    record.method = "GET"
    record.path = "/api/v1/health"
    record.status_code = 200
    record.duration_ms = 12.34
    record.client_ip = "127.0.0.1"

    formatted = formatter.format(record)
    data = json.loads(formatted)

    assert data["message"] == "Test log message"
    assert data["level"] == "INFO"
    assert data["logger"] == "hypervision.test"
    assert "timestamp" in data
    assert "environment" in data
    assert data["request_id"] == "test-uuid-123"
    assert data["method"] == "GET"
    assert data["path"] == "/api/v1/health"
    assert data["status_code"] == 200
    assert data["duration_ms"] == 12.34
    assert data["client_ip"] == "127.0.0.1"


def test_sensitive_field_redaction():
    """Verify that credentials, tokens, passwords, and secrets are redacted."""
    formatter = StructuredJSONFormatter()
    record = logging.LogRecord(
        name="hypervision.security",
        level=logging.WARNING,
        pathname="security.py",
        lineno=20,
        msg="Auth attempt",
        args=(),
        exc_info=None,
    )
    # Sensitive fields attached to the log record
    record.password = "SuperSecretPassword123"
    record.token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    record.api_key = "secret-anon-key-value"
    record.authorization = "Bearer eyJhbGci..."
    record.service_role_key = "secret-service-key"
    record.safe_field = "NormalPublicInformation"

    formatted = formatter.format(record)
    data = json.loads(formatted)

    # Sensitive values must never appear in clear text
    assert data["password"] == "[REDACTED]"
    assert data["token"] == "[REDACTED]"
    assert data["api_key"] == "[REDACTED]"
    assert data["authorization"] == "[REDACTED]"
    assert data["service_role_key"] == "[REDACTED]"
    assert data["safe_field"] == "NormalPublicInformation"
    assert "SuperSecretPassword123" not in formatted
    assert "eyJhbGci" not in formatted


def test_exception_context_capture():
    """Verify that exceptions include type, message, and formatted traceback in JSON."""
    formatter = StructuredJSONFormatter()
    try:
        raise ValueError("Simulated computation error")
    except ValueError:
        import sys
        exc_info = sys.exc_info()

    record = logging.LogRecord(
        name="hypervision.error",
        level=logging.ERROR,
        pathname="error.py",
        lineno=30,
        msg="Error encountered",
        args=(),
        exc_info=exc_info,
    )
    formatted = formatter.format(record)
    data = json.loads(formatted)

    assert data["level"] == "ERROR"
    assert "exception" in data
    assert data["exception"]["type"] == "ValueError"
    assert data["exception"]["message"] == "Simulated computation error"
    assert "Traceback" in data["exception"]["traceback"]


def test_request_logging_middleware_and_trace_id(monkeypatch):
    """Verify that HTTP requests log structured context and attach X-Request-ID."""
    log_capture = io.StringIO()
    test_handler = logging.StreamHandler(log_capture)
    test_handler.setFormatter(StructuredJSONFormatter())

    app_logger = logging.getLogger("hypervision")
    app_logger.addHandler(test_handler)

    try:
        client = TestClient(app)
        response = client.get("/health", headers={"X-Request-ID": "custom-trace-id-999"})

        assert response.status_code == 200
        assert response.headers.get("X-Request-ID") == "custom-trace-id-999"

        log_output = log_capture.getvalue()
        lines = [json.loads(line) for line in log_output.strip().splitlines() if line.strip()]

        # Find the request completion log
        request_logs = [l for l in lines if l.get("path") == "/health" and l.get("request_id") == "custom-trace-id-999"]
        assert len(request_logs) >= 1
        req_log = request_logs[0]

        assert req_log["method"] == "GET"
        assert req_log["status_code"] == 200
        assert "duration_ms" in req_log
        assert "client_ip" in req_log
    finally:
        app_logger.removeHandler(test_handler)


def test_sensitive_headers_and_body_not_logged():
    """Verify that request bodies and sensitive Authorization headers are never logged."""
    log_capture = io.StringIO()
    test_handler = logging.StreamHandler(log_capture)
    test_handler.setFormatter(StructuredJSONFormatter())

    app_logger = logging.getLogger("hypervision")
    app_logger.addHandler(test_handler)

    secret_token = "eyJhbGciOi_SECRET_TOKEN_DO_NOT_LOG"
    secret_body_data = "SuperSecretRespondentSubmissionValue123"

    try:
        client = TestClient(app)
        # Attempt an unauthenticated/authenticated call with secret tokens and post body
        client.post(
            "/api/v1/forms/",
            json={"title": secret_body_data},
            headers={
                "Authorization": f"Bearer {secret_token}",
                "apikey": "sensitive-api-key-header",
            },
        )

        log_output = log_capture.getvalue()
        # Verify secrets are NOT in the log output
        assert secret_token not in log_output
        assert secret_body_data not in log_output
        assert "sensitive-api-key-header" not in log_output
    finally:
        app_logger.removeHandler(test_handler)


def test_global_exception_handler_structured_log():
    """Verify that unhandled 500 exceptions trigger structured error logging."""
    log_capture = io.StringIO()
    test_handler = logging.StreamHandler(log_capture)
    test_handler.setFormatter(StructuredJSONFormatter())

    app_logger = logging.getLogger("hypervision")
    app_logger.addHandler(test_handler)

    # Temporarily register a test route that raises an unhandled exception
    @app.get("/api/v1/test-error-endpoint")
    def error_route():
        raise RuntimeError("Crash for testing structured error logs")

    try:
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/api/v1/test-error-endpoint")

        assert response.status_code == 500
        data = response.json()
        assert data["success"] is False
        assert data["error"] == "InternalServerError"

        log_output = log_capture.getvalue()
        lines = [json.loads(line) for line in log_output.strip().splitlines() if line.strip()]

        error_logs = [l for l in lines if l.get("level") == "ERROR" and "/test-error-endpoint" in l.get("message", "")]
        assert len(error_logs) >= 1
        err_log = error_logs[0]
        assert err_log["status_code"] == 500
        assert "exception" in err_log
        assert err_log["exception"]["type"] == "RuntimeError"
        assert "Crash for testing structured error logs" in err_log["exception"]["message"]
    finally:
        app_logger.removeHandler(test_handler)
