"""Ollama en local (/api/chat), réponse contrainte au format JSON."""

import httpx

from app.llm.base import LLMError


class OllamaProvider:
    name = "ollama"

    def __init__(self, client: httpx.AsyncClient, base_url: str, model: str):
        if not model:
            raise ValueError("LLM_MODEL manquant")
        self._client = client
        self._url = f"{base_url.rstrip('/')}/api/chat"
        self._model = model

    async def complete(self, system: str, user: str) -> str:
        payload = {
            "model": self._model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.3},
        }
        try:
            response = await self._client.post(self._url, json=payload)
        except httpx.HTTPError as error:
            raise LLMError(f"Ollama injoignable : {type(error).__name__}") from error
        if response.status_code != 200:
            raise LLMError(f"Ollama a répondu {response.status_code}")
        try:
            return response.json()["message"]["content"]
        except (KeyError, ValueError) as error:
            raise LLMError("Réponse Ollama inattendue") from error
