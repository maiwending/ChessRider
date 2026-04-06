import React from 'react';

export default function SignInPage({
  authReady,
  firebaseEnabled,
  authMode,
  setAuthMode,
  authEmail,
  setAuthEmail,
  authPassword,
  setAuthPassword,
  authError,
  onSubmit,
  onGoogle,
  onGuest,
  onBack,
}) {
  return (
    <div className="signin-page">
      <div className="signin-card">
        <button className="learn-back-btn signin-back-btn" onClick={onBack}>
          ← Back to Home
        </button>
        <div className="signin-hero">
          <h2>Sign In</h2>
          <p>Use a dedicated account page instead of the in-game header controls.</p>
        </div>

        {!authReady ? (
          <p className="auth-status">Connecting...</p>
        ) : !firebaseEnabled ? (
          <p className="auth-status">Local mode</p>
        ) : (
          <div className="auth-form signin-form">
            <div className="auth-mode-toggle">
              <button
                className={`auth-mode-btn${authMode === 'signin' ? ' active' : ''}`}
                onClick={() => setAuthMode('signin')}
                type="button"
              >
                Sign In
              </button>
              <button
                className={`auth-mode-btn${authMode === 'signup' ? ' active' : ''}`}
                onClick={() => setAuthMode('signup')}
                type="button"
              >
                Sign Up
              </button>
            </div>
            <div className="auth-form-row">
              <input
                className="select auth-input"
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
              />
              <input
                className="select auth-input"
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
                placeholder="Password"
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
            <div className="auth-form-row">
              <button className="btn btn-primary" onClick={onSubmit}>
                {authMode === 'signup' ? 'Create Account' : 'Email Sign In'}
              </button>
              <button className="btn btn-ghost" onClick={onGoogle}>Google</button>
              <button className="btn btn-ghost" onClick={onGuest}>Guest</button>
            </div>
            {authError && <div className="auth-error">{authError}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
