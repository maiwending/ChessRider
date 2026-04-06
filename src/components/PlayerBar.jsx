import React from 'react';

export default function PlayerBar({ position, color, isActiveTurn, name, rating, clock, formatClock }) {
  return (
    <div className={`player-bar player-bar--${position}${isActiveTurn ? ' player-bar--active-turn' : ''}`}>
      <div className="player-bar__info">
        <span className={`player-bar__color-indicator player-bar__color-indicator--${color === 'w' ? 'white' : 'black'}`} />
        <span className="player-bar__name">{name}</span>
        {rating && <span className="player-bar__rating">{rating}</span>}
      </div>
      {clock != null && (
        <div className={`player-bar__clock${isActiveTurn ? ' player-bar__clock--active' : ''}${clock <= 10 ? ' player-bar__clock--low' : ''}`}>
          {formatClock(clock)}
        </div>
      )}
    </div>
  );
}
