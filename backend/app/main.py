import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import assistant
from app.config import Settings, get_settings
from app.guards import BodySizeLimit, RateLimiter, enforce_rate_limit
from app.llm.base import LLMProvider
from app.llm.mock import MockProvider
from app.llm.ollama import OllamaProvider
from app.llm.openai_compatible import GroqProvider
from app.schemas import ChatRequest, ChatResponse, ReportRequest, ReportResponse

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")


class HealthResponse(BaseModel):
    status: Literal["ok"]
    provider: str


def create_provider(settings: Settings, client: httpx.AsyncClient) -> LLMProvider:
    if settings.llm_provider == "groq":
        return GroqProvider(
            client,
            settings.groq_base_url,
            settings.groq_api_key.get_secret_value(),
            settings.llm_model,
        )
    if settings.llm_provider == "ollama":
        return OllamaProvider(client, settings.ollama_base_url, settings.llm_model)
    return MockProvider()


def create_app(
    settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None
) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with httpx.AsyncClient(
            timeout=settings.llm_timeout_seconds, transport=transport
        ) as client:
            app.state.provider = create_provider(settings, client)
            yield

    app = FastAPI(title="SoundGuard API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.rate_limiter = RateLimiter(settings.rate_limit_per_minute)
    app.add_middleware(BodySizeLimit, max_bytes=settings.max_body_bytes)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.get("/api/health")
    def health(request: Request) -> HealthResponse:
        return HealthResponse(status="ok", provider=request.app.state.settings.llm_provider)

    @app.post("/api/chat", dependencies=[Depends(enforce_rate_limit)])
    async def chat(body: ChatRequest, request: Request) -> ChatResponse:
        return await assistant.chat(request.app.state.provider, body)

    @app.post("/api/report", dependencies=[Depends(enforce_rate_limit)])
    async def report(body: ReportRequest, request: Request) -> ReportResponse:
        return await assistant.report(request.app.state.provider, body)

    return app


app = create_app()
