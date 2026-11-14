from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import ORIGIN, chat_body, settings


def test_health_reports_provider(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "provider": "mock"}


def test_cors_allows_only_configured_origin(client):
    allowed = client.get("/api/health", headers={"Origin": ORIGIN})
    denied = client.get("/api/health", headers={"Origin": "https://example.org"})
    assert allowed.headers.get("access-control-allow-origin") == ORIGIN
    assert "access-control-allow-origin" not in denied.headers


def test_chat_contract_with_mock(client):
    response = client.post("/api/chat", json=chat_body())
    assert response.status_code == 200
    data = response.json()
    assert set(data) == {"reply", "recommendation", "severity", "fallback"}
    assert "verre" in data["reply"]
    assert "86 %" in data["reply"]
    assert data["severity"] == "verification"
    assert data["fallback"] is False


def test_chat_severity_and_disclaimer_for_danger(client):
    data = client.post(
        "/api/chat", json=chat_body(family="smoke_fire", family_label="fumée", severity=3)
    ).json()
    assert data["severity"] == "alerte"
    assert "112" in data["recommendation"]
    assert "pas un dispositif de sécurité certifié" in data["recommendation"]


def test_chat_unknown_and_drift(client):
    unknown = client.post(
        "/api/chat", json=chat_body(type="unknown", family=None, family_label=None, severity=1)
    ).json()
    assert "ne ressemble à rien" in unknown["reply"]
    drift = client.post("/api/chat", json=chat_body(type="drift", family=None, severity=0)).json()
    assert drift["severity"] == "information"
    assert "Recalibre" in drift["recommendation"]


def test_chat_rejects_invalid_or_oversized_input(client):
    bad = chat_body()
    bad["event"]["confidence"] = 3
    assert client.post("/api/chat", json=bad).status_code == 422
    too_long = chat_body()
    too_long["message"] = "x" * 501
    assert client.post("/api/chat", json=too_long).status_code == 422
    huge = chat_body()
    huge["padding"] = "x" * 40_000
    assert client.post("/api/chat", json=huge).status_code == 413


def test_report_with_mock(client):
    body = {
        "events": [
            {
                "type": "known",
                "family": "glass",
                "family_label": "verre",
                "severity": 2,
                "started_at": "2026-11-12T22:04:12Z",
                "duration_s": 1.5,
                "note": "cuisine",
            },
            {
                "type": "unknown",
                "severity": 1,
                "started_at": "2026-11-12T22:10:00Z",
                "duration_s": 2,
            },
        ],
        "session_minutes": 30,
    }
    data = client.post("/api/report", json=body).json()
    assert "2 événement(s)" in data["summary"]
    assert data["highlights"] == ["22:04 — verre : cuisine"]


def test_rate_limit_per_ip():
    with TestClient(create_app(settings(rate_limit_per_minute=2))) as c:
        codes = [c.post("/api/chat", json=chat_body()).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_rate_limit_uses_forwarded_ip_only_behind_trusted_proxy():
    with TestClient(create_app(settings(rate_limit_per_minute=1, trust_proxy=True))) as c:
        a = c.post("/api/chat", json=chat_body(), headers={"X-Forwarded-For": "1.1.1.1"})
        b = c.post("/api/chat", json=chat_body(), headers={"X-Forwarded-For": "2.2.2.2, 10.0.0.1"})
        a2 = c.post("/api/chat", json=chat_body(), headers={"X-Forwarded-For": "1.1.1.1"})
    assert (a.status_code, b.status_code, a2.status_code) == (200, 200, 429)
    with TestClient(create_app(settings(rate_limit_per_minute=1))) as c:
        first = c.post("/api/chat", json=chat_body(), headers={"X-Forwarded-For": "1.1.1.1"})
        spoofed = c.post("/api/chat", json=chat_body(), headers={"X-Forwarded-For": "3.3.3.3"})
    assert (first.status_code, spoofed.status_code) == (200, 429)
