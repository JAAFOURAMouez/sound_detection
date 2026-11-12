import soundguard_ml


def test_target_sample_rate_is_16khz() -> None:
    assert soundguard_ml.SAMPLE_RATE == 16_000
