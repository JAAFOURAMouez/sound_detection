import type { StoreApi } from 'zustand';
import type { simulate } from '../src/lab/simulate';
import type { AppState } from '../src/state/appStore';

declare global {
  interface Window {
    __soundguard?: StoreApi<AppState>;
    __soundguardLab?: { simulate: typeof simulate };
  }
}
