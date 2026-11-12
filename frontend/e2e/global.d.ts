import type { StoreApi } from 'zustand';
import type { AppState } from '../src/state/appStore';

declare global {
  interface Window {
    __soundguard?: StoreApi<AppState>;
  }
}
