# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build, Run, and Test Commands

```bash
# Install dependencies
npm install

# Start development server (http://localhost:5173)
npm run dev

# Build for production (outputs to dist/)
npm run build

# Preview production build locally
npm run preview

# Run unit tests (Node.js, no test framework — just console output)
npm test
# or equivalently:
node src/test.js

# Run the secondary logic smoke test
node src/test-game-logic.mjs
```

The dev server proxies `/ai` requests to `http://localhost:8000` by default (configurable via `VITE_DEV_AI_PROXY_TARGET`).

### Required Environment Variables

Create a `.env` file at the project root with your Firebase project credentials:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Optional:
```
VITE_AI_DIFFICULTY=medium   # easy | medium | hard | expert
VITE_BASE_PATH=/            # overrides the Vite base path
```

If Firebase env vars are missing, the app runs in **local practice mode** (no multiplayer, no Elo persistence). The `firebaseEnabled` flag in `src/utils/firebase.js` gates all Firebase operations throughout the codebase.

### Deployment

Configured for **Cloudflare Pages** (`wrangler.toml`): build command is `npx vite build`, output directory is `dist`, SPA routing enabled. Firestore rules live in `firestore.rules` and are deployed separately via the Firebase Console.

---

## Architecture Overview

This is a React + Vite single-page application. The entire game runs client-side; Firebase Firestore is the only backend.

### Key Source Files

```
src/
  KnightJumpChess.js       # Custom game engine — extends chess.js
  App.jsx                  # Root component (~2000 lines); all game state lives here
  main.jsx                 # React entry point
  workers/
    aiWorker.js            # Web Worker: Negamax AI engine
  components/
    ChessBoard.jsx         # Board UI (wraps react-chessboard)
    LearnPage.jsx          # Rules/tutorial page
    LeaderboardPanel.jsx   # Global leaderboard
    SocialTab.jsx          # Friends / challenges
    UserProfileModal.jsx   # User profile view
  contexts/
    AuthContext.jsx        # Firebase auth + Firestore profile subscription
  utils/
    firebase.js            # Firebase SDK init; exports db, auth, firebaseEnabled
    usernames.js           # Unique display name claim/collision logic
```

### Game Engine (`KnightJumpChess.js`)

`KnightJumpChess` **extends** the `Chess` class from `chess.js`. It overrides:

- `moves(options)` — returns both standard moves and variant "jump" moves. Jump moves carry a `flags` field containing `'j'` and a `jumpedOver` property identifying the piece that was leapt.
- `movesUnsafe(options)` — same but skips self-check filtering (used by the AI worker for speed).
- `move(move, options)` — dispatches to `_applyStandardMove` or `_applyJumpMove` depending on the move type.
- `put()`, `remove()`, `clear()` — call `_resetInternalState()` to resync internal chess.js hash state after manual board edits.
- `_pieceKey()` — ensures the return value is always a `BigInt` to avoid mixed-type arithmetic errors in chess.js internals.
- `isCheckRider()` / `isCheckmateRider()` / `isDraw()` — variant-aware check/checkmate/draw detection.

The **jump eligibility** rule: a piece may jump if `isNearKnight(square, color)` returns `true` — i.e., the square is adjacent to or a knight's-move away from any friendly knight on the board.

Jump move generation is split by piece type: `_getPawnJumpMoves`, `_getSlidingJumpMoves` (rook/bishop/queen), `_getKingJumpMoves`.

### AI Engine (`src/workers/aiWorker.js`)

Runs in a **Web Worker** spawned by `App.jsx` as `AiWorker` (Vite `?worker` import). Communication is message-based:

- **In**: `{ type: 'search', fen, difficulty, id }`
- **Out**: `{ type: 'result', from, to, promotion, san, score, depth, nodes, timeMs, id }` or `{ type: 'error', message, id }`

The AI uses `KnightJumpChess` directly (same engine as the game). Algorithm features: Negamax with Alpha-Beta pruning, transposition table (depth-preferred, up to 500k entries), quiescence search with delta pruning, Late Move Reduction (LMR), killer move heuristic, piece-square tables, and a Knight-Aura-aware evaluation bonus. Expert difficulty searches depth 8–10.

### App State and Game Modes

`App.jsx` manages three game modes, determined by state:

| Mode | Condition |
|------|-----------|
| Practice (local 2P) | `!isOnline && !aiEnabled` |
| vs AI | `!isOnline && aiEnabled` |
| Online multiplayer | `isOnline` (gameId is set) |

`isOnline` is derived as `Boolean(gameId)`. The `gameId` is persisted to `localStorage` (`cr_gameId`) so that page refreshes reconnect to an active game.

### Firebase / Firestore Data Model

**Collection: `games`** — one document per match:
- `whiteId`, `blackId` — Firebase UIDs; bots use `bot_*` prefixed UIDs
- `whiteName`, `blackName`, `whiteRating`, `blackRating` — denormalized at game creation
- `fen` — current board position (updated on every move)
- `status` — `'waiting'` | `'active'` | `'complete'`
- `timeControl`, `whiteTimeLeft`, `blackTimeLeft`, `lastMoveAt` — clock data
- `result`, `winner`, `whiteRatingAfter`, `blackRatingAfter` — set on game end

**Collection: `users`** — one document per UID:
- `uid`, `displayName`, `email`, `photoURL`, `isAnonymous`, `rating`, `updatedAt`
- Initial rating is 1200.

**Collection: `usernames`** — uniqueness index; keys are lowercased display names.

**Collection: `game_challenges`** — pending friend challenges: `fromUid`, `toUid`, `gameId`, `status`.

### Elo Rating

`calculateElo(playerRating, opponentRating, score, kFactor = 32)` in `App.jsx` uses the standard expected-score formula with K=32. Ratings are written to both the `games` document and the `users` document at game end via `runTransaction`.

### Matchmaking

- **Random**: Player creates a `games` doc with `status: 'waiting'`; another player's client queries for waiting games filtered by rating proximity and joins.
- **Friend challenge**: Creates a `game_challenges` doc; the target player's client listens and can accept.
- **Bot auto-fill**: After 1 minute of waiting, a bot from `BOT_POOL` (20 named bots) is added as the opponent. The bot's moves are requested from the AI worker and submitted to Firestore by the white player's client.

### Auth

`AuthContext.jsx` wraps Firebase Auth. It supports Google sign-in (`signInWithPopup`) and anonymous sign-in (`signInAnonymously`). On first sign-in, a `users` doc is created with rating 1200. Display names are deduplicated via the `usernames` collection using `ensureUniqueDisplayName`.

### Key Patterns

- **Jump move flag**: Jump moves are identified by `move.flags.includes('j')` and carry a `move.jumpedOver` square string.
- **Variant checkmate vs standard**: Always use `game.isCheckmateRider()` / `game.isCheckRider()` instead of `chess.js`'s built-in `isCheckmate()` / `isCheck()` — the variant check logic differs.
- **Firebase graceful degradation**: Every Firebase call is guarded by `firebaseEnabled`. The UI renders a "Local mode" badge when Firebase is unavailable.
- **Clock synchronization**: Online clocks are computed client-side from `lastMoveAt` (server timestamp) + stored `whiteTimeLeft`/`blackTimeLeft`. The server does not push clock updates on a tick — each client interpolates.
- **Vite base path**: The root `vite.config.js` auto-detects GitHub Actions deployments and sets the base path to `/<repo-name>/`. Override with `VITE_BASE_PATH`.
- **Chess piece assets**: Custom piece sets are stored under `src/assets/chess/` (directories `blue` and `cburnett`).
