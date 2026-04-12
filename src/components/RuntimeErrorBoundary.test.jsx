import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RuntimeErrorBoundary from './RuntimeErrorBoundary.jsx';

function CrashingChild() {
  throw new Error('boom');
}

describe('RuntimeErrorBoundary', () => {
  it('shows fallback when a child crashes and allows retry', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    const onReset = vi.fn();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <RuntimeErrorBoundary onError={onError} onReset={onReset}>
        <CrashingChild />
      </RuntimeErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(onError).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /retry view/i }));
    expect(onReset).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});
