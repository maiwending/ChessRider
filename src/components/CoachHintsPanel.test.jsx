import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CoachHintsPanel from './CoachHintsPanel.jsx';

describe('CoachHintsPanel', () => {
  it('renders up to 3 hints when heuristic patterns are found', () => {
    render(
      <CoachHintsPanel
        moveHistory={['Qh5', 'a6', 'Bc4', 'a5', 'Qxf7+', 'Kxf7', 'Nf3', 'Nc6', 'Bb5', 'd6', 'O-O']}
        moveTimestamps={[{ white: 85, black: 20 }]}
      />
    );

    expect(screen.getByText('Coach Hints')).toBeInTheDocument();
    expect(screen.getByText(/early queen move/i)).toBeInTheDocument();
  });

  it('returns null when there are no hints', () => {
    const { container } = render(
      <CoachHintsPanel
        moveHistory={['Nf3', 'Nf6', 'g3', 'g6', 'Bg2', 'Bg7', 'O-O', 'O-O']}
        moveTimestamps={[{ white: 10, black: 9 }]}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
