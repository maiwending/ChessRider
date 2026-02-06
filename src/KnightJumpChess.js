import { Chess } from 'chess.js';

/**
 * Knight Jump Chess Variant
 * 
 * Rules:
 * - Pieces adjacent to OR reachable by knight's move from a knight can jump over ONE blocking piece
 * - Pieces move along their normal paths (rook straight, bishop diagonal, etc.)
 * - Pawns can jump one square forward when blocked
 * - Kings can jump one square in any direction when blocked
 * - Can jump to capture or just move
 */

class KnightJumpChess extends Chess {
  constructor(fen) {
    super(fen);
  }

  /**
   * Override put() to maintain hash consistency
   */
  put(piece, square) {
    const result = super.put(piece, square);
    this._resetInternalState();
    return result;
  }

  /**
   * Override remove() to maintain hash consistency
   */
  remove(square) {
    const result = super.remove(square);
    this._resetInternalState();
    return result;
  }

  /**
   * Override clear() to maintain hash consistency
   */
  clear() {
    const result = super.clear();
    this._resetInternalState();
    return result;
  }

  /**
   * Reset internal state after manual board modifications
   */
  _resetInternalState() {
    try {
      // Recreate the game from current FEN to ensure all internal state is correct
      const currentFen = this.fen();
      const tempGame = new Chess(currentFen);
      
      // Copy over critical internal state from fresh instance
      this._hash = tempGame._hash;
      if (tempGame._kings) {
        this._kings = { ...tempGame._kings };
      }
    } catch (e) {
      // FEN might be invalid during test setup (e.g., missing kings)
      // Just skip - the _pieceKey override will handle BigInt conversions
    }
  }

  /**
   * Override _pieceKey to ensure it always returns a BigInt
   * This prevents the "Cannot mix BigInt and other types" error
   */
  _pieceKey(square, piece, color) {
    const key = super._pieceKey(square, piece, color);
    // Ensure the result is a BigInt
    if (typeof key === 'bigint') {
      return key;
    }
    // If it's a number, convert to BigInt
    return BigInt(key || 0);
  }

  /**
   * Check if a square is within knight's move distance from any friendly knight
   * @param {string} square - Square in algebraic notation (e.g., 'e4')
   * @param {string} color - Color of the piece on the square ('w' or 'b')
   * @returns {boolean}
   */
  isNearKnight(square, color) {
    const knights = this.getKnightsOnBoard();
    const targetFile = square.charCodeAt(0) - 97; // a=0, b=1, etc.
    const targetRank = parseInt(square[1]) - 1;

    for (const knight of knights) {
      // Only check knights of the same color
      if (knight.color !== color) continue;

      const knightFile = knight.square.charCodeAt(0) - 97;
      const knightRank = parseInt(knight.square[1]) - 1;

      const fileDiff = Math.abs(targetFile - knightFile);
      const rankDiff = Math.abs(targetRank - knightRank);

      // Check if adjacent (including diagonally)
      if (fileDiff <= 1 && rankDiff <= 1) {
        return true;
      }

      // Check if knight's move away (L-shape: 2+1 or 1+2)
      if ((fileDiff === 2 && rankDiff === 1) || (fileDiff === 1 && rankDiff === 2)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all knights currently on the board
   * @returns {Array} Array of knight objects with square and color
   */
  getKnightsOnBoard() {
    const knights = [];
    const board = this.board();

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === 'n') {
          // board() returns ranks from 8 to 1 (rank 8 at index 0)
          const square = String.fromCharCode(97 + file) + (8 - rank);
          knights.push({ square, color: piece.color });
        }
      }
    }

    return knights;
  }

  /**
   * Generate all legal moves including jump moves
   * @param {Object} options - Options object (same as chess.js)
   * @returns {Array} Array of move objects
   */
  moves(options = {}) {
    const { square, piece } = options;
    const standardMoves = this._moves({ legal: false, square, piece });
    const jumpMoves = this.generateJumpMoves(options);
    const moverColor = this.turn();

    const safeStandardMoves = standardMoves.filter((move) => this._isStandardMoveSafe(move, moverColor));
    const safeJumpMoves = jumpMoves.filter((move) => this._isJumpMoveSafe(move, moverColor));

    // If options.verbose is false, return just the SAN notation
    if (options.verbose === false || !options.verbose) {
      const sanMoves = safeStandardMoves.map(move => this._moveToSan(move, safeStandardMoves));
      return [...sanMoves, ...safeJumpMoves.map(move => move.san)];
    }

    const prettyStandardMoves = safeStandardMoves.map(move => this._formatStandardMove(move, safeStandardMoves));
    return [...prettyStandardMoves, ...safeJumpMoves];
  }

  /**
   * Generate all pseudo-legal moves (no self-check filtering).
   * Used for rider-check detection.
   */
  movesUnsafe(options = {}) {
    const { square, piece } = options;
    const standardMoves = this._moves({ legal: false, square, piece });
    const jumpMoves = this.generateJumpMoves(options);

    if (options.verbose === false || !options.verbose) {
      const sanMoves = standardMoves.map(move => this._moveToSan(move, standardMoves));
      return [...sanMoves, ...jumpMoves.map(move => move.san)];
    }

    const prettyStandardMoves = standardMoves.map(move => this._formatStandardMove(move, standardMoves));
    return [...prettyStandardMoves, ...jumpMoves];
  }

  /**
   * Generate jump moves for all pieces
   * @param {Object} options - Options for filtering moves (square, piece)
   * @returns {Array} Array of jump move objects
   */
  generateJumpMoves(options = {}) {
    const jumpMoves = [];
    const board = this.board();
    const currentColor = this.turn();

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (!piece || piece.color !== currentColor) continue;

        // board() returns ranks from 0-7 where rank 0 = rank 8, so convert properly
        const fromSquare = String.fromCharCode(97 + file) + (8 - rank);

        // Skip if filtering by square and this isn't it
        if (options.square && options.square !== fromSquare) continue;

        // Skip if filtering by piece and this isn't it
        if (options.piece && options.piece !== piece.type) continue;

        // Check if this piece is near a friendly knight
        if (!this.isNearKnight(fromSquare, piece.color)) continue;

        // Generate jump moves based on piece type
        let pieceJumpMoves = [];
        
        switch (piece.type) {
          case 'p':
            pieceJumpMoves = this.generatePawnJumps(fromSquare, piece.color);
            break;
          case 'n':
            // Knights don't get jump ability (they enable others)
            break;
          case 'b':
            pieceJumpMoves = this.generateBishopJumps(fromSquare, piece.color);
            break;
          case 'r':
            pieceJumpMoves = this.generateRookJumps(fromSquare, piece.color);
            break;
          case 'q':
            pieceJumpMoves = this.generateQueenJumps(fromSquare, piece.color);
            break;
          case 'k':
            pieceJumpMoves = this.generateKingJumps(fromSquare, piece.color);
            break;
        }

        jumpMoves.push(...pieceJumpMoves);
      }
    }

    return jumpMoves;
  }

  /**
   * Generate jump moves for a pawn
   * Pawns can jump one square forward when blocked
   */
  generatePawnJumps(fromSquare, color) {
    const moves = [];
    const file = fromSquare.charCodeAt(0) - 97;
    const rank = parseInt(fromSquare[1]) - 1;
    const direction = color === 'w' ? 1 : -1;

    // Check one square forward
    const nextRank = rank + direction;
    const nextSquare = String.fromCharCode(97 + file) + (nextRank + 1);
    
    if (nextRank >= 0 && nextRank < 8) {
      const blockingPiece = this.get(nextSquare);
      
      if (blockingPiece) {
        // There's a piece blocking, try to jump forward (move only)
        const jumpRank = rank + (direction * 2);
        const jumpSquare = String.fromCharCode(97 + file) + (jumpRank + 1);
        
        if (jumpRank >= 0 && jumpRank < 8) {
          const jumpTarget = this.get(jumpSquare);
          
          // Forward jump is a move only; must land on empty square
          if (!jumpTarget) {
            moves.push(this.createJumpMove(fromSquare, jumpSquare, 'p', jumpTarget, nextSquare));
          }
        }
      }
    }

    // Diagonal jumps for pawn captures only (must capture)
    for (const fileDelta of [-1, 1]) {
      const captureFile = file + fileDelta;
      const captureRank = rank + direction;
      
      if (captureFile >= 0 && captureFile < 8 && captureRank >= 0 && captureRank < 8) {
        const captureSquare = String.fromCharCode(97 + captureFile) + (captureRank + 1);
        const blockingPiece = this.get(captureSquare);
        
        // Allow jumping over ANY piece (friendly or enemy) when jumping diagonally
        if (blockingPiece) {
          // There's a piece to jump over, can we jump diagonally to capture?
          const jumpRank = rank + (direction * 2);
          const jumpFile = file + (fileDelta * 2);
          
          if (jumpFile >= 0 && jumpFile < 8 && jumpRank >= 0 && jumpRank < 8) {
            const jumpSquare = String.fromCharCode(97 + jumpFile) + (jumpRank + 1);
            const jumpTarget = this.get(jumpSquare);
            
            // Must capture an enemy piece on the landing square
            if (jumpTarget && jumpTarget.color !== color) {
              moves.push(this.createJumpMove(fromSquare, jumpSquare, 'p', jumpTarget, captureSquare));
            }
          }
        }
      }
    }

    return moves;
  }

  /**
   * Generate jump moves for sliding pieces (rook, bishop, queen)
   */
  generateSlidingJumps(fromSquare, color, directions) {
    const moves = [];
    const file = fromSquare.charCodeAt(0) - 97;
    const rank = parseInt(fromSquare[1]) - 1;

    for (const [fileDir, rankDir] of directions) {
      let currentFile = file;
      let currentRank = rank;
      let blockedPiece = null;
      let hasJumped = false;

      // Move in this direction until we hit the edge
      while (true) {
        currentFile += fileDir;
        currentRank += rankDir;

        // Check bounds
        if (currentFile < 0 || currentFile > 7 || currentRank < 0 || currentRank > 7) {
          break;
        }

        const currentSquare = String.fromCharCode(97 + currentFile) + (currentRank + 1);
        const pieceAtSquare = this.get(currentSquare);

        if (!hasJumped) {
          // Haven't jumped yet
          if (pieceAtSquare) {
            // Found first blocking piece - can jump over it
            blockedPiece = currentSquare;
            hasJumped = true;
            // Continue to next square after the jump
          }
        } else {
          // Already jumped over one piece - now sliding normally
          if (!pieceAtSquare) {
            // Empty square - can move here and continue
            moves.push(this.createJumpMove(fromSquare, currentSquare, this.get(fromSquare).type, null, blockedPiece));
          } else if (pieceAtSquare.color !== color) {
            // Enemy piece - can capture and stop
            moves.push(this.createJumpMove(fromSquare, currentSquare, this.get(fromSquare).type, pieceAtSquare, blockedPiece));
            break;
          } else {
            // Friendly piece - can't move here, stop
            break;
          }
        }
      }
    }

    return moves;
  }

  generateRookJumps(fromSquare, color) {
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // Right, Left, Up, Down
    return this.generateSlidingJumps(fromSquare, color, directions);
  }

  generateBishopJumps(fromSquare, color) {
    const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]]; // Diagonals
    return this.generateSlidingJumps(fromSquare, color, directions);
  }

  generateQueenJumps(fromSquare, color) {
    const directions = [
      [1, 0], [-1, 0], [0, 1], [0, -1],     // Rook directions
      [1, 1], [1, -1], [-1, 1], [-1, -1]    // Bishop directions
    ];
    return this.generateSlidingJumps(fromSquare, color, directions);
  }

  /**
   * Generate jump moves for a king
   * Kings can jump one square in any direction when blocked
   */
  generateKingJumps(fromSquare, color) {
    const moves = [];
    const file = fromSquare.charCodeAt(0) - 97;
    const rank = parseInt(fromSquare[1]) - 1;

    // All 8 directions around the king
    const directions = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];

    for (const [fileDir, rankDir] of directions) {
      const adjacentFile = file + fileDir;
      const adjacentRank = rank + rankDir;

      if (adjacentFile < 0 || adjacentFile > 7 || adjacentRank < 0 || adjacentRank > 7) {
        continue;
      }

      const adjacentSquare = String.fromCharCode(97 + adjacentFile) + (adjacentRank + 1);
      const blockingPiece = this.get(adjacentSquare);

      if (blockingPiece) {
        // There's a blocking piece, try to jump
        const jumpFile = file + (fileDir * 2);
        const jumpRank = rank + (rankDir * 2);

        if (jumpFile >= 0 && jumpFile < 8 && jumpRank >= 0 && jumpRank < 8) {
          const jumpSquare = String.fromCharCode(97 + jumpFile) + (jumpRank + 1);
          const jumpTarget = this.get(jumpSquare);

          if (!jumpTarget || jumpTarget.color !== color) {
            moves.push(this.createJumpMove(fromSquare, jumpSquare, 'k', jumpTarget, adjacentSquare));
          }
        }
      }
    }

    return moves;
  }

  /**
   * Create a jump move object
   */
  createJumpMove(from, to, piece, captured, jumpedOver) {
    const move = {
      from,
      to,
      piece,
      color: this.turn(),
      flags: 'j', // Custom flag for jump
      jumpedOver, // Track which piece was jumped over
      san: this.createJumpSAN(from, to, piece, captured, jumpedOver)
    };

    if (captured) {
      move.captured = captured.type;
      move.flags += 'c'; // Also mark as capture
    }

    // Check for promotion (pawns reaching last rank)
    if (piece === 'p') {
      const toRank = parseInt(to[1]);
      if ((this.turn() === 'w' && toRank === 8) || (this.turn() === 'b' && toRank === 1)) {
        move.promotion = 'q'; // Default to queen
        move.flags += 'p';
      }
    }

    return move;
  }

  /**
   * Create SAN notation for jump move
   */
  createJumpSAN(from, to, piece, captured, jumpedOver) {
    let san = '';

    // Piece letter (except for pawns)
    if (piece !== 'p') {
      san += piece.toUpperCase();
    }

    // From square for disambiguation
    san += from;

    // Capture indicator
    if (captured) {
      san += 'x';
    } else {
      san += '-';
    }

    // To square
    san += to;

    // Jump indicator (custom notation)
    san += '^' + jumpedOver;

    return san;
  }

  /**
   * Make a move (override to handle jump moves)
   */
  move(move, options = {}) {
    if (typeof move === 'string') {
      try {
        return super.move(move, options);
      } catch (e) {
        return null;
      }
    }

    const moverColor = this.turn();
    const moveObj = this._findStandardMove(move);
    if (moveObj && this._isStandardMoveSafe(moveObj, moverColor)) {
      return this._applyStandardMove(moveObj);
    }

    if (this._isJumpMoveSafe(move, moverColor)) {
      return this.makeJumpMove(move, options);
    }

    return null;
  }

  /**
   * Execute a jump move
   */
  makeJumpMove(move, options = {}) {
    const jumpMoves = this.generateJumpMoves();
    
    // Find matching jump move
    let matchingMove = null;
    
    if (typeof move === 'string') {
      // SAN notation
      matchingMove = jumpMoves.find(m => m.san === move);
    } else if (typeof move === 'object') {
      // Object notation - just match from and to squares
      // Promotion only matters for pawns reaching the last rank, which is handled by createJumpMove
      matchingMove = jumpMoves.find(m => 
        m.from === move.from && 
        m.to === move.to
      );
    }

    if (!matchingMove) {
      console.log('No matching jump move found. Available jumps:', jumpMoves.map(m => `${m.from}-${m.to}`));
      return null; // Invalid jump move
    }

    console.log('Found matching jump move:', matchingMove);

    // Execute the move using chess.js's internal methods
    // Remove the piece from source square
    this.remove(matchingMove.from);
    
    // NOTE: Do NOT remove the jumped-over piece! The jump just means we can move through it.
    // Only remove the destination piece if we're capturing it.
    
    // Remove destination piece if capturing
    const capturedPiece = this.get(matchingMove.to);
    if (capturedPiece) {
      console.log('Removing captured piece at:', matchingMove.to);
      this.remove(matchingMove.to);
    }
    
    // Place the piece at destination
    this.put({ type: matchingMove.piece, color: matchingMove.color }, matchingMove.to);

    // Toggle turn
    this._turn = this._turn === 'w' ? 'b' : 'w';

    // Reset internal state after manual board modifications
    this._resetInternalState();

    return matchingMove;
  }

  _findStandardMove(move) {
    if (!move || typeof move !== 'object') return null;
    const moves = this._moves({ legal: false });
    for (let i = 0, len = moves.length; i < len; i++) {
      if (
        move.from === this._algebraic(moves[i].from) &&
        move.to === this._algebraic(moves[i].to) &&
        (!('promotion' in moves[i]) || move.promotion === moves[i].promotion)
      ) {
        return moves[i];
      }
    }
    return null;
  }

  _applyStandardMove(moveObj) {
    const moves = this._moves({ legal: false });
    const san = this._moveToSan(moveObj, moves);
    this._makeMove(moveObj);
    this._incPositionCount();
    return this._formatStandardMove(moveObj, moves, san);
  }

  _isStandardMoveSafe(moveObj, moverColor) {
    const copy = new KnightJumpChess(this.fen());
    copy._makeMove(moveObj);
    copy._incPositionCount();
    return !copy.isKingCapturable(moverColor);
  }

  _isJumpMoveSafe(move, moverColor) {
    const copy = new KnightJumpChess(this.fen());
    const result = copy.makeJumpMove(move);
    if (!result) return false;
    return !copy.isKingCapturable(moverColor);
  }

  _algebraic(squareIndex) {
    const file = squareIndex & 0xf;
    const rank = squareIndex >> 4;
    return String.fromCharCode(97 + file) + (8 - rank);
  }

  _formatStandardMove(moveObj, moves, sanOverride) {
    return {
      color: moveObj.color,
      from: this._algebraic(moveObj.from),
      to: this._algebraic(moveObj.to),
      piece: moveObj.piece,
      captured: moveObj.captured,
      promotion: moveObj.promotion,
      san: sanOverride || this._moveToSan(moveObj, moves)
    };
  }

  /**
   * Get king square for a color.
   */
  getKingSquare(color) {
    const board = this.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === 'k' && piece.color === color) {
          return String.fromCharCode(97 + file) + (8 - rank);
        }
      }
    }
    return null;
  }

  /**
   * Check if a king of a given color can be captured on the opponent's turn.
   */
  isKingCapturable(color) {
    const kingSquare = this.getKingSquare(color);
    if (!kingSquare) return true;

    const opponent = color === 'w' ? 'b' : 'w';
    const temp = new KnightJumpChess(this.fen());
    temp._turn = opponent;
    const opponentMoves = temp.movesUnsafe({ verbose: true });
    return opponentMoves.some(move => move.to === kingSquare);
  }

  /**
   * Rider rule: check is when your king can be captured.
   */
  isCheckRider() {
    return this.isKingCapturable(this.turn());
  }

  /**
   * Rider rule: checkmate if in check and no move removes capture threat.
   */
  isCheckmateRider() {
    if (!this.isCheckRider()) return false;
    const moverColor = this.turn();
    const moves = this.moves({ verbose: true });
    if (moves.length === 0) return true;

    for (const move of moves) {
      const copy = new KnightJumpChess(this.fen());
      copy.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
      if (!copy.isKingCapturable(moverColor)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Rider rule: stalemate if not in check and no moves available.
   */
  isStalemateRider() {
    if (this.isCheckRider()) return false;
    const moves = this.moves({ verbose: true });
    return moves.length === 0;
  }

  /**
   * Check which kings are still on the board.
   * @returns {{ w: boolean, b: boolean }}
   */
  getKingStatus() {
    const status = { w: false, b: false };
    const board = this.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === 'k') {
          status[piece.color] = true;
        }
      }
    }
    return status;
  }

  /**
   * Determine winner by king capture, if any.
   * @returns {'w'|'b'|null}
   */
  getWinnerByKingCapture() {
    const status = this.getKingStatus();
    if (!status.w && status.b) return 'b';
    if (!status.b && status.w) return 'w';
    return null;
  }
}

export default KnightJumpChess;
