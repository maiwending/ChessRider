import test from 'node:test';
import assert from 'node:assert/strict';
import KnightJumpChess from './KnightJumpChess.js';

function withKings(game) {
  game.put({ type: 'k', color: 'w' }, 'a1');
  game.put({ type: 'k', color: 'b' }, 'h8');
  return game;
}

test('friendly knights enable jump aura but enemy knights do not', () => {
  const enemyKnightGame = new KnightJumpChess();
  enemyKnightGame.clear();
  enemyKnightGame.put({ type: 'r', color: 'w' }, 'a1');
  enemyKnightGame.put({ type: 'p', color: 'b' }, 'b1');
  enemyKnightGame.put({ type: 'n', color: 'b' }, 'a2');
  enemyKnightGame.put({ type: 'k', color: 'w' }, 'e1');
  enemyKnightGame.put({ type: 'k', color: 'b' }, 'e8');
  const enemyMoves = enemyKnightGame.moves({ square: 'a1', verbose: true });
  assert.equal(enemyMoves.some((move) => move.flags?.includes('j')), false);

  const friendlyKnightGame = new KnightJumpChess();
  friendlyKnightGame.clear();
  friendlyKnightGame.put({ type: 'r', color: 'w' }, 'a1');
  friendlyKnightGame.put({ type: 'p', color: 'b' }, 'b1');
  friendlyKnightGame.put({ type: 'n', color: 'w' }, 'a2');
  friendlyKnightGame.put({ type: 'k', color: 'w' }, 'e1');
  friendlyKnightGame.put({ type: 'k', color: 'b' }, 'e8');
  const friendlyMoves = friendlyKnightGame.moves({ square: 'a1', verbose: true });
  assert.equal(friendlyMoves.some((move) => move.flags?.includes('j')), true);
});

test('sliding pieces can jump one blocker and continue or capture', () => {
  const game = new KnightJumpChess();
  game.clear();
  game.put({ type: 'n', color: 'w' }, 'a2');
  game.put({ type: 'r', color: 'w' }, 'a1');
  game.put({ type: 'p', color: 'b' }, 'c1');
  game.put({ type: 'p', color: 'b' }, 'g1');
  game.put({ type: 'k', color: 'w' }, 'h2');
  game.put({ type: 'k', color: 'b' }, 'h8');

  const moves = game.moves({ square: 'a1', verbose: true }).filter((move) => move.flags?.includes('j'));
  const horizontalMoves = moves.filter((move) => move.to.endsWith('1'));
  assert.deepEqual(
    horizontalMoves.map((move) => move.to).sort(),
    ['d1', 'e1', 'f1', 'g1']
  );
  const captureMove = horizontalMoves.find((move) => move.to === 'g1');
  assert.ok(captureMove);
  assert.ok(captureMove.flags.includes('c'));
});

test('pawns may jump forward over a blocker only into an empty square', () => {
  const game = new KnightJumpChess();
  game.clear();
  withKings(game);
  game.put({ type: 'n', color: 'w' }, 'd3');
  game.put({ type: 'p', color: 'w' }, 'e2');
  game.put({ type: 'p', color: 'b' }, 'e3');

  const moves = game.moves({ square: 'e2', verbose: true });
  assert.ok(moves.some((move) => move.to === 'e4' && move.flags?.includes('j')));
});

test('pawns cannot capture by jumping straight forward over a blocker', () => {
  const game = new KnightJumpChess();
  game.clear();
  withKings(game);
  game.put({ type: 'n', color: 'w' }, 'd3');
  game.put({ type: 'p', color: 'w' }, 'e2');
  game.put({ type: 'p', color: 'b' }, 'e3');
  game.put({ type: 'r', color: 'b' }, 'e4');

  const moves = game.moves({ square: 'e2', verbose: true });
  assert.equal(moves.some((move) => move.to === 'e4' && move.flags?.includes('c')), false);
  assert.equal(moves.some((move) => move.to === 'e4'), false);
});

test('pawns can still jump diagonally to capture when the landing square has an enemy', () => {
  const game = new KnightJumpChess();
  game.clear();
  withKings(game);
  game.put({ type: 'n', color: 'w' }, 'd3');
  game.put({ type: 'p', color: 'w' }, 'e2');
  game.put({ type: 'p', color: 'b' }, 'f3');
  game.put({ type: 'q', color: 'b' }, 'g4');

  const moves = game.moves({ square: 'e2', verbose: true });
  const jumpCapture = moves.find((move) => move.to === 'g4');
  assert.ok(jumpCapture);
  assert.ok(jumpCapture.flags.includes('j'));
  assert.ok(jumpCapture.flags.includes('c'));
});
