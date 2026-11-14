"""Groq expose une API compatible OpenAI (/chat/completions) avec un mode JSON."""

import httpx

from app.llm.base import LLMError


class GroqProvider:
    name = "groq"

    def __init__(self, client: httpx.AsyncClient, base_url: str, api_key: str, model: str):
        if not api_key:
            raise ValueError("GROQ_API_KEY manquante")
        if not model:
            raise ValueError("LLM_MODEL manquant")
        self._client = client
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._model = model

    async def complete(self, system: str, user: str) -> str:
        payload = {
            "model": self._model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0.3,
            "max_tokens": 500,
            "response_format": {"type": "json_object"},
        }
        try:
            response = await self._client.post(self._url, json=payload, headers=self._headers)
        except httpx.HTTPError as error:
            raise LLMError(f"Groq injoignable : {type(error).__name__}") from error
        if response.status_code != 200:
            raise LLMError(f"Groq a répondu {response.status_code}")
        try:
            return response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as error:
            raise LLMError("Réponse Groq inattendue") from error
