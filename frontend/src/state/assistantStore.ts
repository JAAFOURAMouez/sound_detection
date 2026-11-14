// Pilote de l'assistant : relie la machine à états (pure) aux effets réels — voix,
// dictée, appels au backend, sourdine de la détection, statut des événements.

import { createStore, useStore } from 'zustand';
import { type AssistantApi, createApi, toChatPayload } from '../assistant/api';
import {
  type DialogEffect,
  type DialogInput,
  type DialogState,
  initialDialog,
  reduce,
} from '../assistant/machine';
import {
  createSpeaker,
  listenOnce,
  recognitionConstructor,
  type Speaker,
} from '../assistant/speech';
import { appendNote, fallbackAnswer } from '../assistant/templates';
import type { SoundEvent } from '../events/types';
import { historyStore } from './historyStore';
import { recorder } from './services';

export type BackendStatus = 'unknown' | 'waking' | 'online' | 'offline';

export interface AssistantState {
  dialog: DialogState;
  backend: BackendStatus;
  voice: boolean;
  dictation: { available: boolean; active: boolean };
  wake: () => Promise<void>;
  onEvent: (event: SoundEvent) => void;
  submit: (text: string) => void;
  dictate: () => Promise<void>;
  setVoice: (enabled: boolean) => void;
  reset: () => void;
}

export interface AssistantDeps {
  api: AssistantApi;
  speaker: (enabled: () => boolean) => Speaker;
  recognition: ReturnType<typeof recognitionConstructor>;
  mute: (muted: boolean) => void;
  markEvent: (id: string, status: 'asked' | 'answered' | 'dismissed') => void;
  latestEvent: (id: string) => SoundEvent | null;
  /** Ajoute l'explication de l'utilisateur à la note de l'événement (journal). */
  addNote: (id: string, text: string) => void;
  now: () => number;
  /** Délai d'écoute sans réponse avant de rendre la main. */
  listenTimeoutMs?: number;
  /** Sourdine maintenue après la parole (la fenêtre d'analyse dure 1 s). */
  muteTailMs?: number;
}

export function createAssistantStore(deps: AssistantDeps) {
  const listenTimeout = deps.listenTimeoutMs ?? 25_000;
  const muteTail = deps.muteTailMs ?? 1_500;
  let speechToken = 0;
  let unmuteTimer: ReturnType<typeof setTimeout> | null = null;
  let listenTimer: ReturnType<typeof setTimeout> | null = null;
  let stopDictation: (() => void) | null = null;

  const store = createStore<AssistantState>()((set, get) => {
    const speaker = deps.speaker(() => get().voice);

    const dispatch = (input: DialogInput) => {
      const { state, effects } = reduce(get().dialog, input);
      set({ dialog: state });
      if (listenTimer) clearTimeout(listenTimer);
      listenTimer = null;
      if (state.phase === 'listening') {
        listenTimer = setTimeout(() => {
          dispatch({ type: 'timeout' });
        }, listenTimeout);
      }
      effects.forEach(run);
    };

    const say = (text: string) => {
      const token = ++speechToken;
      if (unmuteTimer) clearTimeout(unmuteTimer);
      deps.mute(true);
      void speaker.speak(text).then(() => {
        unmuteTimer = setTimeout(() => {
          if (token === speechToken) deps.mute(false);
        }, muteTail);
        if (token === speechToken) dispatch({ type: 'spoken' });
      });
    };

    const ask = async (effect: Extract<DialogEffect, { type: 'ask' }>) => {
      const event = deps.latestEvent(effect.event.id) ?? effect.event;
      try {
        const answer = await deps.api.chat(toChatPayload(event, effect.history, effect.message));
        set({ backend: 'online' });
        dispatch({ type: 'answer', answer });
      } catch {
        // Backend endormi, lent ou absent : réponse locale, l'interface reste utilisable.
        set({ backend: 'offline' });
        dispatch({ type: 'answer', answer: fallbackAnswer(event) });
      }
    };

    function run(effect: DialogEffect) {
      switch (effect.type) {
        case 'say':
          say(effect.text);
          break;
        case 'cancelSpeech':
          speechToken++;
          speaker.cancel();
          if (unmuteTimer) clearTimeout(unmuteTimer);
          unmuteTimer = setTimeout(() => {
            deps.mute(false);
          }, muteTail);
          break;
        case 'ask':
          void ask(effect);
          break;
        case 'mark':
          deps.markEvent(effect.eventId, effect.status);
          break;
        case 'note':
          deps.addNote(effect.eventId, effect.text);
          break;
      }
    }

    return {
      dialog: initialDialog,
      backend: 'unknown',
      voice: true,
      dictation: { available: deps.recognition !== null, active: false },

      async wake() {
        set({ backend: 'waking' });
        set({ backend: (await deps.api.health()) ? 'online' : 'offline' });
      },

      onEvent(event) {
        dispatch({ type: 'event', event, now: deps.now() });
      },

      submit(text) {
        dispatch({ type: 'user', text });
      },

      async dictate() {
        const Ctor = deps.recognition;
        if (!Ctor || get().dictation.active) return;
        speaker.cancel();
        set({ dictation: { available: true, active: true } });
        const session = listenOnce(Ctor);
        stopDictation = session.stop;
        const text = await session.result;
        stopDictation = null;
        set({ dictation: { available: true, active: false } });
        if (text) dispatch({ type: 'user', text });
      },

      setVoice(enabled) {
        set({ voice: enabled });
        if (!enabled) speaker.cancel();
      },

      reset() {
        stopDictation?.();
        if (listenTimer) clearTimeout(listenTimer);
        dispatch({ type: 'reset' });
      },
    };
  });
  return store;
}

const apiUrl = import.meta.env.VITE_API_URL;

export const assistantStore = createAssistantStore({
  api: createApi(apiUrl),
  speaker: (enabled) => createSpeaker(undefined, { enabled }),
  recognition: typeof window === 'undefined' ? null : recognitionConstructor(window),
  mute: (muted) => {
    recorder.setMuted(muted);
  },
  markEvent: (id, status) => {
    void historyStore.getState().setDialogStatus(id, status);
  },
  latestEvent: (id) => historyStore.getState().events.find((e) => e.id === id) ?? null,
  addNote: (id, text) => {
    const history = historyStore.getState();
    const current = history.events.find((e) => e.id === id)?.note ?? '';
    void history.updateNote(id, appendNote(current, text));
  },
  now: () => Date.now(),
});

// L'assistant prend l'initiative dès l'ouverture d'un événement (latence minimale).
recorder.subscribe((changes) => {
  for (const change of changes) {
    if (change.kind === 'opened') assistantStore.getState().onEvent(change.event);
  }
});

export function useAssistantStore<T>(selector: (state: AssistantState) => T): T {
  return useStore(assistantStore, selector);
}
