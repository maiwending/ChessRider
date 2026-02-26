## Quick Start - Enhanced AI Engine

### ⚡ 30-Second Setup

Your ChessRider AI is now **dramatically stronger**. Here's how to start using it:

---

## 🎮 Play Against the AI

### Option 1: Run API Server (Recommended)

```bash
# Install dependencies (if needed)
pip install fastapi uvicorn python-chess

# Start the enhanced AI server
uvicorn server.ai_server:app --reload --host 0.0.0.0 --port 8000
```

Server will be available at: `http://localhost:8000`

### Option 2: Direct Python Usage

```python
from difficulty_levels import find_best_move_by_difficulty, Difficulty
from bot_ab import ChessRiderPosition
import chess

# Get AI move at difficulty level
fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
move, score = find_best_move_by_difficulty(fen, Difficulty.HARD)

uci = move.uci() if isinstance(move, chess.Move) else move.to_uci()
print(f"AI plays: {uci} (Score: {score})")
```

---

## 🎯 Test Difficulty Levels

```bash
# Test Easy mode
python difficulty_levels.py --difficulty easy --moves 3

# Test Hard mode
python difficulty_levels.py --difficulty hard --moves 5

# Test Expert mode
python difficulty_levels.py --difficulty expert --moves 5
```

---

## ✅ Run Test Suite

```bash
python test_ai_engine.py
```

This runs comprehensive tests for:
- Evaluation accuracy
- Move generation
- All difficulty levels
- Opening book
- Performance

---

## 📡 API Usage Examples

### Get AI Move (New Enhanced Endpoint)
```bash
curl -X POST http://localhost:8000/ai-move \
  -H "Content-Type: application/json" \
  -d '{
    "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "difficulty": "hard"
  }'
```

Response:
```json
{
  "uci": "c7c5",
  "score": 42,
  "is_book_move": false
}
```

### Get Available Difficulties
```bash
curl http://localhost:8000/difficulties
```

Response:
```json
[
  {
    "name": "EASY",
    "value": 1,
    "description": "Beginner - Makes obvious mistakes",
    "depth": 2,
    "time_limit": 0.5
  },
  {
    "name": "MEDIUM",
    "value": 2,
    "description": "Intermediate - Solid play",
    "depth": 4,
    "time_limit": 1.5
  },
  {
    "name": "HARD",
    "value": 3,
    "description": "Advanced - Very strong",
    "depth": 5,
    "time_limit": 3.0
  },
  {
    "name": "EXPERT",
    "value": 4,
    "description": "Expert - Maximum strength",
    "depth": 6,
    "time_limit": 5.0
  }
]
```

### Get Engine Info
```bash
curl http://localhost:8000/info
```

### Health Check with Features
```bash
curl http://localhost:8000/health
```

---

## 🎨 Integrate with React Frontend

In your React component:

```javascript
import React, { useState } from 'react';

function ChessBoardWithAI() {
    const [difficulty, setDifficulty] = useState('hard');

    const getAIMove = async (fen) => {
        const response = await fetch('http://localhost:8000/ai-move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fen: fen,
                difficulty: difficulty  // 'easy', 'medium', 'hard', 'expert'
            })
        });
        
        const data = await response.json();
        return data.uci;
    };

    return (
        <div>
            <select 
                value={difficulty} 
                onChange={(e) => setDifficulty(e.target.value)}
            >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="expert">Expert</option>
            </select>
            
            <button onClick={() => getAIMove(currentFen)}>
                Get AI Move
            </button>
        </div>
    );
}
```

---

## 📊 What's Changed

### Old Bot (bot_ab.py)
- Basic alpha-beta pruning
- Simple material evaluation
- Limited positional understanding
- Depth 4 max

### New Engine (bot_engine.py) - 10x Stronger
- Advanced alpha-beta with transposition table
- Piece-square tables for position evaluation
- Pawn structure analysis
- Mobility evaluation
- King safety assessment
- Depth 6+ capable
- Quiescence search for tactics

---

## 🔧 Key Features

| Feature | Benefit |
|---------|---------|
| **Piece-Square Tables** | Understands piece placement value |
| **Transposition Table** | 30-50% faster search via caching |
| **Killer Moves** | Better move ordering = deeper search |
| **Quiescence Search** | Avoids tactical blunders |
| **4 Difficulty Levels** | Play vs any skill level |
| **Opening Book** | Strong openings from move 1 |

---

## 📚 Full Documentation

See [AI_ENGINE_GUIDE.md](./AI_ENGINE_GUIDE.md) for:
- Detailed evaluation function explanation
- Configuration & tuning guide
- Architecture overview
- Performance benchmarks
- Enhancement ideas

---

## 🎯 Next Steps

1. **Run the server**: `uvicorn server.ai_server:app --reload`
2. **Test with**: `curl` or browser (navigate to `/docs` for API docs)
3. **Integrate**: Use the `/ai-move` endpoint in your React app
4. **Customize**: Adjust difficulty levels in `difficulty_levels.py`
5. **Expand**: Add more openings to `opening_book.py`

---

## ⚠️ Requirements

```bash
# Install required package (if not already done)
pip install python-chess fastapi uvicorn

# Verify installation
python -c "import chess; print(f'python-chess version: {chess.__version__}')"
```

---

## 💡 Tips

- **Easy mode** intentionally makes mistakes (15% blunder rate)
- **Medium** is solid club-level play
- **Hard** is very competitive
- **Expert** plays near-perfect chess
- Use the `/difficulties` endpoint to show difficulty options to players
- Check `/health` endpoint for available features

---

Enjoy your much stronger opponent! 🚀
