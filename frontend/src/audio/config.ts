// Paramètres centralisés de la chaîne audio (voir docs/ARCHITECTURE.md).

/** Fréquence attendue par les modèles. */
export const TARGET_SAMPLE_RATE = 16_000;

/** Durée du tampon circulaire, en secondes. */
export const RING_BUFFER_SECONDS = 10;

/** Fenêtre d'analyse et pas, en secondes (utilisés à partir de la phase 2). */
export const ANALYSIS_WINDOW_SECONDS = 1;
export const ANALYSIS_HOP_SECONDS = 0.5;

/** Taille des blocs envoyés par le worklet : 100 ms à 16 kHz. */
export const WORKLET_CHUNK_SAMPLES = 1_600;

/**
 * Filtre anti-repliement du rééchantillonneur.
 * - taps par phase : longueur du filtre exprimée en échantillons d'entrée ;
 * - coupure : fraction de la fréquence de Nyquist de sortie (8 kHz) ;
 * - beta : paramètre de la fenêtre de Kaiser (≈ 86 dB d'atténuation).
 */
export const RESAMPLER_TAPS_PER_PHASE = 128;
export const RESAMPLER_CUTOFF = 0.85;
export const RESAMPLER_KAISER_BETA = 8.6;

/** Contraintes micro : on coupe tous les traitements automatiques du navigateur. */
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
};

/** Visualisation (AnalyserNode, indépendante de la chaîne des modèles). */
export const VIZ_FFT_SIZE = 2_048;
export const VIZ_MEL_BANDS = 64;
export const VIZ_MAX_FREQUENCY = 8_000;
export const VIZ_MIN_DB = -100;
export const VIZ_MAX_DB = -20;
