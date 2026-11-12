from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app, create_app


def test_health_returns_ok_and_provider() -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(llm_provider="mock")
    try:
        response = TestClient(app).get("/api/health")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "provider": "mock"}


def test_cors_allows_only_configured_origin() -> None:
    client = TestClient(create_app(Settings(allowed_origins="http://localhost:5173")))
    allowed = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    denied = client.get("/api/health", headers={"Origin": "https://example.org"})

    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in denied.headers
