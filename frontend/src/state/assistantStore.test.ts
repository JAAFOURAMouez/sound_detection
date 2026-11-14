import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssistantApi } from '../assistant/api';
import type { Speaker } from '../assistant/speech';
import type { SoundEvent } from '../events/types';
import { createAssistantStore } from './assistantStore';

const event: SoundEvent = {
  id: 'e1',
  sessionId: 's',
  start: 0,
  end: 0,
  type: 'known',
  family: 'glass',
  severity: 2,
  topK: [],
  scoreMax: 0.6,
  confidence: 0.86,
  levelDbMax: -20,
  context: { families: [], meanLevelDb: null, levelStdDb: null, frames: 0 },
  closed: false,
  dialogStatus: 'none',
  note: '',
};

function setup(api: Partial<AssistantApi> = {}) {
  let resolveSpeech: () => void = () => undefined;
  const spoken: string[] = [];
  const speaker: Speaker = {
    speak: (text) =>
      new Promise((resolve) => {
        spoken.push(text);
        resolveSpeech = resolve;
      }),
    cancel: () => {
      resolveSpeech();
    },
  };
  const mute = vi.fn();
  const markEvent = vi.fn();
  const chat = vi.fn(
    api.chat ??
      (() =>
        Promise.resolve({
          reply: 'On dirait du verre.',
          recommendation: 'Va voir.',
          severity: 'verification' as const,
          fallback: false,
        })),
  );
  const store = createAssistantStore({
    api: { health: api.health ?? (() => Promise.resolve(true)), chat },
    speaker: () => speaker,
    recognition: null,
    mute,
    markEvent,
    latestEvent: () => ({ ...event, closed: true }),
    now: () => 100_000,
    muteTailMs: 10,
  });
  const finishSpeech = async () => {
    resolveSpeech();
    await vi.waitFor(() => {
      expect(store.getState().dialog.phase).not.toBe('speaking');
    });
  };
  return { store, spoken, mute, markEvent, chat, finishSpeech };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('assistantStore', () => {
  it('interpelle avec une phrase locale et coupe la détection pendant la parole', async () => {
    const { store, spoken, mute, markEvent, finishSpeech } = setup();
    store.getState().onEvent(event);
    expect(spoken[0]).toContain('verre');
    expect(mute).toHaveBeenLastCalledWith(true);
    expect(markEvent).toHaveBeenCalledWith('e1', 'asked');
    await finishSpeech();
    expect(store.getState().dialog.phase).toBe('listening');
    await vi.waitFor(() => {
      expect(mute).toHaveBeenLastCalledWith(false);
    });
  });

  it('demande l’analyse au backend avec l’état le plus récent de l’événement', async () => {
    const { store, chat, markEvent, finishSpeech } = setup();
    store.getState().onEvent(event);
    await finishSpeech();
    store.getState().submit('oui');
    await vi.waitFor(() => {
      expect(store.getState().dialog.answer?.reply).toBe('On dirait du verre.');
    });
    expect(chat.mock.calls[0]?.[0]).toMatchObject({ message: 'oui', event: { family: 'glass' } });
    expect(store.getState().backend).toBe('online');
    expect(markEvent).toHaveBeenCalledWith('e1', 'answered');
  });

  it('répond localement si le backend échoue', async () => {
    const { store, finishSpeech } = setup({ chat: () => Promise.reject(new Error('endormi')) });
    store.getState().onEvent(event);
    await finishSpeech();
    store.getState().submit('oui');
    await vi.waitFor(() => {
      expect(store.getState().dialog.answer?.fallback).toBe(true);
    });
    expect(store.getState().backend).toBe('offline');
  });

  it('réveille le backend et reflète son état', async () => {
    const { store } = setup({ health: () => Promise.resolve(false) });
    await store.getState().wake();
    expect(store.getState().backend).toBe('offline');
  });

  it('indique l’absence de dictée', () => {
    expect(setup().store.getState().dictation.available).toBe(false);
  });
});
