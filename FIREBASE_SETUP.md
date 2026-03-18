# Firebase Setup for ChessRider

This project stores each player profile in Firestore as:

- Collection: `users`
- Document ID: Firebase Auth `uid`
- Rating field: `rating` (Elo)

Game room documents are stored in:

- Collection: `games`

## 1. Create Firebase Project

1. Go to Firebase Console.
2. Create a new project.
3. Add a Web App.

## 2. Enable Authentication

In **Authentication -> Sign-in method**:

1. Enable **Google**.
2. Enable **Anonymous**.

## 3. Enable Firestore Database

1. Open **Firestore Database**.
2. Create database (start in test mode while developing).
3. Choose your region.

## 4. Configure Environment Variables

1. Copy `.env.example` to `.env.local`.
2. Fill in your Firebase Web config keys.
3. Restart Vite dev server.

## 4.1 Apply Firestore Rules/Indexes (CLI)

This repo includes:

- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`

Run:

```bash
firebase login
firebase use --add
firebase deploy --only firestore
```

## 5. Verify Player Profile + Rating Persistence

1. Sign in (Google or Anonymous).
2. Open Firestore and check `users/{uid}` exists.
3. Confirm fields like `uid`, `displayName`, `rating`, `updatedAt`.
4. Play an online game to completion.
5. Confirm `users/{uid}.rating` updates and does not reset on next login.

## Recommended Firestore Rules (development-friendly)

Use this as a starting point. It keeps user documents tied to UID for normal profile updates while allowing authenticated game writes.

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }

    function isOwner(uid) {
      return isSignedIn() && request.auth.uid == uid;
    }

    match /users/{uid} {
      allow read: if isSignedIn();
      allow create: if isOwner(uid);
      // Profile owner can always update their own profile.
      // Temporary: allow authenticated users to patch rating fields so
      // client-side Elo updates can write both players at game end.
      allow update: if isOwner(uid) || (
        isSignedIn() &&
        request.resource.data.diff(resource.data).changedKeys().hasOnly([
          'rating',
          'updatedAt',
          'displayName',
          'uid'
        ])
      );
      allow delete: if false;
    }

    match /games/{gameId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn() && request.resource.data.whiteId == request.auth.uid;
      allow update, delete: if isSignedIn();
    }
  }
}
```

Note:
- Strict anti-cheat rating updates require trusted server-side logic (Cloud Functions / backend).
- Current app calculates Elo client-side at match end and persists it to user docs.
- When you move rating writes server-side, tighten `/users/{uid}` update to owner-only.
