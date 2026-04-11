import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import HomePage from './HomePage.jsx';

vi.mock('../utils/firebase.js', () => ({
  db: null,
}));

describe('HomePage', () => {
  it('shows the signed-out landing actions', () => {
    render(
      <HomePage
        user={null}
        profile={null}
        rating={1200}
        firebaseEnabled={true}
        incomingChallenge={null}
        onPlayGuest={() => {}}
        onSignIn={() => {}}
        onOpenAccount={() => {}}
        onHowItWorks={() => {}}
        onAcceptChallenge={() => {}}
        onDeclineChallenge={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /play as guest/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^play$/i })).not.toBeInTheDocument();
  });

  it('shows the signed-in launcher with account actions', () => {
    render(
      <HomePage
        user={{ uid: 'user-1', email: 'player@example.com' }}
        profile={{ displayName: 'Mai', wins: 9, losses: 4, draws: 2 }}
        rating={1342}
        firebaseEnabled={false}
        incomingChallenge={null}
        onPlayGuest={() => {}}
        onSignIn={() => {}}
        onOpenAccount={() => {}}
        onHowItWorks={() => {}}
        onAcceptChallenge={() => {}}
        onDeclineChallenge={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /account/i })).toBeInTheDocument();
    expect(screen.getByText(/1342 elo/i)).toBeInTheDocument();
    expect(screen.getByText(/no pending challenge/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /play as guest/i })).not.toBeInTheDocument();
  });

  it('lets a signed-in player accept or decline a home-page challenge', async () => {
    const user = userEvent.setup();
    const onAcceptChallenge = vi.fn();
    const onDeclineChallenge = vi.fn();

    render(
      <HomePage
        user={{ uid: 'user-1', email: 'player@example.com' }}
        profile={{ displayName: 'Mai', wins: 9, losses: 4, draws: 2 }}
        rating={1342}
        firebaseEnabled={true}
        incomingChallenge={{ id: 'challenge-1', fromName: 'Riley' }}
        onPlayGuest={() => {}}
        onSignIn={() => {}}
        onOpenAccount={() => {}}
        onHowItWorks={() => {}}
        onAcceptChallenge={onAcceptChallenge}
        onDeclineChallenge={onDeclineChallenge}
      />
    );

    await user.click(screen.getByRole('button', { name: /accept/i }));
    await user.click(screen.getByRole('button', { name: /decline/i }));

    expect(onAcceptChallenge).toHaveBeenCalledTimes(1);
    expect(onDeclineChallenge).toHaveBeenCalledTimes(1);
  });
});
