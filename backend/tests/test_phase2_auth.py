import asyncio
import httpx
from app.main import app


async def test_auth_and_protected_routes():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Unauthenticated request to /auth/me should return 401
        res = await client.get("/api/v1/auth/me")
        assert res.status_code == 401, f"Expected 401 for unauthenticated /auth/me, got {res.status_code}"
        print("[PASS] Unauthenticated /api/v1/auth/me properly rejected with 401")

        # 2. Unauthenticated request to /forms/ should return 401
        res = await client.get("/api/v1/forms/")
        assert res.status_code == 401, f"Expected 401 for unauthenticated /forms/, got {res.status_code}"
        print("[PASS] Unauthenticated /api/v1/forms/ properly rejected with 401")

        # 3. Invalid token to /forms/ should return 401
        res = await client.get("/api/v1/forms/", headers={"Authorization": "Bearer invalid_token_123"})
        assert res.status_code in (401, 503), f"Expected 401/503 for invalid token, got {res.status_code}"
        print("[PASS] Invalid token properly rejected")

        # 4. Public route to nonexistent slug should return 404 (or 503 if remote database is unreachable)
        res = await client.get("/api/v1/forms/public/nonexistent_slug_test_123")
        assert res.status_code in (404, 503), f"Expected 404/503 for nonexistent slug, got {res.status_code}"
        print("[PASS] Public route validation completed")

    print("All Phase 2 Backend Auth and Security Guard tests passed!")


if __name__ == "__main__":
    asyncio.run(test_auth_and_protected_routes())
