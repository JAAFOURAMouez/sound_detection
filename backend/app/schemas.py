"""Contrats de l'API. Le navigateur n'envoie que des métadonnées d'événements, jamais d'audio."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["information", "verification", "alerte"]


class ClassScore(BaseModel):
    name: str = Field(max_length=80)
    score: float = Field(ge=0, le=1)
    family: str | None = Field(default=None, max_length=40)


class EventSummary(BaseModel):
    type: Literal["known", "unknown", "drift"]
    family: str | None = Field(default=None, max_length=40)
    family_label: str | None = Field(default=None, max_length=60)
    severity: int = Field(ge=0, le=3)
    confidence: float = Field(ge=0, le=1)
    score_max: float | None = Field(default=None, ge=0, le=1)
    level_db_max: float | None = Field(default=None, ge=-200, le=20)
    duration_s: float = Field(ge=0, le=86_400)
    started_at: datetime
    top: list[ClassScore] = Field(default_factory=list, max_length=5)


class FamilyShare(BaseModel):
    family: str = Field(max_length=40)
    share: float = Field(ge=0, le=1)


class MinuteContext(BaseModel):
    families: list[FamilyShare] = Field(default_factory=list, max_length=5)
    mean_level_db: float | None = Field(default=None, ge=-200, le=20)
    level_std_db: float | None = Field(default=None, ge=0, le=200)


class Turn(BaseModel):
    role: Literal["assistant", "user"]
    content: str = Field(max_length=500)


class ChatRequest(BaseModel):
    event: EventSummary
    context: MinuteContext = Field(default_factory=MinuteContext)
    history: list[Turn] = Field(default_factory=list, max_length=6)
    message: str = Field(default="", max_length=500)


class AssistantAnswer(BaseModel):
    """Format JSON imposé au LLM (validé avant d'être renvoyé)."""

    reply: str = Field(min_length=1, max_length=600)
    recommendation: str = Field(min_length=1, max_length=300)
    severity: Severity


class ChatResponse(AssistantAnswer):
    fallback: bool = False


class ReportEvent(BaseModel):
    type: Literal["known", "unknown", "drift"]
    family: str | None = Field(default=None, max_length=40)
    family_label: str | None = Field(default=None, max_length=60)
    severity: int = Field(ge=0, le=3)
    started_at: datetime
    duration_s: float = Field(ge=0, le=86_400)
    note: str = Field(default="", max_length=500)


class ReportRequest(BaseModel):
    events: list[ReportEvent] = Field(max_length=500)
    session_minutes: float = Field(default=0, ge=0, le=100_000)


class ReportAnswer(BaseModel):
    summary: str = Field(min_length=1, max_length=1_500)
    highlights: list[str] = Field(default_factory=list, max_length=5)


class ReportResponse(ReportAnswer):
    fallback: bool = False
