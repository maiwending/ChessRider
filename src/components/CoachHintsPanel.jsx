import React, { useMemo } from 'react';

function getHints({ moveHistory, moveTimestamps }) {
  const hints = [];
  const hasWhiteCastle = moveHistory.some((san, index) => index % 2 === 0 && (san === 'O-O' || san === 'O-O-O'));
  const hasBlackCastle = moveHistory.some((san, index) => index % 2 === 1 && (san === 'O-O' || san === 'O-O-O'));
  const whiteEarlyQueen = moveHistory.findIndex((san, index) => index < 8 && index % 2 === 0 && /^Q/.test(san));
  const blackEarlyQueen = moveHistory.findIndex((san, index) => index < 8 && index % 2 === 1 && /^Q/.test(san));
  const captureCount = moveHistory.filter((san) => san.includes('x')).length;

  if (!hasWhiteCastle && moveHistory.length >= 16) {
    hints.push({
      id: 'white-castle',
      title: 'White king safety',
      body: 'You did not castle in the opening. Castle earlier to reduce tactical pressure.',
    });
  }
  if (!hasBlackCastle && moveHistory.length >= 16) {
    hints.push({
      id: 'black-castle',
      title: 'Black king safety',
      body: 'Black stayed uncastled deep into the game. Fast castling usually improves survival.',
    });
  }
  if (whiteEarlyQueen >= 0 || blackEarlyQueen >= 0) {
    hints.push({
      id: 'early-queen',
      title: 'Early queen move',
      body: 'A queen moved very early. Develop minor pieces first unless there is a concrete tactic.',
    });
  }
  if (moveHistory.length >= 20 && captureCount <= 2) {
    hints.push({
      id: 'low-tactics',
      title: 'Low tactical conversion',
      body: 'Very few captures occurred. Look for forcing captures or checks when you have initiative.',
    });
  }

  const totals = (moveTimestamps || []).reduce(
    (acc, entry) => ({
      white: acc.white + (entry?.white || 0),
      black: acc.black + (entry?.black || 0),
    }),
    { white: 0, black: 0 }
  );
  if (totals.white > 0 && totals.black > 0) {
    const ratio = Math.max(totals.white, totals.black) / Math.max(1, Math.min(totals.white, totals.black));
    if (ratio > 1.8) {
      hints.push({
        id: 'clock-balance',
        title: 'Clock usage imbalance',
        body: 'One side used much more time than the other. Keep decisions consistent to avoid time trouble.',
      });
    }
  }

  return hints.slice(0, 3);
}

export default function CoachHintsPanel({ moveHistory, moveTimestamps }) {
  const hints = useMemo(
    () => getHints({ moveHistory, moveTimestamps }),
    [moveHistory, moveTimestamps]
  );

  if (hints.length === 0) return null;

  return (
    <section className="coach-hints" aria-label="Coach hints">
      <div className="coach-hints__header">
        <h4>Coach Hints</h4>
        <span className="coach-hints__badge">Heuristic</span>
      </div>
      <div className="coach-hints__list">
        {hints.map((hint) => (
          <article key={hint.id} className="coach-hints__item">
            <strong>{hint.title}</strong>
            <p>{hint.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
