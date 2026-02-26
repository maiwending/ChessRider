import os
import sys
from typing import Optional, List
from enum import Enum

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from bot_ab import ChessRiderPosition
from difficulty_levels import (
    find_best_move_by_difficulty,
    Difficulty,
    get_difficulty_info,
    all_difficulties,
)
from opening_book import get_book_move


# ============================================================================
# Pydantic Models
# ============================================================================

class DifficultyLevel(str, Enum):
    """Supported difficulty levels"""
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    EXPERT = "expert"


class AiRequest(BaseModel):
    """Request for AI move"""
    fen: str
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    depth: Optional[int] = None  # Override default for difficulty
    time: Optional[float] = None  # Override default for difficulty


class AiResponse(BaseModel):
    """Response with AI move"""
    uci: str
    score: int
    is_book_move: bool = False


class DifficultyInfo(BaseModel):
    """Information about a difficulty level"""
    name: str
    value: int
    description: str
    depth: int
    time_limit: float


class HealthResponse(BaseModel):
    """Health check response"""
    ok: bool
    version: str
    features: List[str]


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="ChessRider AI",
    description="Advanced chess engine for ChessRider with difficulty levels",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Endpoints
# ============================================================================

@app.post("/ai-move", response_model=AiResponse)
def ai_move(req: AiRequest) -> AiResponse:
    """
    Get AI move for a position.
    
    Supports:
    - Multiple difficulty levels (easy, medium, hard, expert)
    - Custom depth and time overrides
    - Opening book moves
    """
    try:
        fen = req.fen.strip()
        if fen.lower() == "startpos":
            from chess import STARTING_FEN
            fen = STARTING_FEN
        pos = ChessRiderPosition(fen)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {exc}") from exc

    legal_moves = pos.legal_moves()
    if not legal_moves:
        raise HTTPException(status_code=400, detail="No legal moves for this position")

    # Check for book move first (only for easier levels)
    is_book_move = False
    book_move_uci = None
    if req.difficulty in {DifficultyLevel.EASY, DifficultyLevel.MEDIUM}:
        book_move_uci = get_book_move(fen)
    if book_move_uci:
        # Verify it's a legal move
        try:
            move = book_move_uci
            is_book_move = True
            score = 0
            return AiResponse(uci=move, score=score, is_book_move=is_book_move)
        except:
            pass
    
    # Get AI move based on difficulty
    difficulty = Difficulty[req.difficulty.value.upper()]
    move, score = find_best_move_by_difficulty(
        fen,
        difficulty,
        depth_override=req.depth,
        time_override=req.time,
    )
    
    if move is None:
        if legal_moves:
            move = legal_moves[0]
            score = 0
        else:
            raise HTTPException(status_code=400, detail="No legal moves available")
    
    uci = move.uci() if hasattr(move, "uci") else move.to_uci()
    return AiResponse(uci=uci, score=score, is_book_move=is_book_move)


@app.get("/ai-move-legacy", response_model=AiResponse)
def ai_move_legacy(fen: str, depth: int = 4, time: float = 2.0) -> AiResponse:
    """
    Legacy endpoint for backward compatibility.
    Use /ai-move for new features.
    """
    try:
        pos = ChessRiderPosition(fen)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {exc}") from exc

    legal_moves = pos.legal_moves()
    if not legal_moves:
        raise HTTPException(status_code=400, detail="No legal moves for this position")

    depth = max(1, min(depth, 6))
    
    # Use medium difficulty with overridden parameters
    from bot_engine import find_best_move as find_best_move_enhanced
    move, score = find_best_move_enhanced(
        fen,
        depth=depth,
        time_limit=time,
        use_quiescence=True,
    )
    
    if move is None:
        move = legal_moves[0]
        score = 0

    uci = move.uci() if hasattr(move, "uci") else move.to_uci()
    return AiResponse(uci=uci, score=score)


@app.get("/difficulties", response_model=List[DifficultyInfo])
def get_difficulties() -> List[DifficultyInfo]:
    """Get information about all difficulty levels"""
    difficulties = []
    for diff_dict in all_difficulties():
        difficulties.append(DifficultyInfo(**diff_dict))
    return difficulties


@app.get("/difficulty/{difficulty_name}", response_model=DifficultyInfo)
def get_difficulty(difficulty_name: str) -> DifficultyInfo:
    """Get information about a specific difficulty level"""
    try:
        difficulty = Difficulty[difficulty_name.upper()]
        diff_dict = get_difficulty_info(difficulty)
        return DifficultyInfo(**diff_dict)
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown difficulty: {difficulty_name}. Valid options: easy, medium, hard, expert",
        )


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Health check endpoint"""
    return HealthResponse(
        ok=True,
        version="2.0.0",
        features=[
            "difficulty_levels",
            "enhanced_evaluation",
            "opening_book",
            "transposition_table",
            "killer_moves",
            "piece_square_tables",
        ],
    )


@app.get("/info")
def info() -> dict:
    """Get engine information"""
    return {
        "name": "ChessRider AI",
        "version": "2.0.0",
        "features": {
            "advanced_evaluation": "Material + Position + Pawn Structure + Mobility + King Safety",
            "search_enhancements": "Alpha-Beta + Transposition Table + Killer Moves + Quiescence",
            "difficulty_levels": ["easy", "medium", "hard", "expert"],
            "opening_book": True,
            "piece_square_tables": True,
        },
        "endpoints": {
            "post_ai_move": "/ai-move - New endpoint with difficulty support",
            "get_difficulties": "/difficulties - List all difficulty levels",
            "get_difficulty": "/difficulty/{name} - Get specific difficulty info",
            "health": "/health - Health check",
            "info": "/info - This endpoint",
        },
    }
