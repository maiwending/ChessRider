import os
import sys
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from bot_ab import find_best_move, ChessRiderPosition


class AiRequest(BaseModel):
    fen: str
    depth: int = 4
    time: Optional[float] = 2.0


class AiResponse(BaseModel):
    uci: str
    score: int


app = FastAPI(title="ChessRider AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/ai-move", response_model=AiResponse)
def ai_move(req: AiRequest) -> AiResponse:
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

    depth = max(1, min(req.depth, 6))
    move, score = find_best_move(pos.board.fen(), depth=depth, time_limit=req.time)
    if move is None:
        move = legal_moves[0]
        score = 0

    uci = move.uci() if hasattr(move, "uci") else move.to_uci()
    return AiResponse(uci=uci, score=score)


@app.get("/health")
def health() -> dict:
    return {"ok": True}
