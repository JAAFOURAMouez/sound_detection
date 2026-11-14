import { t } from '../i18n';
import type { View } from '../state/historyStore';
import { VIEW_HASH } from './views';

export function ViewTabs({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <nav className="sg-tabs" aria-label={t.nav.label}>
      {(['listen', 'history', 'about'] as const).map((v) => (
        <a
          key={v}
          href={`#${VIEW_HASH[v]}`}
          className="sg-tabs__tab"
          aria-current={view === v ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            onChange(v);
          }}
        >
          {t.nav[v]}
        </a>
      ))}
    </nav>
  );
}
