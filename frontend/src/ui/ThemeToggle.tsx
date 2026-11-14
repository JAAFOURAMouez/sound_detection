import { t } from '../i18n';
import { applyTheme, useTheme } from './theme';

/** Bascule sombre / papier millimétré : un bouton à deux états, annoncé comme tel. */
export function ThemeToggle() {
  const theme = useTheme();
  const light = theme === 'light';
  return (
    <button
      type="button"
      className="sg-icon-button sg-theme-toggle"
      aria-pressed={light}
      aria-label={t.theme.light}
      title={light ? t.theme.toDark : t.theme.toLight}
      onClick={() => {
        applyTheme(light ? 'dark' : 'light');
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {/* Papier millimétré : un carré quadrillé, plein quand le thème clair est actif. */}
        <rect
          x="1.5"
          y="1.5"
          width="11"
          height="11"
          fill={light ? 'currentColor' : 'none'}
          fillOpacity={light ? 0.25 : 1}
          stroke="currentColor"
        />
        <path d="M5.5 1.5v11M9.5 1.5v11M1.5 5.5h11M1.5 9.5h11" stroke="currentColor" />
      </svg>
    </button>
  );
}
