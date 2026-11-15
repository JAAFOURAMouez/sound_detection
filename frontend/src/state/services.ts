// Services partagés entre stores : base locale et enregistreur d'événements.

import { EventStore } from '../events/db';
import { EventRecorder } from '../events/recorder';

export const eventStore = new EventStore();

type ClipSource = (from: number, to: number) => Float32Array | null;
let clipSource: ClipSource | null = null;

/** La session audio en cours fournit les extraits (positions du flux envoyé à l'analyse). */
export function setClipSource(source: ClipSource | null): void {
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
  clip: (from, to) => clipSource?.(from, to) ?? null,
  position: () => positionSource?.() ?? null,
});
