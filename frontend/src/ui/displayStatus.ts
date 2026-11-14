import type { AppStatus } from '../state/appStore';

/** État affiché : celui de l'application, plus le dialogue avec l'assistant. */
export type DisplayStatus = AppStatus | 'dialogue';

export const DISPLAY_STATUSES: readonly DisplayStatus[] = [
  'idle',
  'consent',
  'calibrating',
  'monitoring',
  'dialogue',
  'paused',
  'error',
];

export function displayStatus(status: AppStatus, dialogue: boolean): DisplayStatus {
  return dialogue && (status === 'monitoring' || status === 'calibrating') ? 'dialogue' : status;
}
