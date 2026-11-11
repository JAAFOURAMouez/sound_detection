import { t } from './i18n';

export function App() {
  return (
    <main>
      <h1>{t.app.name}</h1>
      <p>{t.app.tagline}</p>
      <p role="status">{t.app.status}</p>
    </main>
  );
}
