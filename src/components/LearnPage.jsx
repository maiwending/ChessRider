import React from 'react';
import './LearnPage.css';

/**
 * Build the Knight Aura grid (9×9, knight at center e5 = [4,4]).
 * Adjacent squares (8 king-move squares) + Knight-reachable squares (up to 8).
 */
function buildAuraGrid() {
  const SIZE = 9;
  const knightR = 4, knightC = 4;
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(''));

  // Adjacent squares (king-move pattern: 1 step any direction)
  const adj = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for (const [dr, dc] of adj) {
    const r = knightR + dr, c = knightC + dc;
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) grid[r][c] = 'adj';
  }

  // Knight-move squares (L-shape jumps)
  const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr, dc] of knightMoves) {
    const r = knightR + dr, c = knightC + dc;
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) grid[r][c] = 'knight';
  }

  grid[knightR][knightC] = 'N'; // The knight itself
  return grid;
}

const auraGrid = buildAuraGrid();

const tutorials = [
  {
    title: '1. Build an Aura Net',
    tag: 'Opening',
    icon: '♞',
    summary: 'Start by placing knights where they empower several allies at once.',
    points: [
      'Knights near the center project the largest useful aura.',
      'Try to let one knight empower a rook or queen and a pawn at the same time.',
      'Do not rush a knight to the rim unless it creates a concrete jump tactic.'
    ]
  },
  {
    title: '2. Attack Behind the Blocker',
    tag: 'Tactics',
    icon: '⤴',
    summary: 'A defended blocker can become a liability when your sliding piece can leap it.',
    points: [
      'Look for enemy pawns or minor pieces standing in front of more valuable targets.',
      'Rooks and queens are especially dangerous when their file or diagonal has one blocker.',
      'Before jumping, check whether the landing square is safe and whether the line opens mate threats.'
    ]
  },
  {
    title: '3. Defend by Breaking the Aura',
    tag: 'Defense',
    icon: '🛡',
    summary: 'Often the best defense is not the blocker itself, but removing the knight that grants the jump.',
    points: [
      'If an enemy attack depends on an aura square, trade or chase away the supporting knight.',
      'When you cannot remove the knight, place a second blocker so one jump is not enough.',
      'Watch for discovered attacks after a jump and secure your king first.'
    ]
  },
  {
    title: '4. Use Pawns as Launch Pieces',
    tag: 'Practical',
    icon: '♙',
    summary: 'Aura-enabled pawns create unusual breakthroughs and fork ideas.',
    points: [
      'A pawn that jumps a blocker can crack open files much earlier than standard chess allows.',
      'Passed pawns near a knight are more dangerous because blockers are less reliable.',
      'If your pawn jump opens a line for a rook or queen, calculate both threats together.'
    ]
  }
];

export default function LearnPage({ onBack }) {
  return (
    <div className="learn-page">
      {/* ── Header ── */}
      <header className="learn-page-header">
        <button className="learn-back-btn" onClick={onBack}>
          ← Back to Game
        </button>
        <div className="learn-page-title">
          <h1>♞ How to Play Knight-Aura Chess</h1>
          <p>Standard chess — supercharged by the power of the horse</p>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="learn-hero">
        <div className="learn-hero-text">
          <h2>Unleash the Power of the Horse</h2>
          <p>
            In conventional chess, only the knight can jump over other pieces.
            In <strong>Knight-Aura Chess</strong>, that jumping power radiates outward —
            any friendly piece within the knight's aura can <strong>leap over one blocker</strong>,
            opening up surprise tactics, deep combinations, and a whole new layer of strategy.
          </p>
        </div>
      </section>

      {/* ── Rule 1: The Aura ── */}
      <section className="learn-section learn-section--green">
        <div className="learn-section-badge">1</div>
        <div className="learn-section-body">
          <h3>The Knight's Aura Zone</h3>
          <p className="learn-section-subtitle">Ride close to the horse, gain its power</p>
          <p>
            Any friendly piece that is <strong>adjacent</strong> to a knight (the 8 surrounding
            squares) <em>or</em> on a square <strong>reachable by the knight's L-shaped move</strong> is
            inside the aura. That's up to <strong>16 empowered squares</strong> — pieces there
            inherit the horse's ability to jump.
          </p>

          <div className="learn-aura-grid-wrapper">
            <div className="learn-aura-grid">
              {auraGrid.map((row, ri) => (
                <div key={ri} className="learn-aura-row">
                  {row.map((cell, ci) => {
                    let cls = 'learn-aura-cell';
                    let content = '';
                    if (cell === 'N') {
                      cls += ' learn-aura-cell--knight';
                      content = '♞';
                    } else if (cell === 'adj') {
                      cls += ' learn-aura-cell--adjacent';
                      content = '★';
                    } else if (cell === 'knight') {
                      cls += ' learn-aura-cell--knight-move';
                      content = '✦';
                    }
                    return (
                      <div key={ci} className={cls}>
                        {content}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="learn-aura-legend">
              <span className="learn-legend-item">
                <span className="learn-legend-swatch learn-legend--knight">♞</span> Knight
              </span>
              <span className="learn-legend-item">
                <span className="learn-legend-swatch learn-legend--adj">★</span> Adjacent (8)
              </span>
              <span className="learn-legend-item">
                <span className="learn-legend-swatch learn-legend--knm">✦</span> Knight-move (8)
              </span>
            </div>
          </div>

          <div className="learn-aura-indicator">
            <div className="learn-aura-indicator-piece" aria-hidden="true">
              ♖
              <span className="learn-aura-indicator-mark">✦</span>
            </div>
            <div className="learn-aura-indicator-copy">
              <strong>Board indicator</strong>
              <p>
                On the live board, an empowered piece gets a soft green glow and a small
                <strong> ✦ mark</strong> so you can spot aura-enabled pieces at a glance.
                Knights project the aura, but they do not gain an extra jump themselves.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Rule 2: Jumping ── */}
      <section className="learn-section learn-section--blue">
        <div className="learn-section-badge">2</div>
        <div className="learn-section-body">
          <h3>Ride the Aura — Jump!</h3>
          <p className="learn-section-subtitle">One leap, then keep going</p>
          <p>
            A piece inside the knight's aura can jump over <strong>exactly one</strong> blocker
            along its normal movement path, then keep sliding as usual. It may
            capture on any square it lands — even right after the jump.
          </p>
          <div className="learn-jump-demo">
            <div className="learn-jump-track">
              <div className="learn-jump-cell learn-jump-cell--piece">♖</div>
              <div className="learn-jump-cell learn-jump-cell--empty"></div>
              <div className="learn-jump-cell learn-jump-cell--blocker">♟</div>
              <div className="learn-jump-cell learn-jump-cell--land">○</div>
              <div className="learn-jump-cell learn-jump-cell--land">○</div>
              <div className="learn-jump-cell learn-jump-cell--capture">♝</div>
            </div>
            <div className="learn-jump-arrow">
              <span>♖ leaps over ♟ — lands on ○ or captures ♝</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Rule 3: Second Blocker ── */}
      <section className="learn-section learn-section--red">
        <div className="learn-section-badge">3</div>
        <div className="learn-section-body">
          <h3>One Jump Per Move</h3>
          <p className="learn-section-subtitle">The horse's gift has limits</p>
          <p>
            The knight shares its power for <strong>one leap only</strong>. After clearing
            the first blocker, the next piece on that line holds the line — you
            cannot jump it and cannot pass it.
          </p>
          <div className="learn-jump-demo">
            <div className="learn-jump-track">
              <div className="learn-jump-cell learn-jump-cell--piece">♕</div>
              <div className="learn-jump-cell learn-jump-cell--empty"></div>
              <div className="learn-jump-cell learn-jump-cell--blocker">♟</div>
              <div className="learn-jump-cell learn-jump-cell--land">○</div>
              <div className="learn-jump-cell learn-jump-cell--blocked">♜</div>
              <div className="learn-jump-cell learn-jump-cell--nogo">✗</div>
            </div>
            <div className="learn-jump-arrow">
              <span>♕ clears ♟ but ♜ holds the line — cannot pass</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Rule 4: Pawns & Kings ── */}
      <section className="learn-section learn-section--green">
        <div className="learn-section-badge">4</div>
        <div className="learn-section-body">
          <h3>Every Piece Gets Wings</h3>
          <p className="learn-section-subtitle">Pawns & kings leap too</p>
          <p>
            The horse's power reaches everyone. <strong>Pawns</strong> near a knight can
            jump one square forward over a blocker. <strong>Kings</strong> can jump one square
            in any safe direction. No piece is too humble to ride the aura.
          </p>
          <div className="learn-jump-demo">
            <div className="learn-jump-mini">
              <div className="learn-jump-col">
                <div className="learn-jump-cell learn-jump-cell--land">○</div>
                <div className="learn-jump-cell learn-jump-cell--blocker">♟</div>
                <div className="learn-jump-cell learn-jump-cell--piece">♙</div>
                <div className="learn-jump-cell learn-jump-cell--knight-src">♞</div>
              </div>
              <span className="learn-jump-col-label">♙ leaps ♟ — riding ♞'s aura</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Summary ── */}
      <section className="learn-summary">
        <h3>Quick Reference</h3>
        <div className="learn-summary-grid">
          <div className="learn-summary-card">
            <span className="learn-summary-icon">♞</span>
            <strong>The Aura</strong>
            <p>8 adjacent + 8 knight-move squares = 16 empowered allies</p>
          </div>
          <div className="learn-summary-card">
            <span className="learn-summary-icon">⤴</span>
            <strong>The Jump</strong>
            <p>Leap over exactly one blocker, then keep sliding or capture</p>
          </div>
          <div className="learn-summary-card">
            <span className="learn-summary-icon">🛑</span>
            <strong>The Limit</strong>
            <p>One jump per move — the second blocker holds the line</p>
          </div>
        </div>
      </section>

      <section className="learn-tutorials">
        <h3>Tutorials</h3>
        <p className="learn-tutorials-intro">
          Use these short lessons to start seeing Knight-Aura ideas during real games.
        </p>
        <div className="learn-tutorial-grid">
          {tutorials.map((tutorial) => (
            <article key={tutorial.title} className="learn-tutorial-card">
              <div className="learn-tutorial-head">
                <span className="learn-tutorial-icon" aria-hidden="true">{tutorial.icon}</span>
                <div>
                  <span className="learn-tutorial-tag">{tutorial.tag}</span>
                  <h4>{tutorial.title}</h4>
                </div>
              </div>
              <p>{tutorial.summary}</p>
              <ul className="learn-tutorial-points">
                {tutorial.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <footer className="learn-page-footer">
        <button className="learn-back-btn" onClick={onBack}>
          ← Back to Game
        </button>
      </footer>
    </div>
  );
}
