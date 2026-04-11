import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import LearnPage from './LearnPage.jsx';

describe('LearnPage tutorials', () => {
  it('requires the correct move square before advancing a challenge step', async () => {
    const user = userEvent.setup();

    render(
      <LearnPage
        tutorialsOnly
        onBack={vi.fn()}
        onOpenTutorials={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /single jump/i }));

    expect(screen.getByText(/the blocker appears/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText(/aura lets it jump once/i)).toBeInTheDocument();
    expect(screen.getByText(/click the landing square behind the blocker/i)).toBeInTheDocument();

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeDisabled();

    await user.click(screen.getByLabelText(/board square 1-1/i));
    expect(screen.getByText(/not that square/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/target square 1-5/i));
    expect(screen.getByText(/correct\. that is the first legal square beyond the blocker/i)).toBeInTheDocument();
    expect(nextButton).toBeEnabled();
  });
});
