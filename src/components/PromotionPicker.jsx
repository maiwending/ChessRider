import React from 'react';
import wn from '../assets/chess/cburnett/Chess_nlt45.svg';
import wb from '../assets/chess/cburnett/Chess_blt45.svg';
import wr from '../assets/chess/cburnett/Chess_rlt45.svg';
import wq from '../assets/chess/cburnett/Chess_qlt45.svg';
import bn from '../assets/chess/cburnett/Chess_ndt45.svg';
import bb from '../assets/chess/cburnett/Chess_bdt45.svg';
import br from '../assets/chess/cburnett/Chess_rdt45.svg';
import bq from '../assets/chess/cburnett/Chess_qdt45.svg';

const promotionSprites = {
  w: { q: wq, r: wr, b: wb, n: wn },
  b: { q: bq, r: br, b: bb, n: bn },
};

const promotionOptions = [
  { key: 'q', label: 'Queen' },
  { key: 'r', label: 'Rook' },
  { key: 'b', label: 'Bishop' },
  { key: 'n', label: 'Knight' },
];

export default function PromotionPicker({
  color = 'w',
  onChoosePromotion,
  onCancelPromotion,
}) {
  return (
    <div className="promotion-picker" role="dialog" aria-label="Choose promotion piece">
      <p className="promotion-picker__title">Promote pawn to</p>
      <div className="promotion-picker__options">
        {promotionOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className="promotion-picker__option"
            onClick={() => onChoosePromotion(option.key)}
          >
            <img
              className="promotion-picker__icon"
              src={promotionSprites[color][option.key]}
              alt=""
              draggable="false"
            />
            <span className="promotion-picker__label">{option.label}</span>
          </button>
        ))}
      </div>
      <button type="button" className="promotion-picker__cancel" onClick={onCancelPromotion}>
        Cancel
      </button>
    </div>
  );
}
