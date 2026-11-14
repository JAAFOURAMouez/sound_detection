import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpeaker, listenOnce, recognitionConstructor } from './speech';

afterEach(() => {
  vi.useRealTimers();
});

describe('synthèse vocale', () => {
  it('se termine même sans événement « end » (minuteur de secours)', async () => {
    vi.useFakeTimers();
    const speak = vi.fn();
    const synth = {
      speak,
      cancel: vi.fn(),
      getVoices: () => [],
    } as unknown as SpeechSynthesis;
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        lang = '';
        voice = null;
        onend = null;
        onerror = null;
        constructor(public text: string) {}
      },
    );
    const speaker = createSpeaker(synth);
    let done = false;
    void speaker.speak('Bonjour').then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(done).toBe(true);
    expect(speak).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('ne parle pas quand la voix est coupée, et peut être interrompu', async () => {
    const speak = vi.fn();
    const synth = {
      speak,
      cancel: vi.fn(),
      getVoices: () => [],
    } as unknown as SpeechSynthesis;
    const speaker = createSpeaker(synth, { enabled: () => false });
    const pending = speaker.speak('Un texte assez long pour durer');
    speaker.cancel();
    await pending;
    expect(speak).not.toHaveBeenCalled();
  });
});

describe('dictée', () => {
  it('détecte l’absence de reconnaissance vocale', () => {
    expect(recognitionConstructor({})).toBeNull();
    class Fake {
      readonly kind = 'fake';
    }
    expect(recognitionConstructor({ webkitSpeechRecognition: Fake })).toBe(Fake);
  });

  it('renvoie la transcription', async () => {
    class Fake {
      lang = '';
      interimResults = true;
      maxAlternatives = 3;
      onresult: ((e: { results: { transcript: string }[][] }) => void) | null = null;
      onerror = null;
      onend = null;
      start() {
        setTimeout(() => this.onresult?.({ results: [[{ transcript: 'oui' }]] }), 0);
      }
      stop() {}
    }
    const { result } = listenOnce(Fake as never);
    await expect(result).resolves.toBe('oui');
  });
});
