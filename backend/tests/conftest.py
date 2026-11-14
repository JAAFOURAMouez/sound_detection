from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

ORIGIN = "http://localhost:5173"


def settings(**overrides) -> Settings:
    base = {"llm_provider": "mock", "allowed_origins": ORIGIN, "rate_limit_per_minute": 100}
    return Settings(_env_file=None, **{**base, **overrides})


@pytest.fixture
def client():
    with TestClient(create_app(settings())) as c:
        yield c


def chat_body(**event_overrides) -> dict:
    event = {
        "type": "known",
        "family": "glass",
        "family_label": "verre",
        "severity": 2,
        "confidence": 0.86,
        "score_max": 0.62,
        "level_db_max": -21.0,
        "duration_s": 1.5,
        "started_at": datetime(2026, 11, 12, 22, 4, 12, tzinfo=UTC).isoformat(),
        "top": [{"name": "Glass", "score": 0.8, "family": "glass"}],
        **event_overrides,
    }
    return {
        "event": event,
        "context": {
            "families": [{"family": "ambient", "share": 0.9}],
            "mean_level_db": -52,
            "level_std_db": 1.2,
        },
        "history": [{"role": "assistant", "content": "J'ai détecté un bruit inhabituel."}],
        "message": "oui",
    }
