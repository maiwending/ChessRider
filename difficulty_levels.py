"""
ChessRider AI with Difficulty Levels

Difficulty Levels:
- Easy: Depth 2, simple evaluation, occasional blunders
- Medium: Depth 4, standard evaluation, good play
- Hard: Depth 6, enhanced evaluation with time management
- Expert: Depth 7+, full advanced techniques
"""

import random
import time
from enum import Enum
from typing import Optional, Tuple, Union, List

import chess

from bot_ab import ChessRiderPosition, JumpMove
from bot_engine import (
    find_best_move as find_best_move_enhanced,
    TranspositionTable,
    evaluate,
)


class Difficulty(Enum):
    """Difficulty levels"""
    EASY = 1
    MEDIUM = 2
    HARD = 3
    EXPERT = 4


DIFFICULTY_CONFIG = {
    Difficulty.EASY: {
        "depth": 2,
        "use_quiescence": False,
        "blunder_rate": 0.2,  # 20% chance to play suboptimal move
        "time_limit": 0.3,
        "description": "Beginner - Makes obvious mistakes",
    },
    Difficulty.MEDIUM: {
        "depth": 3,
        "use_quiescence": True,
        "blunder_rate": 0.0,
        "time_limit": 0.5,
        "description": "Intermediate - Solid play",
    },
    Difficulty.HARD: {
        "depth": 4,
        "use_quiescence": True,
        "blunder_rate": 0.0,
        "time_limit": 1.0,
        "description": "Advanced - Very strong",
    },
    Difficulty.EXPERT: {
        "depth": 5,
        "use_quiescence": True,
        "blunder_rate": 0.0,
        "time_limit": 2.0,
        "description": "Expert - Maximum strength",
    },
}


def get_random_legal_move(position: ChessRiderPosition) -> Optional[Union[chess.Move, JumpMove]]:
    """Get a random legal move"""
    moves = position.legal_moves()
    if not moves:
        return None
    return random.choice(moves)


def get_book_move(fen: str) -> Optional[Union[chess.Move, JumpMove]]:
    """
    Check opening book for current position.
    This is a simple implementation - can be extended with actual book.
    """
    # This would connect to an opening book database
    # For now, return None (use engine search)
    return None


def find_best_move_by_difficulty(
    fen: str,
    difficulty: Difficulty,
    use_tt: bool = True,
    depth_override: Optional[int] = None,
    time_override: Optional[float] = None,
) -> Tuple[Optional[Union[chess.Move, JumpMove]], int]:
    """
    Find best move based on difficulty level.
    
    Args:
        fen: Board position in FEN notation
        difficulty: Difficulty level
        use_tt: Whether to use transposition table
    
    Returns:
        Tuple of (best_move, score)
    """
    config = dict(DIFFICULTY_CONFIG[difficulty])
    if depth_override is not None:
        config["depth"] = max(1, min(int(depth_override), 10))
    if time_override is not None:
        config["time_limit"] = max(0.1, min(float(time_override), 60.0))
    
    position = ChessRiderPosition(fen)
    
    # Check for opening book move (for medium+ difficulty)
    if difficulty.value >= Difficulty.MEDIUM.value:
        book_move = get_book_move(fen)
        if book_move:
            return book_move, 0
    
    # Easy difficulty: sometimes play random moves
    if difficulty == Difficulty.EASY and random.random() < config["blunder_rate"]:
        random_move = get_random_legal_move(position)
        if random_move:
            return random_move, 0
    
    # Search for best move
    tt = TranspositionTable() if use_tt else None
    move, score = find_best_move_enhanced(
        fen,
        depth=config["depth"],
        time_limit=config["time_limit"],
        use_quiescence=config["use_quiescence"],
        tt=tt,
    )
    
    # Easy difficulty: sometimes pick suboptimal move (blunder)
    if difficulty == Difficulty.EASY and random.random() < config["blunder_rate"]:
        moves = position.legal_moves()
        if len(moves) > 1:
            # Remove best move and pick random from rest
            moves = [m for m in moves if m != move]
            if moves:
                move = random.choice(moves)
                score = 0
    
    return move, score


def get_difficulty_info(difficulty: Difficulty) -> dict:
    """Get information about a difficulty level"""
    config = DIFFICULTY_CONFIG[difficulty]
    return {
        "name": difficulty.name,
        "value": difficulty.value,
        "description": config["description"],
        "depth": config["depth"],
        "time_limit": config["time_limit"],
    }


def all_difficulties() -> List[dict]:
    """Get all difficulty levels"""
    return [get_difficulty_info(d) for d in Difficulty]


# ============================================================================
# Interactive Testing
# ============================================================================

def test_difficulty(difficulty: Difficulty, fen: Optional[str] = None, num_moves: int = 5):
    """Test a difficulty level"""
    if fen is None:
        fen = chess.STARTING_FEN
    
    print(f"\n{'='*60}")
    print(f"Testing Difficulty: {get_difficulty_info(difficulty)['description']}")
    print(f"{'='*60}\n")
    
    position = ChessRiderPosition(fen)
    
    for i in range(num_moves):
        print(f"Move {i + 1}:")
        print(f"FEN: {position.board.fen()}")
        
        start = time.time()
        move, score = find_best_move_by_difficulty(position.board.fen(), difficulty)
        elapsed = time.time() - start
        
        if move is None:
            print("No legal moves - game over!")
            break
        
        uci = move.uci() if isinstance(move, chess.Move) else move.to_uci()
        print(f"  Move: {uci}")
        print(f"  Score: {score}")
        print(f"  Time: {elapsed:.2f}s")
        
        position.push(move)
        print()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="ChessRider AI with Difficulty Levels")
    parser.add_argument(
        "--difficulty",
        type=str,
        choices=["easy", "medium", "hard", "expert"],
        default="medium",
        help="Difficulty level",
    )
    parser.add_argument("--fen", type=str, default=None, help="FEN position")
    parser.add_argument("--moves", type=int, default=5, help="Number of moves to test")
    
    args = parser.parse_args()
    difficulty = Difficulty[args.difficulty.upper()]
    
    test_difficulty(difficulty, args.fen, args.moves)
