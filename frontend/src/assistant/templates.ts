// Phrases locales de l'assistant : la première est instantanée (aucun réseau) ; les autres
// servent de repli si le backend est lent ou indisponible.

import type { SoundEvent } from '../events/types';
import { familyLabel } from '../ui/labels';

export type AnswerSeverity = 'information' | 'verification' | 'alerte';

export interface AssistantAnswer {
  reply: string;
  recommendation: string;
  severity: AnswerSeverity;
  fallback: boolean;
}

const DISCLAIMER = 'Je ne suis pas un dispositif de sécurité certifié.';

export function answerSeverity(level: number): AnswerSeverity {
  return level >= 3 ? 'alerte' : level >= 1 ? 'verification' : 'information';
}

export function eventLabelFor(event: Pick<SoundEvent, 'type' | 'family'>): string | null {
  return event.type === 'known' && event.family ? familyLabel(event.family) : null;
}

export function openingLine(event: Pick<SoundEvent, 'type' | 'family'>): string {
  const label = eventLabelFor(event);
  return label
    ? `J’ai entendu un son qui ressemble à : ${label}. Souhaites-tu que j’analyse ce qui s’est passé ?`
    : 'J’ai détecté un bruit inhabituel. Souhaites-tu que j’analyse sa nature ?';
}

export const LINES = {
  dismissed: 'D’accord, je continue d’écouter.',
  stopped: 'Je me tais. Je continue d’écouter en silence.',
  ignored: (label: string) =>
    `Entendu : je ne te signalerai plus ce type de bruit (${label}) pendant cette session.`,
  thinking: 'Je regarde ça…',
  followUp: 'Tu peux me poser une question, ou dire « non » pour arrêter.',
};

/** Réponse construite localement (backend injoignable ou trop lent). */
export function fallbackAnswer(
  event: Pick<SoundEvent, 'type' | 'family' | 'severity' | 'confidence' | 'scoreMax'>,
): AssistantAnswer {
  const severity = answerSeverity(event.severity);
  const label = eventLabelFor(event);
  const reply =
    event.type === 'known' && label
      ? `On dirait ${label}, avec une confiance de ${String(Math.round(event.confidence * 100))} %.`
      : `J’ai entendu un son inhabituel${event.scoreMax !== null ? ` (score d’anomalie ${event.scoreMax.toFixed(2)})` : ''}, mais il ne ressemble à rien que je reconnaisse avec assez de certitude.`;
  const recommendation =
    severity === 'alerte'
      ? `Vérifie sur place tout de suite. En cas de danger, appelle le 112. ${DISCLAIMER}`
      : severity === 'verification'
        ? 'Jette un œil ou tends l’oreille pour vérifier que tout va bien.'
        : 'Rien à faire, je continue d’écouter.';
  return { reply, recommendation, severity, fallback: true };
}
