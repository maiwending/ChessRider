import React, { useMemo, useState } from 'react';
import './LearnPage.css';

function buildAuraGrid() {
  const SIZE = 9;
  const knightR = 4;
  const knightC = 4;
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(''));
  const adj = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for (const [dr, dc] of adj) {
    const r = knightR + dr;
    const c = knightC + dc;
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) grid[r][c] = 'adj';
  }
  const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr, dc] of knightMoves) {
    const r = knightR + dr;
    const c = knightC + dc;
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) grid[r][c] = 'knight';
  }
  grid[knightR][knightC] = 'N';
  return grid;
}

const auraGrid = buildAuraGrid();

const interactiveLessons = [
  {
    title: 'Aura Builder',
    tag: 'Basics',
    goal: 'Learn which squares gain jumping power from a knight.',
    steps: [
      {
        title: 'Center the knight',
        note: 'A central knight spreads the widest useful aura.',
        board: [
          ['','','','','','',''],
          ['','','','','','',''],
          ['','','','','','',''],
          ['','','','♞','','',''],
          ['','','','','','',''],
          ['','','','','','',''],
          ['','','','','','',''],
        ],
      },
      {
        title: 'Adjacent allies are empowered',
        note: 'Every square touching the knight is inside the aura.',
        board: [
          ['','','','','','',''],
          ['','','','','','',''],
          ['','','★','★','★','',''],
          ['','','★','♞','★','',''],
          ['','','★','★','★','',''],
          ['','','','','','',''],
          ['','','','','','',''],
        ],
      },
      {
        title: 'Knight jumps count too',
        note: 'L-shaped reach also grants the aura, for up to 16 empowered squares total.',
        board: [
          ['','','','','','',''],
          ['','','✦','','✦','',''],
          ['','✦','★','★','★','✦',''],
          ['','','★','♞','★','',''],
          ['','✦','★','★','★','✦',''],
          ['','','✦','','✦','',''],
          ['','','','','','',''],
        ],
      },
    ],
  },
  {
    title: 'Single Jump',
    tag: 'Movement',
    goal: 'See how one blocker can be cleared and the line stays open afterward.',
    steps: [
      {
        title: 'The blocker appears',
        note: 'The rook cannot normally pass the pawn.',
        board: [
          ['♖','','♟','','','♝'],
        ],
      },
      {
        title: 'Aura lets it jump once',
        note: 'The rook clears exactly one blocker and keeps moving.',
        board: [
          ['♖','→','♟','→','○','♝'],
        ],
      },
      {
        title: 'Capture becomes possible',
        note: 'After the jump, the rook may stop on an empty square or capture the bishop.',
        board: [
          ['','', '♟', '', '○', '♖'],
        ],
      },
    ],
  },
  {
    title: 'Second Blocker',
    tag: 'Limits',
    goal: 'Understand why the second piece still stops the move.',
    steps: [
      {
        title: 'Two blockers in line',
        note: 'Only the first blocker may be cleared.',
        board: [
          ['♕','','♟','','♜','',''],
        ],
      },
      {
        title: 'The queen clears one piece',
        note: 'The aura pays for one jump only.',
        board: [
          ['♕','→','♟','→','♜','✗',''],
        ],
      },
      {
        title: 'The second blocker holds',
        note: 'The queen must stop before the rook and cannot pass through it.',
        board: [
          ['','','♟','♕','♜','',''],
        ],
      },
    ],
  },
  {
    title: 'Pawn Breakthrough',
    tag: 'Practical',
    goal: 'Use aura pawns to crack files open earlier than normal chess allows.',
    steps: [
      {
        title: 'Pawn with support',
        note: 'The knight empowers the pawn from behind.',
        board: [
          ['','','','○','',''],
          ['','','','♟','',''],
          ['','','','♙','',''],
          ['','','','♞','',''],
        ],
      },
      {
        title: 'The pawn jumps the blocker',
        note: 'A pawn in the aura can leap one blocker straight ahead only to an empty square. It still cannot capture by jumping straight forward.',
        board: [
          ['','','','♙','',''],
          ['','','','♟','',''],
          ['','','','','',''],
          ['','','','♞','',''],
        ],
      },
      {
        title: 'The file opens',
        note: 'This often unlocks a rook or queen attack immediately.',
        board: [
          ['','','','♙','',''],
          ['','','','','',''],
          ['','','','','',''],
          ['','','','♞','',''],
        ],
      },
    ],
  },
];

function InteractiveTutorials() {
  const [activeLesson, setActiveLesson] = useState(0);
  const [activeStep, setActiveStep] = useState(0);

  const lesson = interactiveLessons[activeLesson];
  const step = lesson.steps[activeStep];

  const canGoPrev = activeStep > 0;
  const canGoNext = activeStep < lesson.steps.length - 1;

  const progressLabel = useMemo(
    () => `${activeStep + 1} / ${lesson.steps.length}`,
    [activeStep, lesson.steps.length]
  );

  return (
    <section className="learn-tutorials learn-tutorials--interactive">
      <h3>Interactive Tutorials</h3>
      <p className="learn-tutorials-intro">
        Click through each lesson to watch the position change step by step.
      </p>

      <div className="learn-lesson-tabs">
        {interactiveLessons.map((item, index) => (
          <button
            key={item.title}
            className={`learn-lesson-tab${index === activeLesson ? ' active' : ''}`}
            onClick={() => {
              setActiveLesson(index);
              setActiveStep(0);
            }}
          >
            <span className="learn-lesson-tab-tag">{item.tag}</span>
            <span>{item.title}</span>
          </button>
        ))}
      </div>

      <div className="learn-interactive-card">
        <div className="learn-interactive-copy">
          <div className="learn-interactive-header">
            <span className="learn-tutorial-tag">{lesson.tag}</span>
            <span className="learn-step-counter">{progressLabel}</span>
          </div>
          <h4>{lesson.title}</h4>
          <p className="learn-interactive-goal">{lesson.goal}</p>
          <div className="learn-step-card">
            <strong>{step.title}</strong>
            <p>{step.note}</p>
          </div>
          <div className="learn-interactive-actions">
            <button className="btn btn-ghost" onClick={() => setActiveStep(0)}>Reset</button>
            <button className="btn btn-ghost" onClick={() => canGoPrev && setActiveStep((value) => value - 1)} disabled={!canGoPrev}>
              Previous
            </button>
            <button className="btn btn-primary" onClick={() => canGoNext && setActiveStep((value) => value + 1)} disabled={!canGoNext}>
              Next
            </button>
          </div>
        </div>

        <div className="learn-demo-board" aria-label={`${lesson.title} demo`}>
          {step.board.map((row, rowIndex) => (
            <div key={rowIndex} className="learn-demo-row">
              {row.map((cell, cellIndex) => {
                const dark = (rowIndex + cellIndex) % 2 === 1;
                return (
                  <div
                    key={`${rowIndex}-${cellIndex}`}
                    className={`learn-demo-cell${dark ? ' learn-demo-cell--dark' : ' learn-demo-cell--light'}${cell === '○' ? ' learn-demo-cell--target' : ''}${cell === '→' ? ' learn-demo-cell--path' : ''}`}
                  >
                    {cell === '○' ? '' : cell}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function LearnPage({ onBack, onOpenTutorials, tutorialsOnly = false }) {
  return (
    <div className="learn-page">
      <header className="learn-page-header">
        <button className="learn-back-btn" onClick={onBack}>
          {tutorialsOnly ? '← Back to Learn' : '← Back to Game'}
        </button>
        <div className="learn-page-title">
          <h1>{tutorialsOnly ? '♞ Knight-Aura Tutorials' : '♞ How to Play Knight-Aura Chess'}</h1>
          <p>{tutorialsOnly ? 'Step through live lessons for the horse-powered ruleset' : 'Standard chess — supercharged by the power of the horse'}</p>
        </div>
      </header>

      {tutorialsOnly ? (
        <>
          <section className="learn-hero learn-hero--tutorials">
            <div className="learn-hero-text">
              <h2>Interactive Tutorials</h2>
              <p>
                Work through focused examples for aura control, blocker jumps, and pawn breakthroughs.
              </p>
            </div>
          </section>
          <InteractiveTutorials />
        </>
      ) : (
        <>
          <section className="learn-hero">
            <div className="learn-hero-text">
              <h2>Unleash the Power of the Horse</h2>
              <p>
                In conventional chess, only the knight can jump over other pieces.
                In <strong>Knight-Aura Chess</strong>, that jumping power radiates outward —
                any friendly piece within the knight&apos;s aura can <strong>leap over one blocker</strong>.
              </p>
            </div>
          </section>

          <section className="learn-section learn-section--green">
            <div className="learn-section-badge">1</div>
            <div className="learn-section-body">
              <h3>The Knight&apos;s Aura Zone</h3>
              <p className="learn-section-subtitle">Ride close to the horse, gain its power</p>
              <p>
                Any friendly piece that is adjacent to a knight or reachable by its L-shaped jump
                is inside the aura and may jump one blocker.
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
                        return <div key={ci} className={cls}>{content}</div>;
                      })}
                    </div>
                  ))}
                </div>
                <div className="learn-aura-legend">
                  <span className="learn-legend-item"><span className="learn-legend-swatch learn-legend--knight">♞</span> Knight</span>
                  <span className="learn-legend-item"><span className="learn-legend-swatch learn-legend--adj">★</span> Adjacent</span>
                  <span className="learn-legend-item"><span className="learn-legend-swatch learn-legend--knm">✦</span> Knight Move</span>
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

          <section className="learn-section learn-section--blue">
            <div className="learn-section-badge">2</div>
            <div className="learn-section-body">
              <h3>Ride the Aura — Jump!</h3>
              <p className="learn-section-subtitle">One leap, then keep going</p>
              <p>
                A piece inside the knight&apos;s aura can jump over <strong>exactly one</strong> blocker
                along its normal movement path, then keep sliding as usual. It may
                capture on any square it lands, even right after the jump.
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
                  <span>♖ leaps over ♟ and can land beyond it or capture ♝</span>
                </div>
              </div>
            </div>
          </section>

          <section className="learn-section learn-section--red">
            <div className="learn-section-badge">3</div>
            <div className="learn-section-body">
              <h3>One Jump Per Move</h3>
              <p className="learn-section-subtitle">The horse&apos;s gift has limits</p>
              <p>
                The knight shares its power for <strong>one leap only</strong>. After clearing
                the first blocker, the next piece on that line still holds the file or diagonal.
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
                  <span>♕ clears ♟ but ♜ still stops the line</span>
                </div>
              </div>
            </div>
          </section>

          <section className="learn-section learn-section--green">
            <div className="learn-section-badge">4</div>
            <div className="learn-section-body">
              <h3>Every Piece Gets Wings</h3>
              <p className="learn-section-subtitle">Pawns and kings can ride the aura too</p>
              <p>
                The horse&apos;s power reaches everyone. <strong>Pawns</strong> near a knight can
                jump one square forward over a blocker to an empty square, but they still
                cannot capture by jumping straight ahead. <strong>Kings</strong> can also jump one safe
                square when empowered, which creates unusual defensive and attacking ideas.
              </p>
              <div className="learn-jump-demo">
                <div className="learn-jump-mini">
                  <div className="learn-jump-col">
                    <div className="learn-jump-cell learn-jump-cell--land">○</div>
                    <div className="learn-jump-cell learn-jump-cell--blocker">♟</div>
                    <div className="learn-jump-cell learn-jump-cell--piece">♙</div>
                    <div className="learn-jump-cell learn-jump-cell--knight-src">♞</div>
                  </div>
                  <span className="learn-jump-col-label">♙ leaps the blocker because it is riding ♞&apos;s aura</span>
                </div>
              </div>
            </div>
          </section>

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
                <p>Leap over exactly one blocker; pawns still capture diagonally, not straight ahead</p>
              </div>
              <div className="learn-summary-card">
                <span className="learn-summary-icon">🛑</span>
                <strong>The Limit</strong>
                <p>One jump per move — the second blocker holds the line</p>
              </div>
            </div>
          </section>

          <section className="learn-tutorial-launch">
            <h3>Tutorials</h3>
            <p>Open the dedicated tutorial page for step-by-step interactive lessons.</p>
            <button className="btn btn-primary learn-tutorial-launch-btn" onClick={onOpenTutorials}>
              Open Tutorials
            </button>
          </section>
        </>
      )}

      <footer className="learn-page-footer">
        <button className="learn-back-btn" onClick={onBack}>
          {tutorialsOnly ? '← Back to Learn' : '← Back to Game'}
        </button>
      </footer>
    </div>
  );
}
