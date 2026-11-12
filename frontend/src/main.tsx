import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { appStore } from './state/appStore';

// Point d'observation réservé au build de test de bout en bout (absent du build normal).
if (import.meta.env.VITE_E2E === '1') {
  (window as unknown as { __soundguard: typeof appStore }).__soundguard = appStore;
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Élément #root introuvable');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
