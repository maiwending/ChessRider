#!/usr/bin/env python
"""
ChessRider AI - Quick Verification Script

Run this to verify the enhanced AI engine is working correctly.
Usage: python verify_ai.py
"""

import sys
import time
import traceback
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

def print_header(text):
    """Print formatted header"""
    print("\n" + "="*60)
    print(f"  {text}")
    print("="*60)

def print_check(text, status=True):
    """Print check mark or X"""
    symbol = "✓" if status else "✗"
    print(f"{symbol} {text}")

def print_info(text):
    """Print info message"""
    print(f"  → {text}")

def verify_imports():
    """Verify all modules can be imported"""
    print_header("Verifying Module Imports")
    
    checks = {
        "python-chess": lambda: __import__('chess'),
        "bot_engine": lambda: __import__('bot_engine'),
        "difficulty_levels": lambda: __import__('difficulty_levels'),
        "opening_book": lambda: __import__('opening_book'),
    }
    
    all_pass = True
    for name, import_func in checks.items():
        try:
            import_func()
            print_check(f"Import {name}")
        except ImportError as e:
            print_check(f"Import {name}", False)
            print_info(f"Error: {e}")
            all_pass = False
    
    return all_pass

def verify_piece_square_tables():
    """Verify PST tables are loaded"""
    print_header("Verifying Piece-Square Tables")
    
    try:
        from bot_engine import PST_TABLES
        import chess
        
        if len(PST_TABLES) != 6:
            print_check("PST tables count", False)
            return False
        
        for piece_type in [chess.PAWN, chess.KNIGHT, chess.BISHOP, 
                          chess.ROOK, chess.QUEEN, chess.KING]:
            if piece_type not in PST_TABLES:
                print_check(f"PST for {chess.piece_name(piece_type)}", False)
                return False
            
            pst = PST_TABLES[piece_type]
            if len(pst) != 64:
                print_check(f"PST {piece_type} has 64 squares", False)
                return False
            
            print_check(f"PST {chess.piece_name(piece_type):8} - {len(pst)} squares")
        
        return True
    except Exception as e:
        print_check("PST tables", False)
        print_info(f"Error: {e}")
        traceback.print_exc()
        return False

def verify_evaluation():
    """Verify evaluation function works"""
    print_header("Verifying Evaluation Function")
    
    try:
        from bot_engine import evaluate, ChessRiderPosition
        import chess
        
        pos = ChessRiderPosition(chess.STARTING_FEN)
        score = evaluate(pos)
        
        print_check(f"Evaluate starting position")
        print_info(f"Score: {score}")
        
        # Check consistency
        score2 = evaluate(pos)
        if score != score2:
            print_check("Evaluation consistency", False)
            return False
        
        print_check("Evaluation consistency")
        return True
    except Exception as e:
        print_check("Evaluation function", False)
        print_info(f"Error: {e}")
        traceback.print_exc()
        return False

def verify_search():
    """Verify search algorithm works"""
    print_header("Verifying Search Algorithm")
    
    try:
        from bot_engine import find_best_move
        import chess
        
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
        
        print_info("Searching depth 3 (may take 5-10 seconds)...")
        start = time.time()
        move, score = find_best_move(fen, depth=3, time_limit=10.0)
        elapsed = time.time() - start
        
        if move is None:
            print_check("Search returns move", False)
            return False
        
        uci = move.uci() if isinstance(move, chess.Move) else move.to_uci()
        print_check("Search returns move")
        print_info(f"Best move: {uci}")
        print_info(f"Score: {score}")
        print_info(f"Time: {elapsed:.2f}s")
        
        return True
    except Exception as e:
        print_check("Search algorithm", False)
        print_info(f"Error: {e}")
        traceback.print_exc()
        return False

def verify_transposition_table():
    """Verify transposition table works"""
    print_header("Verifying Transposition Table")
    
    try:
        from bot_engine import TranspositionTable
        
        tt = TranspositionTable(max_entries=1000)
        
        # Store entry
        tt.store("test_fen", 3, 50, 'exact', None)
        
        # Lookup entry
        result = tt.lookup("test_fen", 3)
        if result is None:
            print_check("TT store and retrieve", False)
            return False
        
        score, flag, move = result
        if score != 50 or flag != 'exact':
            print_check("TT data integrity", False)
            return False
        
        print_check("TT store and retrieve")
        print_info(f"Hit rate: {tt.hits}, Miss rate: {tt.misses}")
        
        return True
    except Exception as e:
        print_check("Transposition table", False)
        print_info(f"Error: {e}")
        traceback.print_exc()
        return False

def verify_difficulty_levels():
    """Verify difficulty levels work"""
    print_header("Verifying Difficulty Levels")
    
    try:
        from difficulty_levels import (
            find_best_move_by_difficulty, 
            Difficulty,
            get_difficulty_info,
            all_difficulties
        )
        
        # Check all difficulties
        all_diffs = all_difficulties()
        if len(all_diffs) != 4:
            print_check("4 difficulty levels", False)
            return False
        
        for diff_dict in all_diffs:
            print_check(f"Difficulty: {diff_dict['name']}")
        
        # Test getting a move at Easy difficulty
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
        print_info("\nSearching at Easy difficulty...")
        move, score = find_best_move_by_difficulty(fen, Difficulty.EASY)
        
        if move is None:
            print_check("Difficulty.EASY returns move", False)
            return False
        
        print_check("Difficulty.EASY returns move")
        
        return True
    except Exception as e:
        print_check("Difficulty levels", False)
        print_info(f"Error: {e}")
        traceback.print_exc()
        return False

def verify_opening_book():
    """Verify opening book works"""
    print_header("Verifying Opening Book")
    
    try:
        from opening_book import get_book_move, count_book_positions
        import chess
        
        positions = count_book_positions()
        print_check(f"Opening book loaded")
        print_info(f"Positions in book: {positions}")
        
        # Try to get a book move
        move = get_book_move(chess.STARTING_FEN)
        if move:
            print_check(f"Book move for startpos: {move}")
        else:
            print_info("No book move for startpos (optional)")
        
        return True
    except Exception as e:
        print_check("Opening book", False)
        print_info(f"Error: {e}")
        traceback.print_exc()
        return False

def verify_api_server():
    """Verify FastAPI server can be imported"""
    print_header("Verifying API Server")
    
    try:
        from server.ai_server import app
        import fastapi
        import uvicorn
        
        print_check("FastAPI imported")
        print_check("Uvicorn imported")
        print_check("API server app created")
        
        # Check endpoints exist
        endpoints = [route.path for route in app.routes]
        expected = ["/ai-move", "/difficulties", "/health"]
        
        for endpoint in expected:
            if endpoint in endpoints:
                print_check(f"Endpoint: {endpoint}")
            else:
                print_check(f"Endpoint: {endpoint}", False)
                return False
        
        return True
    except ImportError as e:
        print_check("FastAPI", False)
        print_info(f"Install with: pip install fastapi uvicorn")
        return False
    except Exception as e:
        print_check("API server", False)
        print_info(f"Error: {e}")
        traceback.print_exc()
        return False

def main():
    """Run all verifications"""
    print("\n")
    print("╔" + "═"*58 + "╗")
    print("║" + " "*10 + "ChessRider AI - Verification Script" + " "*13 + "║")
    print("╚" + "═"*58 + "╝")
    
    results = []
    
    # Run all verifications
    results.append(("Module Imports", verify_imports()))
    results.append(("PST Tables", verify_piece_square_tables()))
    results.append(("Evaluation", verify_evaluation()))
    results.append(("Search Algorithm", verify_search()))
    results.append(("Transposition Table", verify_transposition_table()))
    results.append(("Difficulty Levels", verify_difficulty_levels()))
    results.append(("Opening Book", verify_opening_book()))
    results.append(("API Server", verify_api_server()))
    
    # Summary
    print_header("Summary")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        print_check(name, result)
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n" + "🎉 "*20)
        print("  ALL SYSTEMS GO!")
        print("  Your AI engine is ready to use!")
        print(f"  {' '*12}")
        print("  Next steps:")
        print("  1. Run: uvicorn server.ai_server:app --reload")
        print("  2. Visit: http://localhost:8000/docs (for API)")
        print("  3. See: QUICK_START_AI.md for usage examples")
        print("🎉 "*20)
        return 0
    else:
        print(f"\n⚠️  Some tests failed. Check errors above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
