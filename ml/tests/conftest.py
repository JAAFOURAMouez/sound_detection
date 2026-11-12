import numpy as np
import pytest

from soundguard_ml import SAMPLE_RATE


def sine(freq: float, seconds: float = 1.0, amplitude: float = 0.5) -> np.ndarray:
    t = np.arange(int(SAMPLE_RATE * seconds)) / SAMPLE_RATE
    return (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)


@pytest.fixture
def rng() -> np.random.Generator:
    return np.random.default_rng(1234)
