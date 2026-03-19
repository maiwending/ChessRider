/**
 * KNightAuraChess AI Engine — Web Worker (Optimized)
 *
 * Runs alpha-beta search off the main thread using KnightJumpChess logic.
 *
 * Messages IN:  { type: 'search', fen, difficulty, id }
 * Messages OUT: { type: 'result', from, to, promotion, san, score, depth, id }
 *               { type: 'error', message, id }
 */

import KnightJumpChess from '../KnightJumpChess.js';

// ── Piece values ────────────────────────────────────────────────
const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// ── Piece-square tables (White perspective, index 0 = a8) ───────
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

function mirrorIndex(i) {
  return (7 - Math.floor(i / 8)) * 8 + (i % 8);
}

// ── FAST static evaluation (no move generation!) ────────────────
function evaluate(game) {
  let score = 0;
  let whiteKing = false;
  let blackKing = false;

  for (let ri = 0; ri < 8; ri++) {
    for (let fi = 0; fi < 8; fi++) {
      const sq = FILES[fi] + RANKS[ri];
      const piece = game.get(sq);
      if (!piece) continue;

      if (piece.type === 'k') {
        if (piece.color === 'w') whiteKing = true;
        else blackKing = true;
      }

      const idx = ri * 8 + fi;
      const val = PIECE_VALUE[piece.type];
      const pst = piece.color === 'w'
        ? PST[piece.type][idx]
        : PST[piece.type][mirrorIndex(idx)];

      if (piece.color === 'w') {
        score += val + pst;
      } else {
        score -= val + pst;
      }
    }
  }

  // King capture detection
  if (!whiteKing) return -90000;
  if (!blackKing) return 90000;

  return score;
}

// ── Difficulty settings ─────────────────────────────────────────
const DIFFICULTY = {
  easy:   { depth: 1, randomness: 100, timeLimitMs: 500  },
  medium: { depth: 2, randomness: 30,  timeLimitMs: 2000 },
  hard:   { depth: 3, randomness: 5,   timeLimitMs: 5000 },
  expert: { depth: 4, randomness: 0,   timeLimitMs: 10000 },
};

// ── Move ordering (improves pruning) ────────────────────────────
function scoreMoveForOrdering(m) {
  let s = 0;
  if (m.captured) s += PIECE_VALUE[m.captured] * 10 - PIECE_VALUE[m.piece];
  if (m.promotion) s += PIECE_VALUE[m.promotion];
  if (m.flags && m.flags.includes('j')) s += 50;
  return s;
}

function orderMoves(moves) {
  // Score once, sort once
  const scored = moves.map(m => ({ m, s: scoreMoveForOrdering(m) }));
  scored.sort((a, b) => b.s - a.s);
  return scored.map(x => x.m);
}

// ── Alpha-beta with time limit ──────────────────────────────────
let searchDeadline = 0;
let nodesSearched = 0;

function alphaBeta(fen, depth, alpha, beta, isMaximizing) {
  nodesSearched++;

  // Time check every 512 nodes
  if ((nodesSearched & 511) === 0 && performance.now() > searchDeadline) {
    return evaluate(new KnightJumpChess(fen));
  }

  const game = new KnightJumpChess(fen);

  // Leaf node
  if (depth === 0) {
    return evaluate(game);
  }

  const moves = game.moves({ verbose: true });

  // No moves = checkmate or stalemate
  if (moves.length === 0) {
    // Check if king is captured (variant win condition)
    const eval0 = evaluate(game);
    if (Math.abs(eval0) > 50000) return eval0;
    // Otherwise checkmate/stalemate
    if (game.isCheckmateRider()) {
      return isMaximizing ? -80000 - depth : 80000 + depth;
    }
    return 0; // stalemate
  }

  const ordered = orderMoves(moves);

  if (isMaximizing) {
    let best = -Infinity;
    for (const move of ordered) {
      const child = new KnightJumpChess(fen);
      child.move(move);
      const score = alphaBeta(child.fen(), depth - 1, alpha, beta, false);
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of ordered) {
      const child = new KnightJumpChess(fen);
      child.move(move);
      const score = alphaBeta(child.fen(), depth - 1, alpha, beta, true);
      best = Math.min(best, score);
      beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ── Find best move with iterative deepening ─────────────────────
function findBestMove(fen, difficulty) {
  const settings = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const game = new KnightJumpChess(fen);
  const moves = game.moves({ verbose: true });

  if (moves.length === 0) return null;
  if (moves.length === 1) return { move: moves[0], score: 0, nodes: 1, depth: 1 };

  const isMaximizing = game.turn() === 'w';
  searchDeadline = performance.now() + settings.timeLimitMs;
  nodesSearched = 0;

  let bestMove = moves[0]; // fallback
  let bestScore = isMaximizing ? -Infinity : Infinity;
  let finalDepth = 1;

  // Iterative deepening: search depth 1, then 2, etc.
  for (let d = 1; d <= settings.depth; d++) {
    if (performance.now() > searchDeadline) break;

    let depthBestMove = moves[0];
    let depthBestScore = isMaximizing ? -Infinity : Infinity;
    const ordered = orderMoves(moves);

    for (const move of ordered) {
      if (performance.now() > searchDeadline) break;

      const child = new KnightJumpChess(fen);
      child.move(move);
      const score = alphaBeta(child.fen(), d - 1, -Infinity, Infinity, !isMaximizing);

      // Add randomness for lower difficulties
      const jitter = settings.randomness > 0
        ? (Math.random() - 0.5) * settings.randomness
        : 0;
      const adjusted = score + jitter;

      if (isMaximizing ? adjusted > depthBestScore : adjusted < depthBestScore) {
        depthBestScore = adjusted;
        depthBestMove = move;
      }
    }

    bestMove = depthBestMove;
    bestScore = depthBestScore;
    finalDepth = d;
  }

  // For easy difficulty: sometimes pick a random legal move
  if (difficulty === 'easy' && Math.random() < 0.25) {
    bestMove = moves[Math.floor(Math.random() * moves.length)];
  }

  return { move: bestMove, score: bestScore, nodes: nodesSearched, depth: finalDepth };
}

// ── Worker message handler ──────────────────────────────────────
self.onmessage = function (e) {
  const { type, fen, difficulty, id } = e.data;
  if (type !== 'search') return;

  try {
    const t0 = performance.now();
    const result = findBestMove(fen, difficulty || 'medium');
    const elapsed = performance.now() - t0;

    if (!result || !result.move) {
      self.postMessage({ type: 'error', message: 'No legal moves', id });
      return;
    }

    self.postMessage({
      type: 'result',
      from: result.move.from,
      to: result.move.to,
      promotion: result.move.promotion || null,
      san: result.move.san || `${result.move.from}${result.move.to}`,
      score: result.score,
      nodes: result.nodes,
      timeMs: Math.round(elapsed),
      depth: result.depth,
      id,
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message, id });
  }
};
