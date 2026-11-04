# Multi-stage Dockerfile for FastAPI Backend

# =======================================================
# Stage 1: Build & Dependencies
# =======================================================
FROM python:3.12-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir --user -r requirements.txt


# =======================================================
# Stage 2: Production Runtime
# =======================================================
FROM python:3.12-slim AS runner

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/home/appuser/.local/bin:$PATH" \
    PYTHONPATH="/app" \
    PORT=8000 \
    HOST=0.0.0.0

# Create non-root system user and home directory
RUN groupadd -r appgroup && useradd -r -g appgroup -d /home/appuser -m appuser

# Copy installed Python dependencies from builder
COPY --from=builder --chown=appuser:appgroup /root/.local /home/appuser/.local

# Copy application source code
COPY --chown=appuser:appgroup app /app/app
COPY --chown=appuser:appgroup pytest.ini /app/pytest.ini

# Switch to non-root user
USER appuser

EXPOSE 8000

# Container healthcheck using standard-library urllib
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health').read()" || exit 1

# Production uvicorn process
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
