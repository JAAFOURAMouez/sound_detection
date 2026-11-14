"""Fournisseurs de LLM interchangeables (Groq en ligne, Ollama en local, mock pour les tests)."""

from typing import Protocol


class LLMError(Exception):
    """Le fournisseur n'a pas pu répondre (réseau, quota, format)."""


class LLMProvider(Protocol):
    name: str

    async def complete(self, system: str, user: str) -> str:
        """Renvoie le texte (censé être un objet JSON) produit pour ce prompt."""
        ...
