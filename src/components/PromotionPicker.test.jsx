import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PromotionPicker from './PromotionPicker.jsx';

describe('PromotionPicker', () => {
  it('renders all promotion choices with piece icons', () => {
    render(
      <PromotionPicker
        color="b"
        onChoosePromotion={() => {}}
        onCancelPromotion={() => {}}
      />
    );

    expect(screen.getByRole('dialog', { name: /choose promotion piece/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /queen/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rook/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bishop/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /knight/i })).toBeInTheDocument();
    expect(document.querySelectorAll('.promotion-picker__icon')).toHaveLength(4);
  });

  it('calls the correct handlers for choose and cancel', async () => {
    const user = userEvent.setup();
    const onChoosePromotion = vi.fn();
    const onCancelPromotion = vi.fn();

    render(
      <PromotionPicker
        color="w"
        onChoosePromotion={onChoosePromotion}
        onCancelPromotion={onCancelPromotion}
      />
    );

    await user.click(screen.getByRole('button', { name: /bishop/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onChoosePromotion).toHaveBeenCalledWith('b');
    expect(onCancelPromotion).toHaveBeenCalledTimes(1);
  });
});
