import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fr } from '../i18n/fr';
import { LiveLabels } from './LiveLabels';

describe('LiveLabels', () => {
  it('attend le premier résultat', () => {
    render(<LiveLabels live={null} />);
    expect(screen.getByText(fr.live.waiting)).toBeInTheDocument();
  });

  it('affiche le top-3, la famille et la gravité dominante', () => {
    render(
      <LiveLabels
        live={{
          model: 'yamnet',
          top: [
            { index: 435, name: 'Glass', score: 0.71, family: 'glass' },
            { index: 437, name: 'Shatter', score: 0.42, family: 'glass' },
            { index: 494, name: 'Silence', score: 0.1, family: 'ambient' },
          ],
          families: [],
          dominant: { family: 'glass', score: 0.83, severity: 2 },
          windowEndSample: 0,
          inferenceMs: 3,
          receivedAt: 0,
        }}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Glass')).toBeInTheDocument();
    expect(screen.getByText('0.71')).toBeInTheDocument();
    const dominant = screen.getByTestId('dominant-family');
    expect(dominant).toHaveAttribute('data-family', 'glass');
    expect(dominant).toHaveTextContent(fr.families.glass);
    expect(dominant).toHaveTextContent(`${fr.live.severity} 2`);
  });
});
