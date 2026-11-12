import type { AppStatus } from '../state/appStore';

/** Forme propre à chaque état : lisible sans couleur (docs/DESIGN.md). */
export function StatusGlyph({ status }: { status: AppStatus }) {
  const common = { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true } as const;
  switch (status) {
    case 'monitoring':
      return (
        <svg {...common} className="sg-glyph sg-glyph--live">
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="7" cy="7" r="2.5" fill="currentColor" />
        </svg>
      );
    case 'paused':
      return (
        <svg {...common} className="sg-glyph">
          <rect x="2.5" y="2" width="3" height="10" fill="currentColor" />
          <rect x="8.5" y="2" width="3" height="10" fill="currentColor" />
        </svg>
      );
    case 'error':
      return (
        <svg {...common} className="sg-glyph">
          <path d="M7 1.5 13 12.5H1Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case 'consent':
      return (
        <svg {...common} className="sg-glyph">
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeDasharray="2 2" />
        </svg>
      );
    case 'idle':
      return (
        <svg {...common} className="sg-glyph">
          <rect
            x="2"
            y="2"
            width="10"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      );
  }
}
