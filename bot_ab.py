import math
import time
from dataclasses import dataclass
from typing import List, Optional, Tuple, Union

import chess


PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,
}


@dataclass(frozen=True)
class JumpMove:
    from_square: int
    to_square: int
    promotion: Optional[int] = None
    jumped_over: Optional[int] = None

    def to_uci(self) -> str:
        uci = chess.square_name(self.from_square) + chess.square_name(self.to_square)
        if self.promotion:
            uci += chess.piece_symbol(self.promotion)
        return uci


MoveLike = Union[chess.Move, JumpMove]


class ChessRiderPosition:
    def __init__(self, fen: Optional[str] = None):
        self.board = chess.Board(fen) if fen else chess.Board()

    def copy(self) -> "ChessRiderPosition":
        pos = ChessRiderPosition()
        pos.board = self.board.copy(stack=False)
        return pos

    def turn_color(self) -> bool:
        return self.board.turn

    def get_king_square(self, color: bool) -> Optional[int]:
        return self.board.king(color)

    def is_king_capturable(self, color: bool) -> bool:
        king_sq = self.get_king_square(color)
        if king_sq is None:
            return True
        opponent = not color
        if self.board.is_attacked_by(opponent, king_sq):
            return True
        for move in self.generate_jump_moves(opponent):
            if move.to_square == king_sq:
                return True
        return False

    def is_check(self) -> bool:
        return self.is_king_capturable(self.board.turn)

    def is_checkmate(self) -> bool:
        if not self.is_check():
            return False
        return len(self.legal_moves()) == 0

    def is_stalemate(self) -> bool:
        if self.is_check():
            return False
        return len(self.legal_moves()) == 0

    def winner_by_king_capture(self) -> Optional[bool]:
        white_king = self.get_king_square(chess.WHITE)
        black_king = self.get_king_square(chess.BLACK)
        if white_king is None and black_king is not None:
            return chess.BLACK
        if black_king is None and white_king is not None:
            return chess.WHITE
        return None

    def legal_moves(self) -> List[MoveLike]:
        mover = self.board.turn
        standard_moves = list(self.board.generate_pseudo_legal_moves())
        jump_moves = self.generate_jump_moves(mover)

        legal: List[MoveLike] = []
        for move in standard_moves:
            if self._is_standard_move_safe(move, mover):
                legal.append(move)
        for move in jump_moves:
            if self._is_jump_move_safe(move, mover):
                legal.append(move)
        return legal

    def pseudo_legal_moves(self) -> List[MoveLike]:
        standard_moves = list(self.board.generate_pseudo_legal_moves())
        jump_moves = self.generate_jump_moves(self.board.turn)
        return standard_moves + jump_moves

    def push(self, move: MoveLike) -> None:
        if isinstance(move, chess.Move):
            self.board.push(move)
            return
        self._apply_jump_move(move)

    def _apply_jump_move(self, move: JumpMove) -> None:
        board = self.board
        piece = board.piece_at(move.from_square)
        if piece is None:
            return

        color = piece.color
        moving_piece = chess.Piece(piece.piece_type, color)
        capture_piece = board.piece_at(move.to_square)

        board.remove_piece_at(move.from_square)
        if capture_piece:
            board.remove_piece_at(move.to_square)

        promote_type = move.promotion if move.promotion else moving_piece.piece_type
        board.set_piece_at(move.to_square, chess.Piece(promote_type, color))

        # Update castling rights
        if moving_piece.piece_type == chess.KING:
            if color == chess.WHITE:
                board.castling_rights &= ~(chess.BB_A1 | chess.BB_H1)
            else:
                board.castling_rights &= ~(chess.BB_A8 | chess.BB_H8)
        if moving_piece.piece_type == chess.ROOK:
            if move.from_square == chess.A1:
                board.castling_rights &= ~chess.BB_A1
            elif move.from_square == chess.H1:
                board.castling_rights &= ~chess.BB_H1
            elif move.from_square == chess.A8:
                board.castling_rights &= ~chess.BB_A8
            elif move.from_square == chess.H8:
                board.castling_rights &= ~chess.BB_H8

        if capture_piece and capture_piece.piece_type == chess.ROOK:
            if move.to_square == chess.A1:
                board.castling_rights &= ~chess.BB_A1
            elif move.to_square == chess.H1:
                board.castling_rights &= ~chess.BB_H1
            elif move.to_square == chess.A8:
                board.castling_rights &= ~chess.BB_A8
            elif move.to_square == chess.H8:
                board.castling_rights &= ~chess.BB_H8

        # Halfmove/fullmove updates
        if moving_piece.piece_type == chess.PAWN or capture_piece:
            board.halfmove_clock = 0
        else:
            board.halfmove_clock += 1

        if board.turn == chess.BLACK:
            board.fullmove_number += 1

        board.ep_square = None
        board.turn = not board.turn

    def _is_standard_move_safe(self, move: chess.Move, mover: bool) -> bool:
        copy = self.copy()
        copy.board.push(move)
        return not copy.is_king_capturable(mover)

    def _is_jump_move_safe(self, move: JumpMove, mover: bool) -> bool:
        copy = self.copy()
        copy._apply_jump_move(move)
        return not copy.is_king_capturable(mover)

    def generate_jump_moves(self, color: bool) -> List[JumpMove]:
        moves: List[JumpMove] = []
        knight_squares = [sq for sq, p in self.board.piece_map().items() if p.color == color and p.piece_type == chess.KNIGHT]

        for square, piece in self.board.piece_map().items():
            if piece.color != color:
                continue
            if piece.piece_type == chess.KNIGHT:
                continue
            if not self._is_near_knight(square, knight_squares):
                continue

            if piece.piece_type == chess.PAWN:
                moves.extend(self._pawn_jump_moves(square, color))
            elif piece.piece_type == chess.BISHOP:
                moves.extend(self._sliding_jump_moves(square, color, [(1, 1), (1, -1), (-1, 1), (-1, -1)]))
            elif piece.piece_type == chess.ROOK:
                moves.extend(self._sliding_jump_moves(square, color, [(1, 0), (-1, 0), (0, 1), (0, -1)]))
            elif piece.piece_type == chess.QUEEN:
                moves.extend(self._sliding_jump_moves(square, color, [(1, 1), (1, -1), (-1, 1), (-1, -1), (1, 0), (-1, 0), (0, 1), (0, -1)]))
            elif piece.piece_type == chess.KING:
                moves.extend(self._king_jump_moves(square, color))

        return moves

    def _is_near_knight(self, square: int, knight_squares: List[int]) -> bool:
        file = chess.square_file(square)
        rank = chess.square_rank(square)
        for ksq in knight_squares:
            kf = chess.square_file(ksq)
            kr = chess.square_rank(ksq)
            df = abs(file - kf)
            dr = abs(rank - kr)
            if df <= 1 and dr <= 1:
                return True
            if (df == 2 and dr == 1) or (df == 1 and dr == 2):
                return True
        return False

    def _pawn_jump_moves(self, square: int, color: bool) -> List[JumpMove]:
        moves: List[JumpMove] = []
        direction = 1 if color == chess.WHITE else -1
        file = chess.square_file(square)
        rank = chess.square_rank(square)

        forward_rank = rank + direction
        if 0 <= forward_rank <= 7:
            forward_square = chess.square(file, forward_rank)
            if self.board.piece_at(forward_square):
                jump_rank = rank + 2 * direction
                if 0 <= jump_rank <= 7:
                    jump_square = chess.square(file, jump_rank)
                    if self.board.piece_at(jump_square) is None:
                        promo = chess.QUEEN if jump_rank in (0, 7) else None
                        moves.append(JumpMove(square, jump_square, promotion=promo, jumped_over=forward_square))

        for df in (-1, 1):
            capture_file = file + df
            capture_rank = rank + direction
            if 0 <= capture_file <= 7 and 0 <= capture_rank <= 7:
                capture_square = chess.square(capture_file, capture_rank)
                if self.board.piece_at(capture_square):
                    jump_file = file + 2 * df
                    jump_rank = rank + 2 * direction
                    if 0 <= jump_file <= 7 and 0 <= jump_rank <= 7:
                        jump_square = chess.square(jump_file, jump_rank)
                        target = self.board.piece_at(jump_square)
                        if target and target.color != color:
                            promo = chess.QUEEN if jump_rank in (0, 7) else None
                            moves.append(JumpMove(square, jump_square, promotion=promo, jumped_over=capture_square))
        return moves

    def _king_jump_moves(self, square: int, color: bool) -> List[JumpMove]:
        moves: List[JumpMove] = []
        file = chess.square_file(square)
        rank = chess.square_rank(square)
        directions = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]

        for df, dr in directions:
            adj_file = file + df
            adj_rank = rank + dr
            if not (0 <= adj_file <= 7 and 0 <= adj_rank <= 7):
                continue
            adj_sq = chess.square(adj_file, adj_rank)
            if not self.board.piece_at(adj_sq):
                continue
            jump_file = file + 2 * df
            jump_rank = rank + 2 * dr
            if 0 <= jump_file <= 7 and 0 <= jump_rank <= 7:
                jump_sq = chess.square(jump_file, jump_rank)
                target = self.board.piece_at(jump_sq)
                if target is None or target.color != color:
                    moves.append(JumpMove(square, jump_sq, jumped_over=adj_sq))
        return moves

    def _sliding_jump_moves(self, square: int, color: bool, directions: List[Tuple[int, int]]) -> List[JumpMove]:
        moves: List[JumpMove] = []
        file = chess.square_file(square)
        rank = chess.square_rank(square)

        for df, dr in directions:
            cur_file = file
            cur_rank = rank
            blocked_sq = None
            has_jumped = False
            while True:
                cur_file += df
                cur_rank += dr
                if not (0 <= cur_file <= 7 and 0 <= cur_rank <= 7):
                    break
                cur_sq = chess.square(cur_file, cur_rank)
                piece = self.board.piece_at(cur_sq)
                if not has_jumped:
                    if piece:
                        blocked_sq = cur_sq
                        has_jumped = True
                    continue
                if piece is None:
                    moves.append(JumpMove(square, cur_sq, jumped_over=blocked_sq))
                elif piece.color != color:
                    moves.append(JumpMove(square, cur_sq, jumped_over=blocked_sq))
                    break
                else:
                    break
        return moves


def evaluate(position: ChessRiderPosition) -> int:
    board = position.board
    score = 0
    for square, piece in board.piece_map().items():
        value = PIECE_VALUES[piece.piece_type]
        score += value if piece.color == chess.WHITE else -value

    temp_white = position.copy()
    temp_white.board.turn = chess.WHITE
    white_moves = len(temp_white.legal_moves())
    temp_black = position.copy()
    temp_black.board.turn = chess.BLACK
    black_moves = len(temp_black.legal_moves())
    score += (white_moves - black_moves) * 5

    if position.is_king_capturable(chess.WHITE):
        score -= 200
    if position.is_king_capturable(chess.BLACK):
        score += 200

    return score


def evaluate_for_side_to_move(position: ChessRiderPosition) -> int:
    """
    Return evaluation from the perspective of the side to move.
    This is required for correct negamax scoring.
    """
    score = evaluate(position)
    return score if position.board.turn == chess.WHITE else -score


def order_moves(position: ChessRiderPosition, moves: List[MoveLike]) -> List[MoveLike]:
    scored = []
    for move in moves:
        score = 0
        if isinstance(move, chess.Move):
            if position.board.is_capture(move):
                score += 100
            tmp = position.copy()
            tmp.push(move)
            if tmp.is_check():
                score += 50
        else:
            target = position.board.piece_at(move.to_square)
            if target:
                score += 100
            tmp = position.copy()
            tmp.push(move)
            if tmp.is_check():
                score += 50
        scored.append((score, move))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [m for _, m in scored]


def quiescence(position: ChessRiderPosition, alpha: int, beta: int, deadline: Optional[float]) -> int:
    if deadline and time.time() > deadline:
        return evaluate_for_side_to_move(position)
    stand_pat = evaluate_for_side_to_move(position)
    if stand_pat >= beta:
        return beta
    if alpha < stand_pat:
        alpha = stand_pat

    moves = [m for m in position.pseudo_legal_moves() if is_capture(position, m)]
    moves = order_moves(position, moves)
    for move in moves:
        if deadline and time.time() > deadline:
            break
        child = position.copy()
        child.push(move)
        score = -quiescence(child, -beta, -alpha, deadline)
        if score >= beta:
            return beta
        if score > alpha:
            alpha = score
    return alpha


def is_capture(position: ChessRiderPosition, move: MoveLike) -> bool:
    if isinstance(move, chess.Move):
        return position.board.is_capture(move)
    target = position.board.piece_at(move.to_square)
    return target is not None


def alphabeta(position: ChessRiderPosition, depth: int, alpha: int, beta: int, use_quiescence: bool, deadline: Optional[float]) -> int:
    if deadline and time.time() > deadline:
        return evaluate_for_side_to_move(position)
    winner = position.winner_by_king_capture()
    if winner is not None:
        return 100000 if winner == position.board.turn else -100000

    if depth == 0:
        return quiescence(position, alpha, beta, deadline) if use_quiescence else evaluate_for_side_to_move(position)

    moves = position.legal_moves()
    if not moves:
        if position.is_check():
            return -99999
        return 0

    moves = order_moves(position, moves)
    for move in moves:
        if deadline and time.time() > deadline:
            break
        child = position.copy()
        child.push(move)
        score = -alphabeta(child, depth - 1, -beta, -alpha, use_quiescence, deadline)
        if score >= beta:
            return beta
        if score > alpha:
            alpha = score
    return alpha


def find_best_move(fen: str, depth: int = 4, time_limit: Optional[float] = None, use_quiescence: bool = True) -> Tuple[Optional[MoveLike], int]:
    position = ChessRiderPosition(fen)
    best_move = None
    best_score = -math.inf
    start = time.time()
    deadline = start + time_limit if time_limit else None

    for d in range(1, depth + 1):
        moves = position.legal_moves()
        moves = order_moves(position, moves)
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
            score = -alphabeta(child, d - 1, -100000, 100000, use_quiescence, deadline)
            if score > current_score:
                current_score = score
                current_best = move
        if current_best is not None:
            best_move = current_best
            best_score = current_score
        if deadline and time.time() > deadline:
            break

    return best_move, best_score


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="ChessRider baseline alpha-beta bot")
    parser.add_argument("--fen", type=str, default=chess.STARTING_FEN, help="FEN position")
    parser.add_argument("--depth", type=int, default=4, help="Search depth (3-6 recommended)")
    parser.add_argument("--time", type=float, default=None, help="Time limit in seconds")
    args = parser.parse_args()

    move, score = find_best_move(args.fen, depth=args.depth, time_limit=args.time)
    if move is None:
        print("nomove")
        return
    uci = move.uci() if isinstance(move, chess.Move) else move.to_uci()
    print(uci)
    print(f"score {score}")


if __name__ == "__main__":
    main()
