// Machine à états du dialogue (pure, testable sans navigateur).
// idle → speaking (phrase d'ouverture) → listening → thinking → speaking (réponse) → listening → idle

import type { SoundEvent } from '../events/types';
import { type Intent, parseIntent } from './intent';
import {
  type AssistantAnswer,
  eventLabelFor,
  explanationAnswer,
  LINES,
  openingLine,
} from './templates';

export type Phase = 'idle' | 'speaking' | 'listening' | 'thinking';

export interface Turn {
  role: 'assistant' | 'user';
  content: string;
}

export interface DialogState {
  phase: Phase;
  /** Phase qui suit la fin de la parole en cours. */
  afterSpeech: 'listening' | 'idle';
  event: SoundEvent | null;
  /** Dernière ligne prononcée ou affichée par l'assistant. */
  line: string;
  answer: AssistantAnswer | null;
  transcript: Turn[];
  lastPromptAt: number;
  /** Familles (ou « unknown ») à ne plus signaler pendant la session. */
  ignored: string[];
}

export type DialogInput =
  | { type: 'event'; event: SoundEvent; now: number }
  | { type: 'spoken' }
  | { type: 'user'; text: string }
  | { type: 'answer'; answer: AssistantAnswer }
  | { type: 'timeout' }
  | { type: 'reset' };

export type DialogEffect =
  | { type: 'say'; text: string }
  | { type: 'ask'; message: string; event: SoundEvent; history: Turn[] }
  | { type: 'mark'; eventId: string; status: 'asked' | 'answered' | 'dismissed' }
  /** L'utilisateur a donné l'origine du son : elle rejoint la note de l'événement. */
  | { type: 'note'; eventId: string; text: string }
  | { type: 'cancelSpeech' };

export const PROMPT_INTERVAL_MS = 30_000;
export const MAX_HISTORY = 6;

export const initialDialog: DialogState = {
  phase: 'idle',
  afterSpeech: 'idle',
  event: null,
  line: '',
  answer: null,
  transcript: [],
  lastPromptAt: Number.NEGATIVE_INFINITY,
  ignored: [],
};

export function ignoreKey(event: Pick<SoundEvent, 'type' | 'family'>): string {
  return event.type === 'known' && event.family ? event.family : 'unknown';
}

/** L'assistant peut-il interpeller pour cet événement maintenant ? */
export function shouldPrompt(state: DialogState, event: SoundEvent, now: number): boolean {
  return (
    state.phase === 'idle' &&
    event.type !== 'drift' &&
    event.severity >= 1 &&
    !state.ignored.includes(ignoreKey(event)) &&
    now - state.lastPromptAt >= PROMPT_INTERVAL_MS
  );
}

function say(state: DialogState, text: string, afterSpeech: 'listening' | 'idle'): DialogState {
  return {
    ...state,
    phase: 'speaking',
    afterSpeech,
    line: text,
    transcript: [...state.transcript, { role: 'assistant' as const, content: text }].slice(
      -MAX_HISTORY,
    ),
  };
}

export function reduce(
  state: DialogState,
  input: DialogInput,
): { state: DialogState; effects: DialogEffect[] } {
  switch (input.type) {
    case 'event': {
      if (!shouldPrompt(state, input.event, input.now)) return { state, effects: [] };
      const text = openingLine(input.event);
      const next = say(
        { ...state, event: input.event, answer: null, transcript: [], lastPromptAt: input.now },
        text,
        'listening',
      );
      return {
        state: next,
        effects: [
          { type: 'say', text },
          { type: 'mark', eventId: input.event.id, status: 'asked' },
        ],
      };
    }
    case 'spoken':
      return state.phase === 'speaking'
        ? { state: { ...state, phase: state.afterSpeech }, effects: [] }
        : { state, effects: [] };
    case 'user': {
      const event = state.event;
      if (!event || state.phase === 'idle') return { state, effects: [] };
      const text = input.text.trim();
      const intent: Intent = parseIntent(text);
      const withUser = {
        ...state,
        transcript: [...state.transcript, { role: 'user' as const, content: text }].slice(
          -MAX_HISTORY,
        ),
      };
      if (intent === 'yes' || intent === 'question') {
        return {
          state: { ...withUser, phase: 'thinking', line: LINES.thinking },
          effects: [
            { type: 'cancelSpeech' },
            { type: 'ask', message: text, event, history: state.transcript.slice(-MAX_HISTORY) },
          ],
        };
      }
      if (intent === 'explain') {
        const answer = explanationAnswer(event, text);
        const line = `${answer.reply} ${answer.recommendation}`;
        return {
          state: say({ ...withUser, answer }, line, 'listening'),
          effects: [
            { type: 'cancelSpeech' },
            { type: 'note', eventId: event.id, text },
            { type: 'say', text: line },
            { type: 'mark', eventId: event.id, status: 'answered' },
          ],
        };
      }
      const dismissed: DialogEffect = {
        type: 'mark',
        eventId: event.id,
        status: state.answer ? 'answered' : 'dismissed',
      };
      if (intent === 'stop') {
        return {
          state: { ...withUser, phase: 'idle', line: LINES.stopped },
          effects: [{ type: 'cancelSpeech' }, dismissed],
        };
      }
      if (intent === 'ignore') {
        const key = ignoreKey(event);
        const text = LINES.ignored(eventLabelFor(event) ?? 'son inconnu');
        return {
          state: say({ ...withUser, ignored: [...new Set([...state.ignored, key])] }, text, 'idle'),
          effects: [{ type: 'cancelSpeech' }, { type: 'say', text }, dismissed],
        };
      }
      return {
        state: say(withUser, LINES.dismissed, 'idle'),
        effects: [{ type: 'cancelSpeech' }, { type: 'say', text: LINES.dismissed }, dismissed],
      };
    }
    case 'answer': {
      if (state.phase !== 'thinking' || !state.event) return { state, effects: [] };
      const text = `${input.answer.reply} ${input.answer.recommendation}`;
      return {
        state: say({ ...state, answer: input.answer }, text, 'listening'),
        effects: [
          { type: 'say', text },
          { type: 'mark', eventId: state.event.id, status: 'answered' },
        ],
      };
    }
    case 'timeout': {
      if (state.phase !== 'listening' || !state.event) return { state, effects: [] };
      return {
        state: { ...state, phase: 'idle' },
        effects: [
          {
            type: 'mark',
            eventId: state.event.id,
            status: state.answer ? 'answered' : 'dismissed',
          },
        ],
      };
    }
    case 'reset':
      return { state: { ...initialDialog }, effects: [{ type: 'cancelSpeech' }] };
  }
}
