import { useEffect, useRef, useState } from 'react';
import type { DialogState } from '../assistant/machine';
import { t } from '../i18n';
import type { BackendStatus } from '../state/assistantStore';
import { type CanvasFrame, prefersReducedMotion, useCanvasLoop } from './useCanvasLoop';

interface TransmissionLineProps {
  dialog: DialogState;
  backend: BackendStatus;
  voice: boolean;
  dictation: { available: boolean; active: boolean };
  onSubmit: (text: string) => void;
  onDictate: () => void;
  onVoice: (enabled: boolean) => void;
}

const SEVERITY_MARKS = { information: '·', verification: '▮▮', alerte: '▮▮▮' } as const;

/** Texte qui s'écrit (instantané si l'utilisateur préfère réduire les animations). Remonté à
 * chaque nouvelle ligne grâce à sa clé. */
function Typewriter({ text }: { text: string }) {
  const [count, setCount] = useState(() => (prefersReducedMotion() ? text.length : 0));
  useEffect(() => {
    if (count >= text.length) return;
    const timer = setInterval(() => {
      setCount((c) => {
        if (c + 2 >= text.length) clearInterval(timer);
        return c + 2;
      });
    }, 24);
    return () => {
      clearInterval(timer);
    };
    // Une seule animation par ligne : `count` n'est volontairement pas une dépendance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return <span aria-hidden="true">{text.slice(0, count)}</span>;
}

/** Onde : réagit quand l'assistant parle (forte) ou attend une réponse (faible). */
function Wave({ phase }: { phase: DialogState['phase'] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const draw = ({ ctx, width, height, time }: CanvasFrame) => {
    ctx.clearRect(0, 0, width, height);
    const p = phaseRef.current;
    const amplitude =
      p === 'speaking' ? 0.42 : p === 'listening' ? 0.14 : p === 'thinking' ? 0.08 : 0;
    ctx.strokeStyle =
      getComputedStyle(document.documentElement).getPropertyValue('--sg-phosphor').trim() ||
      '#4ff0a8';
    ctx.globalAlpha = amplitude > 0 ? 1 : 0.4;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 2) {
      const env = Math.sin((Math.PI * x) / width);
      const y =
        height / 2 +
        env *
          amplitude *
          height *
          (Math.sin(x / 5 + time / 90) * 0.6 + Math.sin(x / 2.3 - time / 60) * 0.4);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  useCanvasLoop(canvasRef, draw, phase !== 'idle' && !prefersReducedMotion(), undefined, phase);
  return <canvas ref={canvasRef} className="sg-transmission__wave" aria-hidden="true" />;
}

export function TransmissionLine({
  dialog,
  backend,
  voice,
  dictation,
  onSubmit,
  onDictate,
  onVoice,
}: TransmissionLineProps) {
  const [draft, setDraft] = useState('');
  const line = dialog.phase === 'idle' && !dialog.line ? t.assistant.idle : dialog.line;
  const canAnswer = dialog.phase === 'listening' || dialog.phase === 'speaking';
  const answer = dialog.answer;

  return (
    <section
      className="sg-transmission"
      aria-labelledby="transmission-title"
      data-phase={dialog.phase}
    >
      <h2 id="transmission-title" className="sg-sr-only">
        {t.main.transmission}
      </h2>
      <div className="sg-transmission__head">
        <span className="sg-transmission__glyph" aria-hidden="true">
          {dialog.phase === 'listening' ? '◎' : dialog.phase === 'thinking' ? '…' : '◉'}
        </span>
        <Wave phase={dialog.phase} />
        <p className="sg-transmission__text" data-testid="assistant-line">
          <Typewriter key={line} text={line} />
          <span className="sg-sr-only" aria-live="polite">
            {line}
          </span>
        </p>
        <span className="sg-sr-only" role="status">
          {t.assistant.label} : {t.assistant.phases[dialog.phase]}
        </span>
      </div>

      {answer && (
        <p
          className="sg-transmission__recommendation"
          data-severity={answer.severity}
          data-testid="assistant-recommendation"
        >
          <span className="sg-label">{t.assistant.recommendation}</span>
          <span className="sg-transmission__marks" aria-hidden="true">
            {SEVERITY_MARKS[answer.severity]}
          </span>
          <span className="sg-sr-only">{t.assistant.severity[answer.severity]} :</span>
          <span>{answer.recommendation}</span>
          {answer.fallback && (
            <span className="sg-transmission__note">({t.assistant.localAnswer})</span>
          )}
        </p>
      )}

      <div className="sg-transmission__controls">
        {canAnswer && (
          <div
            className="sg-transmission__quick"
            role="group"
            aria-label={t.assistant.quickReplies}
          >
            {[
              [t.assistant.yes, 'oui'],
              [t.assistant.no, 'non'],
              [t.assistant.ignore, 'ignore ce type de bruit'],
            ].map(([label, text]) => (
              <button
                key={label}
                type="button"
                className="sg-button sg-button--small"
                onClick={() => {
                  onSubmit(text ?? '');
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {(canAnswer || dialog.phase === 'thinking') && (
          <form
            className="sg-transmission__form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              onSubmit(draft);
              setDraft('');
            }}
          >
            <label htmlFor="assistant-input" className="sg-sr-only">
              {t.assistant.inputLabel}
            </label>
            <input
              id="assistant-input"
              type="text"
              autoComplete="off"
              maxLength={500}
              value={draft}
              placeholder={t.assistant.inputPlaceholder}
              disabled={dialog.phase === 'thinking'}
              onChange={(e) => {
                setDraft(e.target.value);
              }}
            />
            <button
              type="submit"
              className="sg-button sg-button--small"
              disabled={dialog.phase === 'thinking'}
            >
              {t.assistant.send}
            </button>
            {dictation.available && (
              <button
                type="button"
                className="sg-icon-button"
                onClick={onDictate}
                disabled={dictation.active}
                aria-label={t.assistant.dictate}
                title={t.assistant.dictationNotice}
              >
                <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
                  <rect
                    x="3.5"
                    y="0.75"
                    width="5"
                    height="8"
                    rx="2.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M1 6.5a5 5 0 0 0 10 0M6 11.5V13.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              </button>
            )}
            {dictation.active && <span role="status">{t.assistant.dictating}</span>}
          </form>
        )}
        <div className="sg-transmission__meta">
          <span className="sg-transmission__backend" data-backend={backend}>
            {t.assistant.backend[backend]}
          </span>
          <button
            type="button"
            className="sg-button sg-button--small"
            aria-pressed={!voice}
            onClick={() => {
              onVoice(!voice);
            }}
          >
            {voice ? t.assistant.voiceOn : t.assistant.voiceOff}
          </button>
        </div>
      </div>
      {dictation.available && canAnswer && (
        <p className="sg-transmission__note">{t.assistant.dictationNotice}</p>
      )}
    </section>
  );
}
