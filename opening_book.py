"""
Simple Opening Book for ChessRider

Stores popular opening moves for early game strength.
"""

from typing import Optional, List, Dict, Tuple
import chess

# Opening book: FEN -> List of recommended moves
OPENING_BOOK = {
    # Starting position
    chess.STARTING_FEN: [
        "e2e4",  # King's Pawn Opening
        "d2d4",  # Queen's Pawn Opening
        "c2c4",  # English Opening
        "g1f3",  # Reti Opening
    ],
    # After 1.e4
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1": [
        "c7c5",  # Sicilian Defense
        "e7e5",  # Open Game
        "c7c6",  # Caro-Kann Defense
        "d7d5",  # Scandinavian Defense
    ],
    # After 1.e4 e5
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2": [
        "g1f3",  # Italian Game
        "f2f4",  # King's Gambit
        "b1c3",  # Vienna Game
    ],
    # After 1.d4
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1": [
        "d7d5",  # Queen's Gambit Accepted
        "g8f6",  # Indian Defense
        "c7c6",  # Slav Defense
        "e7e6",  # Queen's Gambit Declined
    ],
}


def get_book_move(fen: str) -> Optional[str]:
    """
    Get a book move for the given position.
    
    Args:
        fen: Position in FEN notation
    
    Returns:
        UCI move or None if not in book
    """
    if fen in OPENING_BOOK:
        moves = OPENING_BOOK[fen]
        # Return first move (could randomize for variety)
        return moves[0] if moves else None
    return None


def get_book_moves(fen: str) -> List[str]:
    """Get all book moves for the given position"""
    return OPENING_BOOK.get(fen, [])


def is_in_opening_book(fen: str) -> bool:
    """Check if position is in opening book"""
    return fen in OPENING_BOOK


def count_book_positions() -> int:
    """Get number of positions in opening book"""
    return len(OPENING_BOOK)


def add_book_moves(fen: str, moves: List[str]) -> None:
    """Add moves to opening book"""
    if fen not in OPENING_BOOK:
        OPENING_BOOK[fen] = []
    OPENING_BOOK[fen].extend(moves)


if __name__ == "__main__":
    print(f"Opening Book Positions: {count_book_positions()}")
    print("\nSample positions:")
    for fen, moves in list(OPENING_BOOK.items())[:3]:
        print(f"  FEN: {fen[:50]}...")
        print(f"  Moves: {moves}\n")
