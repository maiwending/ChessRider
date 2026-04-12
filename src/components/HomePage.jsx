import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../utils/firebase.js';

function formatRecentDate(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return 'No date';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getGameSummary(game, userId) {
  const isWhite = game.whiteId === userId;
  const opponentName = isWhite
    ? (game.blackName || 'Opponent')
    : (game.whiteName || 'Opponent');
  const status = String(game.status || '').toLowerCase();
  const resultText = String(game.result || '').toLowerCase();

  if (status === 'draw' || resultText.includes('draw')) {
    return { result: 'Draw', className: 'draw', opponentName };
  }

  if (status === 'abandoned' && !game.winner) {
    return { result: 'Abandoned', className: 'draw', opponentName };
  }

  if (!game.winner) {
    return { result: 'Draw', className: 'draw', opponentName };
  }

  const userWon = game.winner === userId;
  return {
    result: userWon ? 'Win' : 'Loss',
    className: userWon ? 'win' : 'loss',
    opponentName,
  };
}

function SignedInHomePanel({
  user,
  profile,
  rating,
  firebaseEnabled,
  incomingChallenge,
  onPlay,
  onOpenAccount,
  onHowItWorks,
  onAcceptChallenge,
  onDeclineChallenge,
}) {
  const [recentGames, setRecentGames] = useState([]);
  const [loadingRecentGames, setLoadingRecentGames] = useState(false);

  useEffect(() => {
    if (!user || !firebaseEnabled || !db) {
      setRecentGames([]);
      setLoadingRecentGames(false);
      return;
    }

    let active = true;
    const loadRecentGames = async () => {
      setLoadingRecentGames(true);
      try {
        const statuses = ['completed', 'draw', 'abandoned'];
        const [whiteSnap, blackSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'games'),
            where('whiteId', '==', user.uid),
            where('status', 'in', statuses),
            limit(6)
          )),
          getDocs(query(
            collection(db, 'games'),
            where('blackId', '==', user.uid),
            where('status', 'in', statuses),
            limit(6)
          )),
        ]);

        if (!active) return;

        const games = [
          ...whiteSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
          ...blackSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })),
        ]
          .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0))
          .slice(0, 4);

        setRecentGames(games);
      } catch {
        if (active) setRecentGames([]);
      } finally {
        if (active) setLoadingRecentGames(false);
      }
    };

    loadRecentGames();
    return () => {
      active = false;
    };
  }, [firebaseEnabled, user]);

  const record = useMemo(() => ({
    wins: profile?.wins ?? 0,
    losses: profile?.losses ?? 0,
    draws: profile?.draws ?? 0,
  }), [profile]);

  return (
    <>
      <section className="home-hero home-hero--signed-in">
        <div className="home-hero-copy">
          <span className="home-kicker">Signed In</span>
          <h2>Pick up the board fast, then get back to live play.</h2>
          <p className="home-summary">
            Your rating, record, and recent results are ready. Start a board, open your account, or review the rule twist before your next match.
          </p>
          <div className="home-actions">
            <button className="btn btn-primary home-cta" onClick={onPlay}>
              Play
            </button>
            <button className="btn btn-ghost home-cta" onClick={onOpenAccount}>
              Account
            </button>
            <button className="btn btn-ghost home-cta" onClick={onHowItWorks}>
              How It Works
            </button>
          </div>
          <p className="home-note">
            {firebaseEnabled
              ? 'Signed-in play keeps your rating, unlocks ranked games, and lets you answer live challenges.'
              : 'Firebase is off right now, so account features are limited to local profile data.'}
          </p>
        </div>

        <aside className="home-hero-card home-account-card">
          <div className="home-account-card__header">
            <div>
              <p className="home-card-label">Account</p>
              <h3>{profile?.displayName || user.email || 'Player'}</h3>
            </div>
            <div className="home-rating-pill">{rating} Elo</div>
          </div>

          <div className="home-record-grid">
            <div className="home-record-tile">
              <span>Wins</span>
              <strong>{record.wins}</strong>
            </div>
            <div className="home-record-tile">
              <span>Losses</span>
              <strong>{record.losses}</strong>
            </div>
            <div className="home-record-tile">
              <span>Draws</span>
              <strong>{record.draws}</strong>
            </div>
          </div>

          {incomingChallenge ? (
            <div className="home-challenge-card">
              <p className="home-card-label">Incoming Challenge</p>
              <strong>{incomingChallenge.fromName || 'Player'} wants a game.</strong>
              <div className="home-challenge-card__actions">
                <button className="btn btn-primary" onClick={onAcceptChallenge}>
                  Accept
                </button>
                <button className="btn btn-ghost" onClick={onDeclineChallenge}>
                  Decline
                </button>
              </div>
            </div>
          ) : (
            <div className="home-status-card">
              <p className="home-card-label">Launcher Status</p>
              <strong>No pending challenge</strong>
              <span>Open Play for local boards, AI, or matchmaking.</span>
            </div>
          )}
        </aside>
      </section>

      <section className="home-dashboard">
        <article className="home-panel">
          <div className="home-panel__header">
            <div>
              <p className="home-card-label">Recent Games</p>
              <h3>Resume with context</h3>
            </div>
          </div>
          {loadingRecentGames ? (
            <p className="muted">Loading recent games...</p>
          ) : recentGames.length === 0 ? (
            <p className="muted">No finished games yet. Your first result will show up here.</p>
          ) : (
            <div className="home-recent-list">
              {recentGames.map((game) => {
                const summary = getGameSummary(game, user.uid);
                return (
                  <div key={game.id} className="home-recent-row">
                    <span className={`home-recent-result home-recent-result--${summary.className}`}>
                      {summary.result}
                    </span>
                    <div className="home-recent-copy">
                      <strong>vs {summary.opponentName}</strong>
                      <span>{formatRecentDate(game.updatedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="home-panel">
          <div className="home-panel__header">
            <div>
              <p className="home-card-label">Next Step</p>
              <h3>Choose a lane</h3>
            </div>
          </div>
          <div className="home-lane-list">
            <div className="home-lane-item">
              <strong>Play</strong>
              <span>Launch local, AI, or online play without going through sign-in again.</span>
            </div>
            <div className="home-lane-item">
              <strong>Account</strong>
              <span>Open your profile to edit your card, review your record, and message other players.</span>
            </div>
            <div className="home-lane-item">
              <strong>Tutorials</strong>
              <span>Refresh aura rules and promotion edge cases before jumping into a rated game.</span>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}

function SignedOutHomePanel({ firebaseEnabled, onPlayGuest, onSignIn, onHowItWorks, primaryActionLabel = 'Play as Guest' }) {
  return (
    <>
      <section className="home-hero">
        <div className="home-hero-copy">
          <h2>Knight aura turns nearby pieces into jump-capable attackers.</h2>
          <p className="home-summary">
            Start a guest board instantly, sign in for live play, or learn the rule twist before you sit down.
          </p>
          <div className="home-actions">
            <button className="btn btn-primary home-cta" onClick={onPlayGuest}>
              {primaryActionLabel}
            </button>
            <button className="btn btn-ghost home-cta" onClick={onSignIn}>
              Sign In
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
      </section>

      <section className="home-highlights">
        <article className="home-highlight">
          <h3>Play as Guest</h3>
          <p>Launch straight into a local board with clocks, AI support, and polished board-view options.</p>
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
    </>
  );
}

export default function HomePage({
  user,
  authReady = true,
  profile,
  rating,
  firebaseEnabled,
  incomingChallenge,
  onPlayGuest,
  onSignIn,
  onOpenAccount,
  onHowItWorks,
  onAcceptChallenge,
  onDeclineChallenge,
}) {
  return (
    <main className="home-page">
      {user ? (
        <SignedInHomePanel
          user={user}
          profile={profile}
          rating={rating}
          firebaseEnabled={firebaseEnabled}
          incomingChallenge={incomingChallenge}
          onPlay={onPlayGuest}
          onOpenAccount={onOpenAccount}
          onHowItWorks={onHowItWorks}
          onAcceptChallenge={onAcceptChallenge}
          onDeclineChallenge={onDeclineChallenge}
        />
      ) : (
        <SignedOutHomePanel
          firebaseEnabled={firebaseEnabled}
          onPlayGuest={onPlayGuest}
          onSignIn={onSignIn}
          onHowItWorks={onHowItWorks}
          primaryActionLabel={authReady ? 'Play as Guest' : 'Play'}
        />
      )}
    </main>
  );
}
