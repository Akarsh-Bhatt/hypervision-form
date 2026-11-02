import asyncio
import httpx
from app.main import app

async def run_verifications():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Test Root Health
        r1 = await client.get("/health")
        assert r1.status_code == 200, f"Expected 200, got {r1.status_code}"
        d1 = r1.json()
        assert d1["status"] == "healthy"
        assert d1["project"] == "Hypervision Form API"
        print("✓ Root /health passed:", d1["status"])

        # Test API v1 Health
        r2 = await client.get("/api/v1/health")
        assert r2.status_code == 200, f"Expected 200, got {r2.status_code}"
        d2 = r2.json()
        assert d2["status"] == "healthy"
        print("✓ API /api/v1/health passed:", d2["status"])

    print("All backend endpoint verifications passed successfully!")

if __name__ == "__main__":
    asyncio.run(run_verifications())

