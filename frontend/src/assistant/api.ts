// Client du backend de dialogue : seules des métadonnées d'événements sont envoyées.

import type { SoundEvent } from '../events/types';
import { familyLabel } from '../ui/labels';
import type { Turn } from './machine';
import type { AssistantAnswer } from './templates';

export const CHAT_TIMEOUT_MS = 8_000;

export interface ChatPayload {
  event: {
    type: SoundEvent['type'];
    family: string | null;
    family_label: string | null;
    severity: number;
    confidence: number;
    score_max: number | null;
    level_db_max: number | null;
    duration_s: number;
    started_at: string;
    top: { name: string; score: number; family: string | null }[];
  };
  context: {
    families: { family: string; share: number }[];
    mean_level_db: number | null;
    level_std_db: number | null;
  };
  history: Turn[];
  message: string;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Résumé envoyé au backend : pas d'audio, pas d'identifiant de session, pas de note libre. */
export function toChatPayload(event: SoundEvent, history: Turn[], message: string): ChatPayload {
  return {
    event: {
      type: event.type,
      family: event.family,
      family_label: event.family ? familyLabel(event.family) : null,
      severity: event.severity,
      confidence: clamp01(event.confidence),
      score_max: event.scoreMax === null ? null : clamp01(event.scoreMax),
      level_db_max: event.levelDbMax,
      duration_s: Math.max(0, (event.end - event.start) / 1000),
      started_at: new Date(event.start).toISOString(),
      top: event.topK
        .slice(0, 5)
        .map((c) => ({ name: c.name.slice(0, 80), score: clamp01(c.score), family: c.family })),
    },
    context: {
      families: event.context.families.slice(0, 5),
      mean_level_db: event.context.meanLevelDb,
      level_std_db: event.context.levelStdDb,
    },
    history: history.slice(-6).map((t) => ({ role: t.role, content: t.content.slice(0, 500) })),
    message: message.slice(0, 500),
  };
}

export interface AssistantApi {
  health(): Promise<boolean>;
  chat(payload: ChatPayload): Promise<AssistantAnswer>;
}

export function createApi(
  baseUrl: string | undefined,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  timeoutMs = CHAT_TIMEOUT_MS,
): AssistantApi {
  const url = (path: string) => `${(baseUrl ?? '').replace(/\/$/, '')}${path}`;
  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    if (!baseUrl) throw new Error('Aucun backend configuré');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      return await fetchImpl(url(path), { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async health() {
      try {
        const response = await call('/api/health');
        return response.ok;
      } catch {
        return false;
      }
    },
    async chat(payload) {
      const response = await call('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Backend : ${String(response.status)}`);
      const data = (await response.json()) as Partial<AssistantAnswer>;
      if (
        typeof data.reply !== 'string' ||
        typeof data.recommendation !== 'string' ||
        !data.severity
      ) {
        throw new Error('Réponse du backend inattendue');
      }
      return {
        reply: data.reply,
        recommendation: data.recommendation,
        severity: data.severity,
        fallback: data.fallback === true,
      };
    },
  };
}
