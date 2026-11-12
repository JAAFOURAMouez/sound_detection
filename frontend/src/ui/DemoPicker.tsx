import { DEMO_SAMPLES } from '../demo/samples';
import { t } from '../i18n';
import { sampleLabel } from './labels';

interface DemoPickerProps {
  current: string | null;
  disabled: boolean;
  onPlay: (id: string) => void;
}

export function DemoPicker({ current, disabled, onPlay }: DemoPickerProps) {
  return (
    <section className="sg-demo" aria-labelledby="demo-title">
      <h2 id="demo-title" className="sg-panel-title sg-label">
        {t.demo.title}
      </h2>
      <ul className="sg-demo__list">
        {DEMO_SAMPLES.map((sample) => (
          <li key={sample.id}>
            <button
              type="button"
              className="sg-button"
              disabled={disabled}
              aria-pressed={current === sample.id}
              onClick={() => {
                onPlay(sample.id);
              }}
            >
              {sampleLabel(sample.id)}
            </button>
          </li>
        ))}
      </ul>
      <p className="sg-demo__credits">
        {t.demo.credits} :{' '}
        {DEMO_SAMPLES.map((sample, i) => (
          <span key={sample.id}>
            {i > 0 ? ' · ' : ''}
            <a href={sample.credit.source} target="_blank" rel="noreferrer">
              {sampleLabel(sample.id)}
            </a>{' '}
            ({sample.credit.author}, {sample.credit.license})
          </span>
        ))}
      </p>
    </section>
  );
}
