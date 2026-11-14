import type { DisplayStatus } from './displayStatus';

/** Forme propre à chaque état : lisible sans texte et sans couleur (docs/DESIGN.md). */
export function StatusGlyph({ status }: { status: DisplayStatus }) {
  const common = { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true } as const;
  switch (status) {
    case 'monitoring':
      return (
        <svg {...common} className="sg-glyph sg-glyph--live">
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="7" cy="7" r="2.5" fill="currentColor" />
        </svg>
      );
    case 'calibrating':
      // Anneau qui se remplit : la ligne de base se construit.
      return (
        <svg {...common} className="sg-glyph sg-glyph--calibrating">
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M7 1a6 6 0 0 1 6 6H7Z" fill="currentColor" />
        </svg>
      );
    case 'dialogue':
      // Onde : quelqu'un parle.
      return (
        <svg {...common} className="sg-glyph sg-glyph--dialogue">
          <rect x="1" y="5" width="2" height="4" fill="currentColor" />
          <rect x="4.5" y="2" width="2" height="10" fill="currentColor" />
          <rect x="8" y="3.5" width="2" height="7" fill="currentColor" />
          <rect x="11.5" y="5.5" width="1.5" height="3" fill="currentColor" />
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
