# KnightAuraChess

A full-stack, real-time multiplayer chess variant where pieces near knights gain the ability to jump over blocking pieces. 

KNightAuraChess features a completely custom game engine that natively supports advanced jump logic, a resilient offline Artificial Intelligence opponent, and a fully integrated Firebase Cloud backend for anonymous & registered online matchmaking with a complete Elo Rating system.

## 🌟 Key Features

*   **Custom Game Engine:** Built on top of `chess.js`, the custom `KnightJumpChess` engine validates completely new move modalities, enforces check/checkmate variant rules, and prevents pseudo-legal jump checks.
*   **Real-Time Multiplayer:** Instant matchmaking and live board synchronization powered by Firebase Firestore. Play with friends via Game ID or match globally.
*   **Elo Rating System:** Earn and lose points based on game outcomes (Checkmate, Draw, King Capture, and Resignation penalties). The UI live-updates your rating immediately when the match concludes.
*   **Web Worker AI Engine:** A powerful Minimax chess AI with Alpha-Beta pruning runs in an isolated background thread. Play perfectly smoothly against the AI offline without ever freezing the UI.
*   **Google Auth & Guest Profiles:** Sign in with Google to save your Elo rating permanently, or play instantly as a Guest with a temporary generated profile.
*   **Cloudflare Pages Optimization:** Lightning-fast PWA deployment structure.

## 🎮 Variant Rules

### Core Mechanic: Knight Proximity Jumping

**Jump Ability Trigger:**
*   A piece can jump if it is **adjacent to** OR **within a knight's move** of a **friendly knight** (same color).
*   Adjacent means horizontally, vertically, or diagonally next to a knight.
*   Knight's move means the standard L-shape (2 squares in one direction, 1 in perpendicular).
*   **Important**: Only friendly knights enable jumping—enemy knights do not grant the aura.

**Jump Rules:**
1.  **Standard Pieces (Rook, Bishop, Queen)**:
    *   Move along their normal paths.
    *   Can jump over **ONE blocking piece** along that path.
    *   After jumping, they continue sliding normally and can land on any empty square beyond the jumped piece.
    *   Can capture an enemy piece after the jump (stops there).
    *   Stops when hitting a friendly piece after the jump.
2.  **Pawns**:
    *   Can jump **one square forward** when blocked (landing two squares ahead).
    *   Can jump **diagonally** when an enemy piece blocks a diagonal capture.
3.  **Kings**:
    *   Can jump **one square in any direction** when blocked (landing two squares away).
4.  **Knights**:
    *   Move normally (they *generate* the aura for others, but do not get jump powers themselves).

**Variant Checkmate:** Checkmate strictly occurs when a King is under attack and has no legal standard *or* jump moves available to escape.

## 📦 Installation & Local Development

### Prerequisites
*   Node.js v18+ 
*   A Firebase Project (Firestore + Authentication)

### Setup

```bash
# Clone the repository
git clone https://github.com/maiwending/ChessRider.git
cd ChessRider

# Install dependencies
npm install

# Create a local environment file
touch .env
```

Add your Firebase configuration to `.env`:
```env
VITE_FIREBASE_API_KEY="your_api_key_here"
VITE_FIREBASE_AUTH_DOMAIN="your_project_id.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your_project_id"
VITE_FIREBASE_STORAGE_BUCKET="your_project_id.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="your_sender_id"
VITE_FIREBASE_APP_ID="your_app_id"
```

### Running the App
```bash
npm run dev
```
Open `http://localhost:5174` in your browser.

## 🔐 Firebase Security Rules

To ensure proper multiplayer security and Elo ranking point allocations, you must paste the following into your **Firebase Console -> Firestore Database -> Rules** tab:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }

    match /users/{uid} {
      allow read: if isSignedIn();
      allow write: if isSignedIn();
    }

    match /games/{gameId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn() && request.resource.data.whiteId == request.auth.uid;
      allow update, delete: if isSignedIn();
    }
  }
}
```

## 🚀 Deployment (Cloudflare Pages)

This project is configured for seamless deployment via Cloudflare Pages:

1. Connect your Github repository to Cloudflare Pages.
2. **Build command:** `npx vite build`
3. **Build directory:** `dist`
4. **Environment Variables:** Add all the `VITE_FIREBASE_*` variables from your `.env` file into the Cloudflare Pages settings.

Cloudflare will automatically build and deploy your app every time you push to the `main` branch!
