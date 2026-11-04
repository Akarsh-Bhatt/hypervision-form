import json
import logging
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, Response
from app.core.config import settings

SENSITIVE_FIELD_NAMES = {
    "password",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "apikey",
    "authorization",
    "cookie",
    "set-cookie",
    "service_role_key",
    "supabase_service_role_key",
    "supabase_anon_key",
}


def sanitize_value(key: str, value: Any) -> Any:
    """Sanitizes sensitive values from logged fields."""
    if isinstance(key, str) and any(s in key.lower() for s in SENSITIVE_FIELD_NAMES):
        return "[REDACTED]"
    if isinstance(value, dict):
        return {k: sanitize_value(k, v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_value(key, item) for item in value]
    return value


class StructuredJSONFormatter(logging.Formatter):
    """
    Standard library Formatter that outputs log records as single-line JSON strings to stdout.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_payload: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "environment": getattr(settings, "ENVIRONMENT", "development"),
        }

        # Include extra fields attached to the LogRecord (excluding standard logging attributes)
        standard_attrs = {
            "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
            "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
            "created", "msecs", "relativeCreated", "thread", "threadName",
            "processName", "process", "message",
        }
        for key, val in record.__dict__.items():
            if key not in standard_attrs and not key.startswith("_"):
                log_payload[key] = sanitize_value(key, val)

        # Include exception information safely
        if record.exc_info:
            log_payload["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": self.formatException(record.exc_info) if record.exc_info else None,
            }

        return json.dumps(log_payload, default=str)


def setup_structured_logging(level: Optional[str] = None) -> logging.Logger:
    """
    Configures the root and application loggers to stream structured JSON to stdout.
    """
    log_level_name = level or getattr(settings, "LOG_LEVEL", "INFO")
    numeric_level = getattr(logging, log_level_name.upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Avoid duplicate handlers if setup is called multiple times
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(numeric_level)
    handler.setFormatter(StructuredJSONFormatter())
    root_logger.addHandler(handler)

    app_logger = logging.getLogger("hypervision")
    app_logger.setLevel(numeric_level)
    return app_logger


logger = logging.getLogger("hypervision")


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that assigns a unique request_id and logs incoming HTTP requests and responses
    as structured JSON. Never logs passwords, tokens, API keys, or request bodies.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Resolve or generate correlation request_id
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id

        # Extract client IP safely
        client_ip = request.client.host if request.client else "unknown"

        # Record start timestamp
        start_time = time.perf_counter()

        try:
            response = await call_next(request)
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            # Log request completion with context
            logger.info(
                f"HTTP {request.method} {request.url.path} completed with status {response.status_code}",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": duration_ms,
                    "client_ip": client_ip,
                },
            )

            # Propagate request_id to response header for distributed tracing
            response.headers["X-Request-ID"] = request_id
            return response

        except Exception as exc:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(
                f"HTTP {request.method} {request.url.path} failed with unhandled error: {exc}",
                exc_info=True,
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": 500,
                    "duration_ms": duration_ms,
                    "client_ip": client_ip,
                    "error": str(exc),
                },
            )
            raise exc
