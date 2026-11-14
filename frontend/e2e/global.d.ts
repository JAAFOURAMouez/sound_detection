import type { StoreApi } from 'zustand';
import type { EventStore } from '../src/events/db';
import type { EventRecorder } from '../src/events/recorder';
import type { simulate } from '../src/lab/simulate';
import type { HistoryState } from '../src/state/historyStore';
import type { AppState } from '../src/state/appStore';

declare global {
  interface Window {
    __soundguard?: StoreApi<AppState>;
    __soundguardLab?: { simulate: typeof simulate };
    __soundguardHistory?: {
      store: StoreApi<HistoryState>;
      db: EventStore;
      recorder: EventRecorder;
    };
  }
}
