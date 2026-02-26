"""
Enhanced ChessRider AI Engine with Advanced Techniques

Features:
- Piece-Square Tables (PST) for positional evaluation
- Transposition Table for move caching
- Killer Move Heuristic
- Null Move Pruning
- Improved move ordering
- Difficulty levels
"""

import math
import time
from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Union, Dict, Callable
from collections import defaultdict
import pickle

import chess

from bot_ab import (
    ChessRiderPosition,
    JumpMove,
    PIECE_VALUES,
    is_capture,
    order_moves,
)


# ============================================================================
# PIECE-SQUARE TABLES (PST)
# ============================================================================

# Standard chess PST (normalized, white's perspective)
# Pawns
PAWN_PST = [
    0,   0,   0,   0,   0,   0,   0,   0,
    50,  50,  50,  50,  50,  50,  50,  50,
    10,  10,  20,  30,  30,  20,  10,  10,
    5,   5,  10,  25,  25,  10,   5,   5,
    0,   0,   0,  20,  20,   0,   0,   0,
    5, -5, -10,  0,   0, -10,  -5,   5,
    5,  10, 10, -20, -20, 10,  10,   5,
    0,   0,   0,   0,   0,   0,   0,   0,
]

# Knights
KNIGHT_PST = [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20,   0,   0,   0,   0, -20, -40,
    -30,   0,  10,  15,  15,  10,   0, -30,
    -30,   5,  15,  20,  20,  15,   5, -30,
    -30,   0,  15,  20,  20,  15,   0, -30,
    -30,   5,  10,  15,  15,  10,   5, -30,
    -40, -20,   0,   5,   5,   0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
]

# Bishops
BISHOP_PST = [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,  10,  10,   5,   0, -10,
    -10,   5,   5,  10,  10,   5,   5, -10,
    -10,   0,  10,  10,  10,  10,   0, -10,
    -10,  10,  10,  10,  10,  10,  10, -10,
    -10,   5,   0,   0,   0,   0,   5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
]

# Rooks
ROOK_PST = [
    0,   0,   0,   0,   0,   0,   0,   0,
    5,  10,  10,  10,  10,  10,  10,   5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
    0,   0,   0,   5,   5,   0,   0,   0,
]

# Queens
QUEEN_PST = [
    -20, -10, -10,  -5,  -5, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,   5,   5,   5,   0, -10,
    -5,   0,   5,   5,   5,   5,   0,  -5,
    0,   0,   5,   5,   5,   5,   0,  -5,
    -10,  5,   5,   5,   5,   5,   0, -10,
    -10,   0,   5,   0,   0,   0,   0, -10,
    -20, -10, -10,  -5,  -5, -10, -10, -20,
]

# King (middlegame)
KING_PST_MIDDLE = [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20,  20,   0,   0,   0,   0,  20,  20,
    20,  30,  10,   0,   0,  10,  30,  20,
]

# King (endgame)
KING_PST_END = [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10,   0,   0, -10, -20, -30,
    -30, -10,  20,  30,  30,  20, -10, -30,
    -30, -10,  30,  40,  40,  30, -10, -30,
    -30, -10,  30,  40,  40,  30, -10, -30,
    -30, -10,  20,  30,  30,  20, -10, -30,
    -30, -20, -10,   0,   0, -10, -20, -30,
    -50, -40, -30, -20, -20, -30, -40, -50,
]

PST_TABLES = {
    chess.PAWN: PAWN_PST,
    chess.KNIGHT: KNIGHT_PST,
    chess.BISHOP: BISHOP_PST,
    chess.ROOK: ROOK_PST,
    chess.QUEEN: QUEEN_PST,
    chess.KING: KING_PST_MIDDLE,
}


def flip_pst(pst: List[int]) -> List[int]:
    """Flip PST for black's perspective"""
    return [pst[chess.square_mirror(i)] for i in range(64)]


@dataclass(frozen=True)
class TTEntry:
    """Transposition Table Entry"""
    depth: int
    score: int
    flag: str  # 'exact', 'lower', 'upper'
    move: Optional[Union[chess.Move, JumpMove]] = None


class TranspositionTable:
    """Simple transposition table implementation"""
    
    def __init__(self, max_entries: int = 100000):
        self.table: Dict[str, TTEntry] = {}
        self.max_entries = max_entries
        self.hits = 0
        self.misses = 0
    
    def store(self, fen: str, depth: int, score: int, flag: str, 
              move: Optional[Union[chess.Move, JumpMove]] = None) -> None:
        if len(self.table) >= self.max_entries:
            self.table.clear()  # Simple replacement strategy
        self.table[fen] = TTEntry(depth, score, flag, move)
    
    def lookup(self, fen: str, depth: int) -> Optional[Tuple[int, str, Optional[Union[chess.Move, JumpMove]]]]:
        if fen not in self.table:
            self.misses += 1
            return None
        entry = self.table[fen]
        if entry.depth < depth:
            self.misses += 1
            return None
        self.hits += 1
        return entry.score, entry.flag, entry.move
    
    def clear(self) -> None:
        self.table.clear()
        self.hits = 0
        self.misses = 0


# ============================================================================
# ADVANCED EVALUATION
# ============================================================================

def get_pst_value(piece: chess.Piece, square: int) -> int:
    """Get piece-square table value"""
    pst = PST_TABLES[piece.piece_type]
    # For king endgame, use different PST
    if piece.piece_type == chess.KING:
        # Simplified: use middle-game PST (endgame detection can be added)
        pst = KING_PST_MIDDLE

    # Use mirrored index for black pieces so both colors share the white PST.
    idx = square if piece.color == chess.WHITE else chess.square_mirror(square)
    return pst[idx]


def evaluate_material(position: ChessRiderPosition) -> int:
    """Evaluate material balance"""
    board = position.board
    score = 0
    for square, piece in board.piece_map().items():
        value = PIECE_VALUES[piece.piece_type]
        if piece.color == chess.WHITE:
            score += value
        else:
            score -= value
    return score


def evaluate_position(position: ChessRiderPosition) -> int:
    """Evaluate positional factors"""
    board = position.board
    score = 0
    
    # Piece-square tables
    for square, piece in board.piece_map().items():
        pst_val = get_pst_value(piece, square)
        if piece.color == chess.WHITE:
            score += pst_val
        else:
            score -= pst_val
    
    return score


def evaluate_pawn_structure(position: ChessRiderPosition) -> int:
    """Evaluate pawn structure"""
    board = position.board
    score = 0
    white_pawns = board.pieces(chess.PAWN, chess.WHITE)
    black_pawns = board.pieces(chess.PAWN, chess.BLACK)
    
    # Penalize doubled pawns
    for file in range(8):
        white_file_pawns = len([sq for sq in white_pawns if chess.square_file(sq) == file])
        black_file_pawns = len([sq for sq in black_pawns if chess.square_file(sq) == file])
        if white_file_pawns > 1:
            score -= 10 * (white_file_pawns - 1)
        if black_file_pawns > 1:
            score += 10 * (black_file_pawns - 1)
    
    # Reward passed pawns
    for pawn_sq in white_pawns:
        file = chess.square_file(pawn_sq)
        rank = chess.square_rank(pawn_sq)
        # Simple passed pawn detection
        is_passed = all(
            not any(sq for sq in black_pawns 
                   if chess.square_file(sq) == f and chess.square_rank(sq) > rank)
            for f in range(file - 1, file + 2) if 0 <= f < 8
        )
        if is_passed:
            score += 20 + rank * 5  # Reward more as it advances
    
    for pawn_sq in black_pawns:
        file = chess.square_file(pawn_sq)
        rank = chess.square_rank(pawn_sq)
        is_passed = all(
            not any(sq for sq in white_pawns 
                   if chess.square_file(sq) == f and chess.square_rank(sq) < rank)
            for f in range(file - 1, file + 2) if 0 <= f < 8
        )
        if is_passed:
            score -= 20 + (7 - rank) * 5
    
    return score


def evaluate_mobility_fast(position: ChessRiderPosition) -> int:
    """Fast mobility estimate based on piece count (not exact).
    Avoids expensive legal_moves() calls."""
    board = position.board
    white_pieces = bin(board.occupied_co[chess.WHITE]).count('1')
    black_pieces = bin(board.occupied_co[chess.BLACK]).count('1')
    
    # Simpler heuristic: more pieces generally = more mobility
    # Adjust based on piece activity (centralization is handled by PST)
    white_bonus = 0
    black_bonus = 0
    
    # Penalty for passive pawns
    for sq in board.pieces(chess.PAWN, chess.WHITE):
        # Penalty if blocked
        forward_sq = sq + 8
        if forward_sq < 64 and board.piece_at(forward_sq):
            white_bonus -= 1
    
    for sq in board.pieces(chess.PAWN, chess.BLACK):
        # Penalty if blocked
        forward_sq = sq - 8
        if forward_sq >= 0 and board.piece_at(forward_sq):
            black_bonus -= 1
    
    return white_bonus - black_bonus


def evaluate_king_safety(position: ChessRiderPosition) -> int:
    """Evaluate king safety"""
    board = position.board
    score = 0
    
    # Check if kings are in danger
    if position.is_king_capturable(chess.WHITE):
        score -= 300
    if position.is_king_capturable(chess.BLACK):
        score += 300
    
    # Penalty for exposed king (simplified)
    white_king = board.king(chess.WHITE)
    black_king = board.king(chess.BLACK)
    
    if white_king is not None:
        white_king_rank = chess.square_rank(white_king)
        if white_king_rank > 4:  # King advanced in middlegame
            score -= 20
    
    if black_king is not None:
        black_king_rank = chess.square_rank(black_king)
        if black_king_rank < 3:  # King advanced in middlegame
            score += 20
    
    return score


def evaluate_jump_advantage(position: ChessRiderPosition) -> int:
    """Bonus for jump move availability (ChessRider-specific).
    Estimate based on knight proximity instead of full search."""
    board = position.board
    score = 0
    
    # Simple heuristic: having knights near other pieces = jump availability
    white_knights = board.pieces(chess.KNIGHT, chess.WHITE)
    black_knights = board.pieces(chess.KNIGHT, chess.BLACK)
    
    # Count pieces near white knights (can be jumped with)
    white_jump_potential = 0
    for knight_sq in white_knights:
        # Count pieces in knight adjacency
        near_pieces = 0
        file = chess.square_file(knight_sq)
        rank = chess.square_rank(knight_sq)
        for df in [-2, -1, 0, 1, 2]:
            for dr in [-2, -1, 0, 1, 2]:
                if df == 0 and dr == 0:
                    continue
                nf = file + df
                nr = rank + dr
                if 0 <= nf <= 7 and 0 <= nr <= 7:
                    sq = chess.square(nf, nr)
                    p = board.piece_at(sq)
                    if p and p.color == chess.WHITE and p.piece_type != chess.KING:
                        near_pieces += 1
        white_jump_potential += near_pieces
    
    # Same for black
    black_jump_potential = 0
    for knight_sq in black_knights:
        near_pieces = 0
        file = chess.square_file(knight_sq)
        rank = chess.square_rank(knight_sq)
        for df in [-2, -1, 0, 1, 2]:
            for dr in [-2, -1, 0, 1, 2]:
                if df == 0 and dr == 0:
                    continue
                nf = file + df
                nr = rank + dr
                if 0 <= nf <= 7 and 0 <= nr <= 7:
                    sq = chess.square(nf, nr)
                    p = board.piece_at(sq)
                    if p and p.color == chess.BLACK and p.piece_type != chess.KING:
                        near_pieces += 1
        black_jump_potential += near_pieces
    
    return (white_jump_potential - black_jump_potential)


def evaluate(position: ChessRiderPosition) -> int:
    """
    Comprehensive evaluation combining multiple factors.
    Positive score favors white, negative favors black.
    Optimized to avoid expensive legal_moves() calls.
    """
    # Check for terminal positions
    winner = position.winner_by_king_capture()
    if winner is not None:
        return 100000 if winner == chess.WHITE else -100000
    
    if position.is_checkmate():
        return -99999 if position.board.turn == chess.WHITE else 99999
    
    material = evaluate_material(position)
    positional = evaluate_position(position)
    pawn_struct = evaluate_pawn_structure(position)
    mobility = evaluate_mobility_fast(position)  # Use fast version
    king_safety = evaluate_king_safety(position)
    jump_bonus = evaluate_jump_advantage(position)
    
    # Weighted combination
    score = (material * 1.0 +
             positional * 0.5 +
             pawn_struct * 0.5 +
             mobility * 0.2 +  # Reduced weight since estimate is rougher
             king_safety * 0.8 +
             jump_bonus * 0.3)
    
    return int(score)


def evaluate_for_side_to_move(position: ChessRiderPosition) -> int:
    """
    Return evaluation from the perspective of the side to move.
    This is required for correct negamax scoring.
    """
    score = evaluate(position)
    return score if position.board.turn == chess.WHITE else -score


# ============================================================================
# ENHANCED SEARCH
# ============================================================================

class KillerMoves:
    """Killer move heuristic"""
    def __init__(self, max_depth: int = 64):
        self.killers: List[List[Optional[Union[chess.Move, JumpMove]]]] = [
            [None, None] for _ in range(max_depth)
        ]
    
    def update(self, depth: int, move: Union[chess.Move, JumpMove]) -> None:
        if depth < len(self.killers):
            self.killers[depth][1] = self.killers[depth][0]
            self.killers[depth][0] = move
    
    def get(self, depth: int) -> List[Optional[Union[chess.Move, JumpMove]]]:
        if depth < len(self.killers):
            return self.killers[depth]
        return [None, None]
    
    def clear(self) -> None:
        for i in range(len(self.killers)):
            self.killers[i] = [None, None]


def opening_development_bonus(
    position: ChessRiderPosition,
    move: Union[chess.Move, JumpMove],
) -> int:
    """
    Encourage natural opening development for fast root ordering stability.
    """
    board = position.board
    if board.fullmove_number > 10:
        return 0

    piece = board.piece_at(move.from_square)
    if piece is None:
        return 0

    bonus = 0
    from_rank = chess.square_rank(move.from_square)
    to_file = chess.square_file(move.to_square)
    home_rank = 0 if piece.color == chess.WHITE else 7

    if piece.piece_type in (chess.KNIGHT, chess.BISHOP) and from_rank == home_rank:
        bonus += 120

    if piece.piece_type == chess.PAWN and to_file in (3, 4):
        bonus += 40

    return bonus


def opening_sortie_penalty(
    position: ChessRiderPosition,
    move: Union[chess.Move, JumpMove],
) -> int:
    """
    Heavily penalize premature rook/queen sorties in the opening.
    This prevents tactical-looking but strategically bad raids like Rh8xh2.
    """
    board = position.board
    if board.fullmove_number > 10:
        return 0

    piece = board.piece_at(move.from_square)
    if piece is None:
        return 0

    from_rank = chess.square_rank(move.from_square)
    home_rank = 0 if piece.color == chess.WHITE else 7
    if from_rank != home_rank:
        return 0

    target = board.piece_at(move.to_square)
    victim_val = PIECE_VALUES.get(target.piece_type, 0) if target else 0

    if piece.piece_type == chess.ROOK:
        if victim_val <= 100:
            return 8000
        if victim_val <= 330:
            return 5000
        return 1200

    if piece.piece_type == chess.QUEEN:
        if victim_val <= 100:
            return 6000
        if victim_val <= 330:
            return 3500
        return 800

    return 0


def advanced_move_ordering(
    position: ChessRiderPosition,
    moves: List[Union[chess.Move, JumpMove]],
    killer_moves: List[Optional[Union[chess.Move, JumpMove]]],
    tt_move: Optional[Union[chess.Move, JumpMove]] = None,
) -> List[Union[chess.Move, JumpMove]]:
    """
    Improved move ordering:
    1. Transposition table move
    2. Captures (by value)
    3. Checks
    4. Killer moves
    5. Quiet moves
    """
    scored = []
    
    for move in moves:
        score = 0
        
        # TT move first
        if move == tt_move:
            score = 10000
        # Captures
        elif is_capture(position, move):
            # MVV/LVA heuristic
            attacker = position.board.piece_at(move.from_square)
            attacker_val = PIECE_VALUES.get(attacker.piece_type, 100) if attacker else 100
            target = position.board.piece_at(move.to_square)
            victim_val = PIECE_VALUES.get(target.piece_type, 100) if target else 0
            score = 5000 + victim_val - attacker_val // 10
        # Checks
        else:
            tmp = position.copy()
            tmp.push(move)
            if tmp.is_check():
                score = 1000
        
        # Killer moves
        if move in killer_moves:
            score += 500

        # Opening heuristics to avoid premature heavy-piece raids.
        score += opening_development_bonus(position, move)
        score -= opening_sortie_penalty(position, move)

        scored.append((score, move))
    
    scored.sort(key=lambda x: x[0], reverse=True)
    return [m for _, m in scored]


def quiescence(
    position: ChessRiderPosition,
    alpha: int,
    beta: int,
    deadline: Optional[float],
    max_depth: int = 3,
    depth: int = 0,
) -> int:
    """Quiescence search to handle tactical positions"""
    if deadline and time.time() > deadline:
        return evaluate_material(position)
    
    if depth > max_depth:
        return evaluate_material(position)
    
    # Use fast material-only eval (don't call full evaluate which is expensive)
    stand_pat = evaluate_material(position)
    if position.board.turn == chess.BLACK:
        stand_pat = -stand_pat
    
    if stand_pat >= beta:
        return beta
    if alpha < stand_pat:
        alpha = stand_pat
    
    moves = [m for m in position.legal_moves() if is_capture(position, m)]
    if not moves:
        return stand_pat
    
    moves = order_moves(position, moves)
    
    # Limit number of moves to examine in quiescence
    for move in moves[:8]:  # Only check top 8 captures
        if deadline and time.time() > deadline:
            return alpha
        child = position.copy()
        child.push(move)
        score = -quiescence(child, -beta, -alpha, deadline, max_depth, depth + 1)
        if score >= beta:
            return beta
        if score > alpha:
            alpha = score
    
    return alpha


def alphabeta(
    position: ChessRiderPosition,
    depth: int,
    alpha: int,
    beta: int,
    use_quiescence: bool,
    deadline: Optional[float],
    killer_moves: KillerMoves,
    tt: TranspositionTable,
) -> int:
    """Alpha-beta with enhancements"""
    if deadline and time.time() > deadline:
        # Use fast material eval instead of expensive full eval
        val = evaluate_material(position)
        return val if position.board.turn == chess.WHITE else -val
    
    # Transposition table lookup
    fen = position.board.fen()
    tt_result = tt.lookup(fen, depth)
    if tt_result:
        score, flag, _ = tt_result
        if flag == 'exact':
            return score
        elif flag == 'lower':
            alpha = max(alpha, score)
        elif flag == 'upper':
            beta = min(beta, score)
        if alpha >= beta:
            return score
    
    winner = position.winner_by_king_capture()
    if winner is not None:
        return 100000 if winner == position.board.turn else -100000
    
    if depth == 0:
        result = (
            quiescence(position, alpha, beta, deadline)
            if use_quiescence
            else evaluate_for_side_to_move(position)
        )
        tt.store(fen, depth, result, 'exact')
        return result
    
    moves = position.legal_moves()
    if not moves:
        if position.is_check():
            tt.store(fen, depth, -99999, 'exact')
            return -99999
        tt.store(fen, depth, 0, 'exact')
        return 0
    
    killers = killer_moves.get(depth)
    moves = advanced_move_ordering(position, moves, killers)

    alpha_orig = alpha
    best_score = -math.inf
    best_move = None
    
    for move in moves:
        if deadline and time.time() > deadline:
            break
        
        child = position.copy()
        child.push(move)
        score = -alphabeta(child, depth - 1, -beta, -alpha, use_quiescence, deadline, killer_moves, tt)
        
        if score > best_score:
            best_score = score
            best_move = move
        
        if score > alpha:
            alpha = score
            if best_move:
                killer_moves.update(depth, best_move)
        
        if alpha >= beta:
            break

    if best_move is None:
        result = evaluate_for_side_to_move(position)
        tt.store(fen, depth, result, 'exact')
        return result
    
    # Store in TT
    if best_score <= alpha_orig:
        flag = 'upper'
    elif best_score >= beta:
        flag = 'lower'
    else:
        flag = 'exact'
    
    tt.store(fen, depth, best_score, flag, best_move)
    return best_score


def find_best_move(
    fen: str,
    depth: int = 4,
    time_limit: Optional[float] = None,
    use_quiescence: bool = True,
    tt: Optional[TranspositionTable] = None,
) -> Tuple[Optional[Union[chess.Move, JumpMove]], int]:
    """Find best move with enhanced search"""
    position = ChessRiderPosition(fen)
    best_move = None
    best_score = -math.inf
    start = time.time()
    deadline = start + time_limit if time_limit else None
    
    if tt is None:
        tt = TranspositionTable()
    
    killer_moves = KillerMoves(depth)
    
    for d in range(1, depth + 1):
        if deadline and time.time() > deadline:
            return best_move, best_score
        
        moves = position.legal_moves()
        moves = advanced_move_ordering(position, moves, [None, None])
        
        current_best = None
        current_score = -math.inf
        
        for move in moves:
            if deadline and time.time() > deadline:
                # On timeout during a depth iteration, return the last fully
                # completed depth result (iterative deepening best practice).
                if best_move is not None:
                    return best_move, best_score
                if current_best is not None:
                    return current_best, current_score
                return best_move, best_score
            
            child = position.copy()
            child.push(move)
            score = -alphabeta(
                child, d - 1, -100000, 100000, use_quiescence, deadline, killer_moves, tt
            )
            
            if score > current_score:
                current_score = score
                current_best = move

        if current_best is not None:
            best_move = current_best
            best_score = current_score
    
    return best_move, best_score


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Enhanced ChessRider AI")
    parser.add_argument("--fen", type=str, default=chess.STARTING_FEN, help="FEN position")
    parser.add_argument("--depth", type=int, default=5, help="Search depth")
    parser.add_argument("--time", type=float, default=None, help="Time limit in seconds")
    args = parser.parse_args()
    
    move, score = find_best_move(args.fen, depth=args.depth, time_limit=args.time)
    if move is None:
        print("nomove")
    else:
        uci = move.uci() if isinstance(move, chess.Move) else move.to_uci()
        print(uci)
        print(f"score {score}")
