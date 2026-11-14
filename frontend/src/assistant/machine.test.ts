import { describe, expect, it } from 'vitest';
import type { SoundEvent } from '../events/types';
import {
  type DialogInput,
  type DialogState,
  initialDialog,
  PROMPT_INTERVAL_MS,
  reduce,
} from './machine';

const event = (id: string, over: Partial<SoundEvent> = {}): SoundEvent => ({
  id,
  sessionId: 's',
  start: 0,
  end: 0,
  type: 'known',
  family: 'glass',
  severity: 2,
  topK: [],
  scoreMax: 0.6,
  confidence: 0.85,
  levelDbMax: -20,
  context: { families: [], meanLevelDb: null, levelStdDb: null, frames: 0 },
  closed: false,
  dialogStatus: 'none',
  note: '',
  ...over,
});

function run(inputs: DialogInput[], start: DialogState = initialDialog) {
  let state = start;
  const effects = [];
  for (const input of inputs) {
    const r = reduce(state, input);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

const answer = {
  reply: 'On dirait du verre.',
  recommendation: 'Va voir.',
  severity: 'verification' as const,
  fallback: false,
};

describe('machine à états du dialogue', () => {
  it('interpelle, écoute, analyse puis répond', () => {
    const r1 = run([{ type: 'event', event: event('a'), now: 0 }]);
    expect(r1.state.phase).toBe('speaking');
    expect(r1.effects).toEqual([
      { type: 'say', text: expect.stringContaining('verre') as string },
      { type: 'mark', eventId: 'a', status: 'asked' },
    ]);
    const r2 = run([{ type: 'spoken' }, { type: 'user', text: 'oui' }], r1.state);
    expect(r2.state.phase).toBe('thinking');
    expect(r2.effects).toContainEqual(expect.objectContaining({ type: 'ask', message: 'oui' }));
    const r3 = run([{ type: 'answer', answer }, { type: 'spoken' }], r2.state);
    expect(r3.state.phase).toBe('listening');
    expect(r3.state.answer).toEqual(answer);
    expect(r3.effects).toContainEqual({ type: 'mark', eventId: 'a', status: 'answered' });
    expect(run([{ type: 'timeout' }], r3.state).state.phase).toBe('idle');
  });

  it('n’interpelle pas plus d’une fois toutes les 30 s', () => {
    const first = run([
      { type: 'event', event: event('a'), now: 1_000 },
      { type: 'spoken' },
      { type: 'user', text: 'non' },
      { type: 'spoken' },
    ]);
    expect(first.state.phase).toBe('idle');
    const tooSoon = run(
      [{ type: 'event', event: event('b'), now: 1_000 + PROMPT_INTERVAL_MS - 1 }],
      first.state,
    );
    expect(tooSoon.effects).toEqual([]);
    const later = run(
      [{ type: 'event', event: event('c'), now: 1_000 + PROMPT_INTERVAL_MS }],
      first.state,
    );
    expect(later.state.phase).toBe('speaking');
  });

  it('ne s’interrompt pas pour un nouvel événement pendant un dialogue', () => {
    const r = run([
      { type: 'event', event: event('a'), now: 0 },
      { type: 'event', event: event('b'), now: 60_000 },
    ]);
    expect(r.state.event?.id).toBe('a');
  });

  it('ignore ce type de bruit pour la suite de la session', () => {
    const r = run([
      { type: 'event', event: event('a'), now: 0 },
      { type: 'spoken' },
      { type: 'user', text: 'ignore ce type de bruit' },
      { type: 'spoken' },
      { type: 'event', event: event('b'), now: 100_000 },
    ]);
    expect(r.state.ignored).toEqual(['glass']);
    expect(r.state.event?.id).toBe('a');
    expect(r.effects).toContainEqual({ type: 'mark', eventId: 'a', status: 'dismissed' });
    // Une autre famille reste signalée.
    const other = run(
      [{ type: 'event', event: event('c', { family: 'alarm' }), now: 200_000 }],
      r.state,
    );
    expect(other.state.phase).toBe('speaking');
  });

  it('ne signale ni la dérive ni les événements sans gravité', () => {
    expect(
      run([{ type: 'event', event: event('d', { type: 'drift', severity: 0 }), now: 0 }]).effects,
    ).toEqual([]);
    expect(
      run([{ type: 'event', event: event('v', { family: 'voice', severity: 0 }), now: 0 }]).effects,
    ).toEqual([]);
  });

  it('se tait sur « stop » et coupe la voix', () => {
    const r = run([
      { type: 'event', event: event('a'), now: 0 },
      { type: 'user', text: 'stop' },
    ]);
    expect(r.state.phase).toBe('idle');
    expect(r.effects).toContainEqual({ type: 'cancelSpeech' });
  });

  it('ignore une réponse tardive après la fin du dialogue', () => {
    const r = run([{ type: 'answer', answer }]);
    expect(r.effects).toEqual([]);
  });
});
