from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration lue depuis l'environnement (ou backend/.env en local)."""

    # backend/.env, quel que soit le dossier d'où le serveur est lancé.
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent / ".env", extra="ignore"
    )

    llm_provider: Literal["mock", "groq", "ollama"] = "mock"
    llm_model: str = ""
    groq_api_key: SecretStr = SecretStr("")
    groq_base_url: str = "https://api.groq.com/openai/v1"
    ollama_base_url: str = "http://localhost:11434"
    llm_timeout_seconds: float = 20.0
    allowed_origins: str = "http://localhost:5173"
    rate_limit_per_minute: int = 20
    max_body_bytes: int = 32_768
    # Derrière un proxy (Render), l'IP du client est dans X-Forwarded-For.
    trust_proxy: bool = False

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
