// Services partagés entre stores : base locale et enregistreur d'événements.

import { EventStore } from '../events/db';
import { EventRecorder } from '../events/recorder';

export const eventStore = new EventStore();

let clipSource: (() => Float32Array | null) | null = null;

/** La session audio en cours fournit l'extrait des 3 dernières secondes. */
export function setClipSource(source: (() => Float32Array | null) | null): void {
  clipSource = source;
}

let positionSource: (() => number) | null = null;

/** Position du flux envoyé à l'analyse (repère des fenêtres, pour ignorer la voix de l'assistant). */
export function setPositionSource(source: (() => number) | null): void {
  positionSource = source;
}

export const recorder = new EventRecorder({
  store: eventStore,
  now: () => Date.now(),
  newId: () => crypto.randomUUID(),
  clip: () => clipSource?.() ?? null,
  position: () => positionSource?.() ?? null,
});
