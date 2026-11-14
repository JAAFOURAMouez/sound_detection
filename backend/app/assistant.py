"""Appel du LLM avec validation stricte de la sortie, une nouvelle tentative, puis repli."""

import json
import logging
from functools import cache
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.fallback import chat_fallback, report_fallback
from app.llm.base import LLMError, LLMProvider
from app.schemas import (
    AssistantAnswer,
    ChatRequest,
    ChatResponse,
    ReportAnswer,
    ReportRequest,
    ReportResponse,
)

logger = logging.getLogger("soundguard")
PROMPTS = Path(__file__).parent / "prompts"
T = TypeVar("T", bound=BaseModel)


@cache
def prompt(name: str) -> str:
    return (PROMPTS / name).read_text(encoding="utf-8")


async def _ask(provider: LLMProvider, system: str, user: str, schema: type[T]) -> T | None:
    """Deux essais au plus ; None si le fournisseur échoue ou répond hors format."""
    for attempt in (1, 2):
        try:
            raw = await provider.complete(system, user)
            return schema.model_validate(json.loads(raw))
        except (LLMError, ValueError, ValidationError) as error:
            # Jamais de contenu de conversation dans les journaux : seulement le type d'erreur.
            logger.warning("LLM %s, essai %d : %s", provider.name, attempt, type(error).__name__)
    return None


async def chat(provider: LLMProvider, request: ChatRequest) -> ChatResponse:
    user = request.model_dump_json()
    answer = await _ask(provider, prompt("assistant_fr.md"), user, AssistantAnswer)
    if answer is None:
        return ChatResponse(**chat_fallback(request).model_dump(), fallback=True)
    return ChatResponse(**answer.model_dump())


async def report(provider: LLMProvider, request: ReportRequest) -> ReportResponse:
    user = request.model_dump_json()
    answer = await _ask(provider, prompt("report_fr.md"), user, ReportAnswer)
    if answer is None:
        return ReportResponse(**report_fallback(request).model_dump(), fallback=True)
    return ReportResponse(**answer.model_dump())
