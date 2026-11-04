from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.core.logging import (
    StructuredLoggingMiddleware,
    logger,
    setup_structured_logging,
)
from app.core.supabase import get_supabase_client
from app.api.v1.router import api_v1_router
from app.schemas.common import HealthCheckResponse


def create_application() -> FastAPI:
    # Initialize structured JSON logging to stdout
    setup_structured_logging()

    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
        docs_url=f"{settings.API_V1_PREFIX}/docs",
        redoc_url=f"{settings.API_V1_PREFIX}/redoc"
    )

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Structured Request / Response JSON Logging
    app.add_middleware(StructuredLoggingMiddleware)

    # HTTP Security Headers
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
        return response

    # Global Exception Handler
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", None)
        logger.error(
            f"Unhandled exception during {request.method} {request.url.path}: {exc}",
            exc_info=True,
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": 500,
                "error": str(exc),
            },
        )
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "InternalServerError",
                "detail": str(exc) if settings.ENVIRONMENT == "development" else "An unexpected error occurred."
            }
        )

    # Root health check shortcut
    @app.get("/health", response_model=HealthCheckResponse, tags=["Health"])
    async def root_health():
        client = get_supabase_client()
        return HealthCheckResponse(
            status="healthy",
            project=settings.PROJECT_NAME,
            version=settings.VERSION,
            environment=settings.ENVIRONMENT,
            timestamp=datetime.now(timezone.utc),
            supabase_connected=client is not None
        )

    # Include versioned API routers
    app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)

    return app


app = create_application()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.BACKEND_HOST,
        port=settings.BACKEND_PORT,
        reload=(settings.ENVIRONMENT == "development")
    )
