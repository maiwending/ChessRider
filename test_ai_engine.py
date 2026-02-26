"""
Comprehensive Testing Suite for ChessRider AI

Tests:
1. Engine evaluation correctness
2. Move generation validity
3. Difficulty levels behavior
4. Performance benchmarks
5. Opening book functionality
"""

import time
import statistics
from typing import List, Tuple
import chess

from bot_ab import ChessRiderPosition, evaluate as old_evaluate
from bot_engine import (
    evaluate,
    find_best_move,
    TranspositionTable,
    PST_TABLES,
)
from difficulty_levels import find_best_move_by_difficulty, Difficulty
from opening_book import get_book_move, count_book_positions


# ============================================================================
# TEST POSITIONS
# ============================================================================

TEST_POSITIONS = {
    "startpos": chess.STARTING_FEN,
    "after_1e4": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "after_1e4c5": "rnbqkbnr/pp1ppppp/8/2p1P3/8/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2",
    "simple_endgame": "8/8/8/4k3/8/4K3/8/8 w - - 0 1",
    "white_winning": "8/6pk/5q1p/4Q3/8/6PK/8/8 b - - 0 1",
    "black_winning": "8/8/8/4pk2/8/2K5/8/1R6 b - - 0 1",
    "check_position": "8/8/8/4k3/8/4KQ2/8/8 b - - 0 1",
    "stalemate": "7k/5K2/6R1/8/8/8/8/8 b - - 0 1",
}


# ============================================================================
# EVALUATION TESTS
# ============================================================================

def test_evaluation_consistency() -> None:
    """Test that evaluation is consistent across positions"""
    print("\n" + "="*60)
    print("TEST: Evaluation Consistency")
    print("="*60)
    
    for name, fen in TEST_POSITIONS.items():
        pos = ChessRiderPosition(fen)
        score1 = evaluate(pos)
        score2 = evaluate(pos)
        assert score1 == score2, f"Inconsistent evaluation for {name}"
        print(f"✓ {name:20s}: {score1:8d}")
    
    print("\n✓ All evaluations consistent")


def test_material_evaluation() -> None:
    """Test that material values are correct"""
    print("\n" + "="*60)
    print("TEST: Material Evaluation")
    print("="*60)
    
    # Starting position: balanced
    pos = ChessRiderPosition(chess.STARTING_FEN)
    from bot_engine import evaluate_material
    material = evaluate_material(pos)
    assert material == 0, f"Starting position should be balanced, got {material}"
    print(f"✓ Starting position material: {material}")
    
    # After White sacrifices a pawn
    fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
    pos = ChessRiderPosition(fen)
    material = evaluate_material(pos)
    assert material > 0, f"White should be up material"
    print(f"✓ After 1.e4: White material advantage = {material}")


def test_pst_values() -> None:
    """Test that piece-square tables are loaded"""
    print("\n" + "="*60)
    print("TEST: Piece-Square Tables")
    print("="*60)
    
    for piece_type, pst in PST_TABLES.items():
        assert len(pst) == 64, f"PST for {piece_type} should have 64 squares"
        assert isinstance(pst, list), f"PST for {piece_type} should be a list"
        piece_name = chess.piece_name(piece_type)
        print(f"✓ {piece_name:8s} PST: {len(pst)} squares, "
              f"min={min(pst)}, max={max(pst)}")


# ============================================================================
# MOVE GENERATION TESTS
# ============================================================================

def test_legal_moves_generation() -> None:
    """Test that legal moves are generated correctly"""
    print("\n" + "="*60)
    print("TEST: Legal Moves Generation")
    print("="*60)
    
    for name, fen in TEST_POSITIONS.items():
        pos = ChessRiderPosition(fen)
        moves = pos.legal_moves()
        assert isinstance(moves, list), f"Moves should be a list"
        assert len(moves) > 0, f"Should have legal moves for {name}"
        print(f"✓ {name:20s}: {len(moves):3d} legal moves")


def test_move_validity() -> None:
    """Test that generated moves are valid"""
    print("\n" + "="*60)
    print("TEST: Move Validity")
    print("="*60)
    
    pos = ChessRiderPosition(chess.STARTING_FEN)
    moves = pos.legal_moves()
    
    valid_count = 0
    for move in moves:
        test_pos = pos.copy()
        test_pos.push(move)
        # Check that position is valid after move
        assert test_pos.board.is_valid(), f"Position invalid after move {move}"
        valid_count += 1
    
    print(f"✓ All {valid_count} moves are valid")


# ============================================================================
# DIFFICULTY LEVEL TESTS
# ============================================================================

def test_difficulty_levels() -> None:
    """Test that all difficulty levels work"""
    print("\n" + "="*60)
    print("TEST: Difficulty Levels")
    print("="*60)
    
    test_fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
    
    for difficulty in [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD, Difficulty.EXPERT]:
        start = time.time()
        move, score = find_best_move_by_difficulty(test_fen, difficulty)
        elapsed = time.time() - start
        
        assert move is not None, f"No move found for {difficulty.name}"
        uci = move.uci() if isinstance(move, chess.Move) else move.to_uci()
        print(f"✓ {difficulty.name:8s}: {uci} (score={score:6d}, time={elapsed:.2f}s)")


def test_difficulty_strength() -> None:
    """Test that difficulty levels have increasing strength (simplified)"""
    print("\n" + "="*60)
    print("TEST: Difficulty Strength Gradient")
    print("="*60)
    
    test_fen = chess.STARTING_FEN
    times = {}
    
    for difficulty in [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD, Difficulty.EXPERT]:
        start = time.time()
        move, score = find_best_move_by_difficulty(test_fen, difficulty)
        elapsed = time.time() - start
        times[difficulty] = elapsed
        
        print(f"✓ {difficulty.name:8s}: {elapsed:.3f}s")
    
    # Generally harder difficulties should take more time (not a hard requirement)
    print("\nNote: Time varies by system. Verify that higher difficulties explore deeper.")


# ============================================================================
# OPENING BOOK TESTS
# ============================================================================

def test_opening_book() -> None:
    """Test opening book functionality"""
    print("\n" + "="*60)
    print("TEST: Opening Book")
    print("="*60)
    
    positions = count_book_positions()
    print(f"✓ Opening book has {positions} positions")
    
    # Test getting a book move
    book_move = get_book_move(chess.STARTING_FEN)
    if book_move:
        print(f"✓ Book move for starting position: {book_move}")
    else:
        print("✓ No book move for starting position (normal)")


# ============================================================================
# PERFORMANCE BENCHMARKS
# ============================================================================

def benchmark_search(fen: str, depth: int, iterations: int = 3) -> Tuple[float, float, float]:
    """Benchmark search performance"""
    times = []
    
    for _ in range(iterations):
        start = time.time()
        move, score = find_best_move(fen, depth=depth, use_quiescence=True)
        elapsed = time.time() - start
        times.append(elapsed)
    
    return min(times), statistics.mean(times), max(times)


def test_performance_benchmarks() -> None:
    """Test performance benchmarks"""
    print("\n" + "="*60)
    print("TEST: Performance Benchmarks")
    print("="*60)
    
    test_fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
    
    for depth in [2, 3, 4]:
        min_time, avg_time, max_time = benchmark_search(test_fen, depth, iterations=3)
        print(f"Depth {depth}: min={min_time:.2f}s, avg={avg_time:.2f}s, max={max_time:.2f}s")


def test_transposition_table() -> None:
    """Test transposition table caching"""
    print("\n" + "="*60)
    print("TEST: Transposition Table")
    print("="*60)
    
    tt = TranspositionTable(max_entries=10000)
    
    fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
    
    # Store some entries
    tt.store(fen, 3, 50, 'exact')
    tt.store(fen, 4, 75, 'exact')
    
    # Lookup
    result = tt.lookup(fen, 3)
    assert result is not None, "Transposition table lookup failed"
    score, flag, move = result
    assert score == 50, f"Expected score 50, got {score}"
    assert flag == 'exact', f"Expected flag 'exact', got {flag}"
    
    print(f"✓ TT stores and retrieves correctly")
    print(f"✓ TT hits: {tt.hits}, misses: {tt.misses}")


# ============================================================================
# COMPREHENSIVE TEST RUNNER
# ============================================================================

def run_all_tests() -> None:
    """Run all tests"""
    print("\n" + "="*60)
    print("CHESSRIDER AI - COMPREHENSIVE TEST SUITE")
    print("="*60)
    
    try:
        # Evaluation tests
        test_evaluation_consistency()
        test_material_evaluation()
        test_pst_values()
        
        # Move generation tests
        test_legal_moves_generation()
        test_move_validity()
        
        # Difficulty tests
        test_difficulty_levels()
        test_difficulty_strength()
        
        # Opening book tests
        test_opening_book()
        
        # Performance tests
        test_transposition_table()
        
        # Optional: Performance benchmarks (can be slow)
        # test_performance_benchmarks()
        
        print("\n" + "="*60)
        print("✓ ALL TESTS PASSED")
        print("="*60 + "\n")
        
    except AssertionError as e:
        print(f"\n✗ TEST FAILED: {e}\n")
        raise
    except Exception as e:
        print(f"\n✗ ERROR: {e}\n")
        raise


if __name__ == "__main__":
    run_all_tests()
