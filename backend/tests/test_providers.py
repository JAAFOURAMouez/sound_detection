import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import chat_body, settings

GROQ = {"llm_provider": "groq", "llm_model": "un-modele", "groq_api_key": "cle-de-test"}


def groq_transport(contents: list[str], seen: list[httpx.Request] | None = None, status: int = 200):
    """Faux serveur Groq (format OpenAI) renvoyant successivement `contents`."""
    queue = list(contents)

    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if status != 200:
            return httpx.Response(status, json={"error": "quota"})
        content = queue.pop(0) if queue else "{}"
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    return httpx.MockTransport(handler)


VALID = json.dumps(
    {"reply": "On dirait du verre brisé.", "recommendation": "Va voir.", "severity": "verification"}
)


def test_groq_request_format_and_valid_answer():
    seen: list[httpx.Request] = []
    with TestClient(create_app(settings(**GROQ), transport=groq_transport([VALID], seen))) as c:
        data = c.post("/api/chat", json=chat_body()).json()
    assert data == {
        "reply": "On dirait du verre brisé.",
        "recommendation": "Va voir.",
        "severity": "verification",
        "fallback": False,
    }
    request = seen[0]
    assert request.url.path.endswith("/chat/completions")
    assert request.headers["authorization"] == "Bearer cle-de-test"
    payload = json.loads(request.content)
    assert payload["model"] == "un-modele"
    assert payload["response_format"] == {"type": "json_object"}
    assert payload["messages"][0]["role"] == "system"
    assert "tutoies" in payload["messages"][0]["content"]
    # Le message utilisateur ne contient que des métadonnées.
    assert json.loads(payload["messages"][1]["content"])["event"]["family"] == "glass"


def test_invalid_json_is_retried_once():
    with TestClient(
        create_app(settings(**GROQ), transport=groq_transport(["pas du json", VALID]))
    ) as c:
        data = c.post("/api/chat", json=chat_body()).json()
    assert data["fallback"] is False
    assert data["reply"] == "On dirait du verre brisé."


def test_falls_back_to_templates_after_two_failures():
    bad = json.dumps({"reply": "", "recommendation": "x", "severity": "panique"})
    with TestClient(create_app(settings(**GROQ), transport=groq_transport([bad, bad]))) as c:
        data = c.post("/api/chat", json=chat_body()).json()
    assert data["fallback"] is True
    assert "verre" in data["reply"]


def test_provider_error_falls_back():
    with TestClient(create_app(settings(**GROQ), transport=groq_transport([], status=429))) as c:
        data = c.post("/api/chat", json=chat_body()).json()
    assert data["fallback"] is True


def test_ollama_request_format():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"message": {"content": VALID}})

    s = settings(
        llm_provider="ollama", llm_model="petit-modele", ollama_base_url="http://ollama:11434"
    )
    with TestClient(create_app(s, transport=httpx.MockTransport(handler))) as c:
        assert c.post("/api/chat", json=chat_body()).json()["fallback"] is False
    payload = json.loads(seen[0].content)
    assert seen[0].url == "http://ollama:11434/api/chat"
    assert payload["format"] == "json"
    assert payload["stream"] is False


def test_groq_requires_key_and_model():
    with (
        pytest.raises(ValueError, match="GROQ_API_KEY"),
        TestClient(create_app(settings(llm_provider="groq", llm_model="m"))),
    ):
        pass


def test_logs_never_contain_conversation(caplog):
    caplog.set_level("INFO")
    with TestClient(create_app(settings(**GROQ), transport=groq_transport(["oups", "oups"]))) as c:
        body = chat_body()
        body["message"] = "message très personnel"
        c.post("/api/chat", json=body)
    assert "très personnel" not in caplog.text
    assert "oups" not in caplog.text
