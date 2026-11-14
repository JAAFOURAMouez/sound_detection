import { describe, expect, it, vi } from 'vitest';
import type { SoundEvent } from '../events/types';
import { createApi, toChatPayload } from './api';

const event: SoundEvent = {
  id: 'e1',
  sessionId: 'session-secrete',
  start: Date.UTC(2026, 10, 12, 22, 4, 12),
  end: Date.UTC(2026, 10, 12, 22, 4, 13, 500),
  type: 'known',
  family: 'glass',
  severity: 2,
  topK: [{ index: 435, name: 'Glass', score: 0.8, family: 'glass' }],
  scoreMax: 0.62,
  confidence: 0.86,
  levelDbMax: -21,
  context: {
    families: [{ family: 'ambient', share: 0.9 }],
    meanLevelDb: -52,
    levelStdDb: 1.2,
    frames: 120,
  },
  closed: true,
  dialogStatus: 'none',
  note: 'note privée',
};

describe('toChatPayload', () => {
  it('n’envoie que des métadonnées (ni audio, ni session, ni note)', () => {
    const payload = toChatPayload(event, [{ role: 'assistant', content: 'Bonjour' }], 'oui');
    expect(payload.event).toMatchObject({
      family: 'glass',
      family_label: 'verre',
      duration_s: 1.5,
      started_at: '2026-11-12T22:04:12.000Z',
    });
    const text = JSON.stringify(payload);
    expect(text).not.toContain('session-secrete');
    expect(text).not.toContain('note privée');
  });
});

describe('createApi', () => {
  it('appelle /api/chat et valide la réponse', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            reply: 'R',
            recommendation: 'Va voir',
            severity: 'verification',
            fallback: false,
          }),
        ),
      ),
    );
    const api = createApi('http://api.test/', fetchMock);
    await expect(api.chat(toChatPayload(event, [], 'oui'))).resolves.toEqual({
      reply: 'R',
      recommendation: 'Va voir',
      severity: 'verification',
      fallback: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/chat',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('abandonne après le délai et rejette une réponse inattendue', async () => {
    const hanging = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('abandon'));
          });
        }),
    );
    const slow = createApi('http://api.test', hanging as unknown as typeof fetch, 20);
    await expect(slow.chat(toChatPayload(event, [], 'oui'))).rejects.toThrow('abandon');
    const odd = createApi('http://api.test', () => Promise.resolve(new Response('{}')));
    await expect(odd.chat(toChatPayload(event, [], 'oui'))).rejects.toThrow('inattendue');
  });

  it('signale l’absence de backend sans exception', async () => {
    expect(await createApi(undefined).health()).toBe(false);
    const down = createApi('http://api.test', () => Promise.reject(new Error('réseau')));
    expect(await down.health()).toBe(false);
  });
});
