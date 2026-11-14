import { useEffect, useRef, useState } from 'react';
import type { SoundEvent } from '../events/types';
import { t } from '../i18n';
import { eventColorKey, eventLabel, formatDateTime } from './eventFormat';
import { familyLabel } from './labels';
import { Severity } from './Severity';

interface EventSheetProps {
  event: SoundEvent | null;
  clip: Float32Array | null;
  onClose: () => void;
  onSaveNote: (id: string, note: string) => Promise<void>;
}

function playClip(clip: Float32Array) {
  const ctx = new AudioContext({ sampleRate: 16_000 });
  const buffer = ctx.createBuffer(1, clip.length, 16_000);
  buffer.copyToChannel(Float32Array.from(clip), 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => void ctx.close();
  source.start();
}

export function EventSheet({ event, clip, onClose, onSaveNote }: EventSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (event && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!event && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [event]);

  const duration = event ? ((event.end - event.start) / 1000).toFixed(1) : '';
  const context = event?.context;

  return (
    <dialog ref={dialogRef} className="sg-sheet" aria-labelledby="sheet-title" onClose={onClose}>
      {event && (
        <article className="sg-sheet__body">
          <header className="sg-sheet__header">
            <p className="sg-label">{t.events.sheetTitle}</p>
            <h2 id="sheet-title" style={{ color: `var(--sg-family-${eventColorKey(event)})` }}>
              {eventLabel(event)} <Severity level={event.severity} />
            </h2>
            <button
              type="button"
              className="sg-icon-button"
              onClick={onClose}
              aria-label={t.events.close}
            >
              ×
            </button>
          </header>
          <dl className="sg-sheet__facts">
            <dt>{t.events.type}</dt>
            <dd>{t.events.types[event.type]}</dd>
            <dt>{t.events.when}</dt>
            <dd>{formatDateTime(event.start)}</dd>
            <dt>{t.events.duration}</dt>
            <dd>{duration} s</dd>
            {event.scoreMax !== null && (
              <>
                <dt>{t.events.score}</dt>
                <dd>{event.scoreMax.toFixed(2)}</dd>
              </>
            )}
            {event.type === 'known' && (
              <>
                <dt>{t.events.confidence}</dt>
                <dd>{event.confidence.toFixed(2)}</dd>
              </>
            )}
            {event.levelDbMax !== null && (
              <>
                <dt>{t.events.level}</dt>
                <dd>{event.levelDbMax.toFixed(0)} dBFS</dd>
              </>
            )}
          </dl>
          {event.topK.length > 0 && (
            <section>
              <h3 className="sg-label">{t.events.classes}</h3>
              <ol className="sg-sheet__classes">
                {event.topK.map((c) => (
                  <li key={c.index}>
                    {c.name} <span className="sg-sheet__dim">{familyLabel(c.family)}</span>{' '}
                    {c.score.toFixed(2)}
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section>
            <h3 className="sg-label">{t.events.context}</h3>
            {context && context.frames > 0 ? (
              <p className="sg-sheet__context">
                {context.families
                  .slice(0, 3)
                  .map(
                    (f) =>
                      `${f.family === 'none' ? '—' : familyLabel(f.family)} ${String(Math.round(f.share * 100))} %`,
                  )
                  .join(' · ')}
                {context.meanLevelDb !== null &&
                  ` — ${t.events.contextLevel} ${context.meanLevelDb.toFixed(0)} dBFS, ${t.events.contextStability} ±${(context.levelStdDb ?? 0).toFixed(1)} dB`}
              </p>
            ) : (
              <p className="sg-sheet__dim">{t.events.contextNone}</p>
            )}
          </section>
          <section>
            {clip ? (
              <button
                type="button"
                className="sg-button"
                onClick={() => {
                  playClip(clip);
                }}
              >
                {t.events.replay}
              </button>
            ) : (
              event.type !== 'drift' && (
                <p className="sg-sheet__dim">{t.events.replayUnavailable}</p>
              )
            )}
          </section>
          <NoteForm key={event.id} id={event.id} initial={event.note} onSave={onSaveNote} />
        </article>
      )}
    </dialog>
  );
}

/** Formulaire de note, remonté pour chaque événement (état initial = note enregistrée). */
function NoteForm({
  id,
  initial,
  onSave,
}: {
  id: string;
  initial: string;
  onSave: (id: string, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState(initial);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="sg-sheet__note"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(id, note).then(() => {
          setSaved(true);
        });
      }}
    >
      <label htmlFor="event-note" className="sg-label">
        {t.events.note}
      </label>
      <textarea
        id="event-note"
        value={note}
        maxLength={500}
        placeholder={t.events.notePlaceholder}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
      />
      <div className="sg-sheet__actions">
        <button type="submit" className="sg-button">
          {t.events.saveNote}
        </button>
        {saved && <span role="status">{t.events.saved}</span>}
      </div>
    </form>
  );
}
