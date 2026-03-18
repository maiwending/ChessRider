import React from 'react';
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
  pieceStyle,
  lastMove,
  flipped,
  inCheck
}) {
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

  return (
    <div className={`chessboard-wrapper theme-${theme || 'classic'}`}>
      {game ? (
        <div className="board-surface">
          <div className="board-grid">
            {ranks.map((rank) =>
              files.map((file) => {
                const square = `${file}${rank}`;
                const piece = game.get(square);
                const isLight = (file.charCodeAt(0) + rank.charCodeAt(0)) % 2 === 1;
                const isSelected = selectedSquare === square;
                const isLegal = legalMoves.includes(square);
                const isCapture = isLegal && piece && piece.color !== game.turn();
                const isLastFrom = lastMove && lastMove.from === square;
                const isLastTo = lastMove && lastMove.to === square;
                const isCheck = checkSquare === square;
                const isAura = knightAuraSquares.has(square) && selectedSquare;

                const squareClass = [
                  'square',
                  isLight ? 'square--light' : 'square--dark',
                  isSelected ? 'square--selected' : '',
                  isLegal && !isCapture ? 'square--legal' : '',
                  isCapture ? 'square--capture' : '',
                  isLastFrom ? 'square--last-from' : '',
                  isLastTo ? 'square--last-to' : '',
                  isCheck ? 'square--check' : '',
                  isAura && !isSelected && !isLegal ? 'square--aura' : ''
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <button
                    key={square}
                    type="button"
                    className={squareClass}
                    onClick={() => onSquareClick(square)}
                    aria-label={`Square ${square}`}
                  >
                    {piece && pieceStyle === 'svg' && (
                      <img
                        className="piece-image"
                        src={pieceSprites[piece.color][piece.type]}
                        alt=""
                        draggable="false"
                      />
                    )}
                    {piece && pieceStyle !== 'svg' && (
                      <span className={`piece piece--${piece.color}`}>
                        {pieceLetters[piece.color][piece.type]}
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
        </div>
      ) : (
        <p>Loading game...</p>
      )}
    </div>
  );
}
