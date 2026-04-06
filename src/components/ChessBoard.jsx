import React, { useEffect, useState } from 'react';
import wp from '../assets/chess/cburnett/Chess_plt45.svg';
import wn from '../assets/chess/cburnett/Chess_nlt45.svg';
import wb from '../assets/chess/cburnett/Chess_blt45.svg';
import wr from '../assets/chess/cburnett/Chess_rlt45.svg';
import wq from '../assets/chess/cburnett/Chess_qlt45.svg';
import wk from '../assets/chess/cburnett/Chess_klt45.svg';
import bp from '../assets/chess/cburnett/Chess_pdt45.svg';
import bn from '../assets/chess/cburnett/Chess_ndt45.svg';
import bb from '../assets/chess/cburnett/Chess_bdt45.svg';
import br from '../assets/chess/cburnett/Chess_rdt45.svg';
import bq from '../assets/chess/cburnett/Chess_qdt45.svg';
import bk from '../assets/chess/cburnett/Chess_kdt45.svg';
import '../styles/ChessBoard.css';

const pieceSprites = {
  w: { p: wp, n: wn, b: wb, r: wr, q: wq, k: wk },
  b: { p: bp, n: bn, b: bb, r: br, q: bq, k: bk }
};

const pieceLetters = {
  w: { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' },
  b: { p: 'p', n: 'n', b: 'b', r: 'r', q: 'q', k: 'k' }
};

export default function ChessBoard({
  game,
  selectedSquare,
  legalMoves,
  onSquareClick,
  theme,
  customThemeVars,
  pieceStyle,
  lastMove,
  flipped,
  inCheck,
  board3d,
  moveAnimation,
}) {
  const handleSquarePress = (event, square) => {
    event.preventDefault();
    onSquareClick(square);
  };

  const filesBase = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranksBase = ['8', '7', '6', '5', '4', '3', '2', '1'];

  const files = flipped ? [...filesBase].reverse() : filesBase;
  const ranks = flipped ? [...ranksBase].reverse() : ranksBase;

  // Get knight aura squares when a piece is selected
  const getKnightAuraSquares = () => {
    if (!game || !selectedSquare) return new Set();
    const piece = game.get(selectedSquare);
    if (!piece) return new Set();

    const color = piece.color;
    const auraSquares = new Set();  
    // Check which squares are near a friendly knight
    for (const r of ranksBase) {
      for (const f of filesBase) {
        const sq = `${f}${r}`;
        if (game.isNearKnight(sq, color)) {
          auraSquares.add(sq);
        }
      }
    }
    return auraSquares;
  };

  const knightAuraSquares = getKnightAuraSquares();

  const getAuraPieceSquares = () => {
    if (!game) return new Set();

    const auraPieceSquares = new Set();
    for (const r of ranksBase) {
      for (const f of filesBase) {
        const sq = `${f}${r}`;
        const piece = game.get(sq);
        if (!piece || piece.type === 'n') continue;
        if (game.isNearKnight(sq, piece.color)) {
          auraPieceSquares.add(sq);
        }
      }
    }
    return auraPieceSquares;
  };

  const auraPieceSquares = getAuraPieceSquares();

  // Find king in check
  const getCheckSquare = () => {
    if (!game || !inCheck) return null;
    const turn = game.turn();
    for (const r of ranksBase) {
      for (const f of filesBase) {
        const sq = `${f}${r}`;
        const piece = game.get(sq);
        if (piece && piece.type === 'k' && piece.color === turn) return sq;
      }
    }
    return null;
  };

  const checkSquare = getCheckSquare();

  const themeClass = theme?.startsWith('custom:') ? 'theme-custom' : `theme-${theme || 'classic'}`;
  const effectivePieceStyle = pieceStyle;

  const getSquareCenter = (square) => {
    if (!square) return null;
    const file = square[0];
    const rank = square[1];
    const col = files.indexOf(file);
    const row = ranks.indexOf(rank);
    if (col < 0 || row < 0) return null;
    return {
      x: `${(col + 0.5) * 12.5}%`,
      y: `${(row + 0.5) * 12.5}%`,
    };
  };

  const moveFromCenter = getSquareCenter(moveAnimation?.from);
  const moveToCenter = getSquareCenter(moveAnimation?.to);
  const selectedHandCenter = board3d && selectedSquare && !moveAnimation ? getSquareCenter(selectedSquare) : null;
  const selectedPiece = board3d && selectedSquare && !moveAnimation ? game.get(selectedSquare) : null;
  const [moveOverlayActive, setMoveOverlayActive] = useState(false);
  const [moveProgress, setMoveProgress] = useState(0);
  const [movePlaced, setMovePlaced] = useState(false);

  useEffect(() => {
    if (!(board3d && moveAnimation && moveFromCenter && moveToCenter)) {
      setMoveOverlayActive(false);
      setMoveProgress(0);
      setMovePlaced(false);
      return undefined;
    }
    setMoveOverlayActive(false);
    setMoveProgress(0);
    setMovePlaced(false);
    let frame = 0;
    let start = 0;
    const travelDuration = 780;
    const settleDuration = 160;
    const tick = (timestamp) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / travelDuration, 1);
      setMoveProgress(progress);
      setMovePlaced(elapsed >= travelDuration + settleDuration);
      if (elapsed < travelDuration + settleDuration) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame((timestamp) => {
      setMoveOverlayActive(true);
      tick(timestamp);
    });
    return () => cancelAnimationFrame(frame);
  }, [board3d, moveAnimation, moveFromCenter, moveToCenter]);

  const currentMoveCenter = (() => {
    if (!moveFromCenter || !moveToCenter) return null;
    const startX = Number.parseFloat(moveFromCenter.x);
    const startY = Number.parseFloat(moveFromCenter.y);
    const endX = Number.parseFloat(moveToCenter.x);
    const endY = Number.parseFloat(moveToCenter.y);
    const eased = moveProgress < 0.5
      ? 4 * moveProgress ** 3
      : 1 - ((-2 * moveProgress + 2) ** 3) / 2;
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy) || 1;
    const sway = Math.sin(eased * Math.PI) * Math.min(distance * 0.01, 0.28);
    const offsetX = (-dy / distance) * sway;
    const offsetY = (dx / distance) * sway;
    const lead = Math.sin(eased * Math.PI) * Math.min(distance * 0.02, 0.35);
    const leadX = (dx / distance) * lead;
    const leadY = (dy / distance) * lead;
    const lift = 1.2 + Math.sin(eased * Math.PI) * 2.2;
    const handTilt = -12 + eased * 14;
    const pieceTilt = -1 + eased * 2;
    const pieceScale = 1.005 + Math.sin(eased * Math.PI) * 0.015;
    return {
      x: `${startX + dx * eased + offsetX + leadX}%`,
      y: `${startY + dy * eased + offsetY + leadY}%`,
      progress: eased,
      lift,
      handTilt,
      pieceTilt,
      pieceScale,
      gripX: `${-6 + lead * 5}px`,
      gripY: `${1 + Math.sin(eased * Math.PI) * 2}px`,
    };
  })();

  const renderPieceVisual = (piece, className, style) => {
    if (effectivePieceStyle === 'svg') {
      return (
        <img
          className={className}
          style={style}
          src={pieceSprites[piece.color][piece.type]}
          alt=""
          draggable="false"
        />
      );
    }
    return (
      <span className={`${className} board-hand-piece--text piece piece--${piece.color}`} style={style}>
        {pieceLetters[piece.color][piece.type]}
      </span>
    );
  };

  return (
    <div
      className={`chessboard-wrapper ${themeClass}${board3d ? ' board--3d' : ''}`}
      style={theme?.startsWith('custom:') ? customThemeVars : undefined}
    >
      {game ? (
        <div className="board-surface">
          <div className="board-grid">
            {ranks.map((rank) =>
              files.map((file) => {
                const square = `${file}${rank}`;
                const piece = game.get(square);
                const hideBoardPieceDuringCarry = Boolean(
                  board3d &&
                  moveAnimation &&
                  square === moveAnimation.to &&
                  !movePlaced
                );
                const visiblePiece = hideBoardPieceDuringCarry ? null : piece;
                const isLight = (file.charCodeAt(0) + rank.charCodeAt(0)) % 2 === 1;
                const isSelected = selectedSquare === square;
                const isLegal = legalMoves.includes(square);
                const isCapture = isLegal && visiblePiece && visiblePiece.color !== game.turn();
                const isLastFrom = lastMove && lastMove.from === square;
                const isLastTo = lastMove && lastMove.to === square;
                const isCheck = checkSquare === square;
                const isAura = knightAuraSquares.has(square) && selectedSquare;
                const isAuraPiece = auraPieceSquares.has(square);

                const squareClass = [
                  'square',
                  isLight ? 'square--light' : 'square--dark',
                  isSelected ? 'square--selected' : '',
                  isLegal && !isCapture ? 'square--legal' : '',
                  isCapture ? 'square--capture' : '',
                  isLastFrom ? 'square--last-from' : '',
                  isLastTo ? 'square--last-to' : '',
                  isCheck ? 'square--check' : '',
                  isAura && !isSelected && !isLegal ? 'square--aura' : '',
                  visiblePiece ? 'square--occupied' : '',
                  isSelected ? 'square--holding' : ''
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <button
                    key={square}
                    type="button"
                    className={squareClass}
                    onClick={(event) => event.preventDefault()}
                    onPointerUp={(event) => handleSquarePress(event, square)}
                    aria-label={`Square ${square}`}
                  >
                    {visiblePiece && (
                      <span className={`piece-shell${isAuraPiece ? ' piece-shell--aura' : ''}`}>
                        {effectivePieceStyle === 'svg' ? (
                          renderPieceVisual(visiblePiece, 'piece-image')
                        ) : (
                          <span className={`piece piece--${visiblePiece.color}`}>
                            {pieceLetters[visiblePiece.color][visiblePiece.type]}
                          </span>
                        )}
                        {isAuraPiece && <span className="piece-aura-mark">✦</span>}
                      </span>
                    )}
                    {rank === (flipped ? '8' : '1') && (
                      <span className="file-label">{file}</span>
                    )}
                    {file === (flipped ? 'h' : 'a') && (
                      <span className="rank-label">{rank}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          {board3d && selectedHandCenter && selectedPiece && (
            <div
              className="board-hand-overlay board-hand-overlay--selected"
              style={{ '--hand-x': selectedHandCenter.x, '--hand-y': selectedHandCenter.y }}
            >
              <div className="board-hand board-hand--idle" />
              {renderPieceVisual(selectedPiece, 'board-hand-piece board-hand-piece--idle')}
            </div>
          )}
          {board3d && moveAnimation && moveFromCenter && moveToCenter && (
            <div
              key={moveAnimation.key}
              className={`board-hand-overlay board-hand-overlay--move board-hand-overlay--${moveAnimation.actor}${moveOverlayActive ? ' board-hand-overlay--active' : ''}`}
              style={{
                '--hand-x': currentMoveCenter?.x || moveFromCenter.x,
                '--hand-y': currentMoveCenter?.y || moveFromCenter.y,
                '--carry-lift': `${currentMoveCenter?.lift || 3}px`,
                '--hand-tilt': `${currentMoveCenter?.handTilt || -8}deg`,
                '--piece-tilt': `${currentMoveCenter?.pieceTilt || 0}deg`,
                '--piece-scale': `${currentMoveCenter?.pieceScale || 1.02}`,
                '--piece-grip-x': currentMoveCenter?.gripX || '-5px',
                '--piece-grip-y': currentMoveCenter?.gripY || '1px',
                '--drop-x': '54px',
                '--drop-y': '22px',
              }}
            >
              <div className="board-hand-carry">
                <div className="board-hand board-hand--move" />
                {renderPieceVisual(moveAnimation.movingPiece, 'board-hand-piece board-hand-piece--move')}
                {moveAnimation.capturedPiece && (
                  renderPieceVisual(
                    moveAnimation.capturedPiece,
                    `board-captured-piece board-captured-piece--throw${moveOverlayActive ? ' board-captured-piece--active' : ''}`
                  )
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p>Loading game...</p>
      )}
    </div>
  );
}
