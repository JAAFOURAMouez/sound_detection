"""Fournisseur déterministe, sans réseau : tests, démonstration hors-ligne, CI."""

import json

from app.fallback import chat_fallback, report_fallback
from app.schemas import ChatRequest, ReportRequest


class MockProvider:
    name = "mock"

    async def complete(self, system: str, user: str) -> str:
        data = json.loads(user)
        if "events" in data:
            return report_fallback(ReportRequest.model_validate(data)).model_dump_json()
        answer = chat_fallback(ChatRequest.model_validate(data))
        return answer.model_dump_json()
