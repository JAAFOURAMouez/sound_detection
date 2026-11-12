import torch

from soundguard_ml.models import (
    AutoencoderConfig,
    ClassifierExport,
    ConvAutoencoder,
    SoundClassifier,
    count_parameters,
)


def test_classifier_shapes_and_size():
    model = SoundClassifier().eval()
    assert count_parameters(model) < 1_000_000
    with torch.no_grad():
        assert model(torch.randn(3, 16_000)).shape == (3, 50)
        # Longueur quelconque : un clip de 5 s passe aussi.
        assert model(torch.randn(1, 80_000)).shape == (1, 50)


def test_classifier_export_outputs_probabilities():
    with torch.no_grad():
        logits, probs = ClassifierExport(SoundClassifier().eval())(torch.randn(2, 16_000))
    assert logits.shape == probs.shape == (2, 50)
    torch.testing.assert_close(probs.sum(dim=-1), torch.ones(2))


def test_spec_augment_only_in_training():
    model = SoundClassifier().eval()
    x = torch.randn(2, 16_000)
    with torch.no_grad():
        torch.testing.assert_close(model.embed(x), model.embed(x))


def test_autoencoder_reconstructs_its_input_shape():
    model = ConvAutoencoder().eval()
    x = model.features(torch.randn(2, 16_000))
    assert x.shape == (2, 1, 64, AutoencoderConfig().frames)
    x_hat, z = model.reconstruct(x)
    assert x_hat.shape == x.shape
    assert z.shape[1] == AutoencoderConfig().bottleneck


def test_autoencoder_outputs_score_and_embedding():
    model = ConvAutoencoder().eval()
    with torch.no_grad():
        score, embedding = model(torch.randn(4, 16_000))
    assert score.shape == (4,)
    assert embedding.shape == (4, AutoencoderConfig().bottleneck)
    assert torch.all(score >= 0)
    assert count_parameters(model) < 500_000
