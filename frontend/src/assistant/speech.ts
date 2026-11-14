// Voix du navigateur : synthèse (speechSynthesis) et dictée (SpeechRecognition), avec détection
// des capacités et minuteurs de secours (certains navigateurs ne signalent jamais la fin).

export interface Speaker {
  speak(text: string): Promise<void>;
  cancel(): void;
}

/** Durée estimée d'une phrase lue (secours si l'événement « end » ne vient pas). */
export function estimatedSpeechMs(text: string): number {
  return 1_200 + text.length * 65;
}

export function createSpeaker(
  synth: SpeechSynthesis | undefined = typeof speechSynthesis === 'undefined'
    ? undefined
    : speechSynthesis,
  options: { enabled: () => boolean; lang?: string } = { enabled: () => true },
): Speaker {
  const lang = options.lang ?? 'fr-FR';
  let finish: (() => void) | null = null;
  return {
    speak(text) {
      return new Promise<void>((resolve) => {
        let done = false;
        const end = () => {
          if (done) return;
          done = true;
          finish = null;
          clearTimeout(timer);
          resolve();
        };
        finish = end;
        const silent = !synth || !options.enabled();
        // Sans voix, on laisse le temps de lire le texte affiché.
        const timer = setTimeout(
          end,
          silent ? Math.min(2_500, estimatedSpeechMs(text) / 2) : estimatedSpeechMs(text) + 2_000,
        );
        if (silent) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('fr'));
        if (voice) utterance.voice = voice;
        utterance.onend = end;
        utterance.onerror = end;
        synth.cancel();
        synth.speak(utterance);
      });
    },
    cancel() {
      synth?.cancel();
      finish?.();
    },
  };
}

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => RecognitionLike;

export function recognitionConstructor(scope: object = globalThis): RecognitionCtor | null {
  const s = scope as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return s.SpeechRecognition ?? s.webkitSpeechRecognition ?? null;
}

/** Une dictée : renvoie la transcription, ou null (silence, refus, erreur). */
export function listenOnce(
  Ctor: RecognitionCtor,
  lang = 'fr-FR',
  timeoutMs = 8_000,
): { result: Promise<string | null>; stop: () => void } {
  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  let settle: (value: string | null) => void = () => undefined;
  const result = new Promise<string | null>((resolve) => {
    let done = false;
    settle = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      recognition.stop();
      settle(null);
    }, timeoutMs);
  });
  recognition.onresult = (event) => {
    settle(event.results[0]?.[0]?.transcript ?? null);
  };
  recognition.onerror = () => {
    settle(null);
  };
  recognition.onend = () => {
    settle(null);
  };
  recognition.start();
  return {
    result,
    stop: () => {
      recognition.stop();
      settle(null);
    },
  };
}
