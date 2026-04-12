import React, { useMemo } from 'react';

function summarizeMove(san = '') {
  return {
    capture: san.includes('x'),
    check: san.includes('+') || san.includes('#'),
    mate: san.includes('#'),
    promotion: san.includes('='),
    castle: san === 'O-O' || san === 'O-O-O',
  };
}

function getResultLabel({ isOnline, gameData, localResultText }) {
  if (isOnline) {
    if (!gameData) return null;
    if (!['completed', 'draw', 'abandoned'].includes(gameData.status)) return null;
    return gameData.result || 'Game finished';
  }
  return localResultText || null;
}

export default function GameReviewTimeline({
  moveHistory,
  isOnline,
  gameData,
  localResultText,
}) {
  const rows = useMemo(() => {
    if (!Array.isArray(moveHistory) || moveHistory.length === 0) return [];
    return moveHistory.map((san, index) => {
      const moveNo = Math.floor(index / 2) + 1;
      const side = index % 2 === 0 ? 'White' : 'Black';
      return {
        id: `${moveNo}-${side}-${san}-${index}`,
        moveNo,
        side,
        san,
        flags: summarizeMove(san),
      };
    });
  }, [moveHistory]);

  if (rows.length === 0) return null;

  const resultLabel = getResultLabel({ isOnline, gameData, localResultText });

  return (
    <section className="review-timeline" aria-label="Game review timeline">
      <div className="review-timeline__header">
        <h4>Review Timeline</h4>
        {resultLabel && <span className="review-timeline__result">{resultLabel}</span>}
      </div>
      <div className="review-timeline__list">
        {rows.map((row) => (
          <div key={row.id} className="review-timeline__row">
            <span className="review-timeline__idx">{row.moveNo}{row.side === 'White' ? 'w' : 'b'}</span>
            <span className="review-timeline__san">{row.san}</span>
            <div className="review-timeline__tags">
              {row.flags.capture && <span className="review-tag">Capture</span>}
              {row.flags.check && <span className="review-tag">Check</span>}
              {row.flags.mate && <span className="review-tag review-tag--alert">Mate</span>}
              {row.flags.promotion && <span className="review-tag">Promotion</span>}
              {row.flags.castle && <span className="review-tag">Castle</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
