// Services partagés entre stores : base locale et enregistreur d'événements.

import { EventStore } from '../events/db';
import { EventRecorder } from '../events/recorder';

export const eventStore = new EventStore();

let clipSource: (() => Float32Array | null) | null = null;

/** La session audio en cours fournit l'extrait des 3 dernières secondes. */
export function setClipSource(source: (() => Float32Array | null) | null): void {
  clipSource = source;
}

export const recorder = new EventRecorder({
  store: eventStore,
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
  clip: () => clipSource?.() ?? null,
});
