"""Outils d'entraînement et d'export des modèles SoundGuard."""

SAMPLE_RATE = 16_000
"""Fréquence d'échantillonnage commune au navigateur et aux modèles."""

WINDOW_SAMPLES = SAMPLE_RATE
"""Fenêtre d'analyse des modèles maison : 1 s."""

__all__ = ["SAMPLE_RATE", "WINDOW_SAMPLES"]
