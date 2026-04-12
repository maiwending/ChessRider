import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GameReviewTimeline from './GameReviewTimeline.jsx';

describe('GameReviewTimeline', () => {
  it('renders move tags based on SAN markers', () => {
    render(
      <GameReviewTimeline
        moveHistory={['e4', 'd5', 'exd5+', 'Qxd5', 'O-O', 'd8=Q#']}
        isOnline={false}
        gameData={null}
        localResultText="White wins by checkmate"
      />
    );

    expect(screen.getByText('Review Timeline')).toBeInTheDocument();
    expect(screen.getByText(/white wins by checkmate/i)).toBeInTheDocument();
    expect(screen.getAllByText('Capture').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Check').length).toBeGreaterThan(0);
    expect(screen.getByText('Mate')).toBeInTheDocument();
    expect(screen.getByText('Promotion')).toBeInTheDocument();
    expect(screen.getByText('Castle')).toBeInTheDocument();
  });

  it('returns null when no moves are present', () => {
    const { container } = render(
      <GameReviewTimeline
        moveHistory={[]}
        isOnline={false}
        gameData={null}
        localResultText={null}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
