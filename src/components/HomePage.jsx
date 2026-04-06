import React from 'react';

export default function HomePage({
  user,
  firebaseEnabled,
  onPlayGuest,
  onSignIn,
  onHowItWorks,
}) {
  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="home-kicker">First Move</span>
          <h2>Knight aura turns nearby pieces into jump-capable attackers.</h2>
          <p className="home-summary">
            Start a guest board instantly, sign in for live play, or learn the rule twist before you sit down.
          </p>
          <div className="home-actions">
            <button className="btn btn-primary home-cta" onClick={onPlayGuest}>
              Play Guest
            </button>
            <button className="btn btn-ghost home-cta" onClick={onSignIn}>
              {user ? 'Account' : 'Sign In'}
            </button>
            <button className="btn btn-ghost home-cta" onClick={onHowItWorks}>
              How It Works
            </button>
          </div>
          <p className="home-note">
            {firebaseEnabled
              ? 'Guest play is local. Sign in unlocks online matches, rankings, and chat.'
              : 'Firebase is off right now, so guest practice is the available mode.'}
          </p>
        </div>

        <div className="home-hero-card">
          <div className="home-board-mini" aria-hidden="true">
            {Array.from({ length: 16 }).map((_, index) => (
              <span
                key={index}
                className={`home-board-mini__cell${[5, 6, 9, 10].includes(index) ? ' home-board-mini__cell--aura' : ''}`}
              />
            ))}
            <span className="home-board-mini__knight">♞</span>
          </div>
          <div className="home-hero-stats">
            <div>
              <strong>16 squares</strong>
              <span>Maximum knight-aura reach from one knight</span>
            </div>
            <div>
              <strong>1 blocker</strong>
              <span>Each empowered move can clear exactly one piece</span>
            </div>
            <div>
              <strong>Live modes</strong>
              <span>Practice, AI, private matches, and ranked online play</span>
            </div>
          </div>
        </div>
      </section>

      <section className="home-highlights">
        <article className="home-highlight">
          <h3>Play Guest</h3>
          <p>Launch straight into a local board with clocks, AI support, and 3D mode.</p>
        </article>
        <article className="home-highlight">
          <h3>Sign In</h3>
          <p>Use Google, email, or guest auth to keep a rating, social graph, and live-game history.</p>
        </article>
        <article className="home-highlight">
          <h3>How It Works</h3>
          <p>Learn aura squares, one-jump limits, and pawn edge cases before starting your first match.</p>
        </article>
      </section>
    </main>
  );
}
