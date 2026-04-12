import test, { before, beforeEach, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'knightaura-rules-test';
const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

let testEnv;

async function seedGame(overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'games', 'game-1'), {
      whiteId: 'white-player',
      blackId: 'black-player',
      status: 'active',
      fen: 'start-fen',
      moveSeq: 0,
      createdAt: new Date().toISOString(),
      ...overrides,
    });
  });
}

async function seedDm(overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'dms', 'dm-1'), {
      participants: ['white-player', 'black-player'],
      updatedAt: new Date().toISOString(),
      ...overrides,
    });
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedGame();
  await seedDm();
});

after(async () => {
  await testEnv.cleanup();
});

test('game participants can update the active game document', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertSucceeds(
    updateDoc(doc(whiteDb, 'games', 'game-1'), {
      lastMove: 'e2e4',
      updatedAt: new Date().toISOString(),
    })
  );
});

test('non-participants cannot update the game document', async () => {
  const outsiderDb = testEnv.authenticatedContext('outsider').firestore();

  await assertFails(
    updateDoc(doc(outsiderDb, 'games', 'game-1'), {
      lastMove: 'e2e4',
    })
  );
});

test('participants can write voice signaling documents', async () => {
  const blackDb = testEnv.authenticatedContext('black-player').firestore();

  await assertSucceeds(
    setDoc(doc(blackDb, 'games', 'game-1', 'voice', 'current'), {
      sessionId: 'session-1',
      callerUid: 'white-player',
      status: 'calling',
    })
  );
});

test('non-participants cannot write voice signaling documents', async () => {
  const outsiderDb = testEnv.authenticatedContext('outsider').firestore();

  await assertFails(
    setDoc(doc(outsiderDb, 'games', 'game-1', 'voice', 'current'), {
      sessionId: 'session-1',
      callerUid: 'white-player',
      status: 'calling',
    })
  );
});

test('participants can write ICE candidates inside voice sessions', async () => {
  await seedGame();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'games', 'game-1', 'voiceSessions', 'session-1'), {
      callerUid: 'white-player',
      createdAt: new Date().toISOString(),
    });
  });

  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertSucceeds(
    setDoc(
      doc(whiteDb, 'games', 'game-1', 'voiceSessions', 'session-1', 'callerCandidates', 'candidate-1'),
      {
        candidate: 'candidate',
        sdpMid: '0',
        sdpMLineIndex: 0,
      }
    )
  );
});

test('dm participants can read the dm root document', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertSucceeds(getDoc(doc(whiteDb, 'dms', 'dm-1')));
});

test('non-participants cannot read the dm root document', async () => {
  const outsiderDb = testEnv.authenticatedContext('outsider').firestore();

  await assertFails(getDoc(doc(outsiderDb, 'dms', 'dm-1')));
});

test('dm participants can update dm metadata without changing participants', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertSucceeds(
    setDoc(doc(whiteDb, 'dms', 'dm-1'), {
      participants: ['white-player', 'black-player'],
      updatedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    }, { merge: true })
  );
});

test('dm participants cannot rewrite the participants list', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertFails(
    setDoc(doc(whiteDb, 'dms', 'dm-1'), {
      participants: ['white-player', 'outsider'],
    }, { merge: true })
  );
});

test('dm participants can create dm messages', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertSucceeds(
    setDoc(doc(whiteDb, 'dms', 'dm-1', 'messages', 'msg-1'), {
      text: 'hello',
      senderId: 'white-player',
      senderName: 'White',
      createdAt: new Date().toISOString(),
    })
  );
});

test('non-participants cannot create dm messages', async () => {
  const outsiderDb = testEnv.authenticatedContext('outsider').firestore();

  await assertFails(
    setDoc(doc(outsiderDb, 'dms', 'dm-1', 'messages', 'msg-1'), {
      text: 'hello',
      senderId: 'outsider',
      senderName: 'Outsider',
      createdAt: new Date().toISOString(),
    })
  );
});

test('unauthenticated users cannot update games', async () => {
  const anonymousDb = testEnv.unauthenticatedContext().firestore();

  await assertFails(
    updateDoc(doc(anonymousDb, 'games', 'game-1'), { lastMove: 'e2e4' })
  );
});

test('participants cannot change fen without incrementing moveSeq', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertFails(
    updateDoc(doc(whiteDb, 'games', 'game-1'), {
      fen: 'next-fen',
      lastMove: {
        from: 'e2',
        to: 'e4',
        san: 'e4',
      },
      updatedAt: new Date().toISOString(),
    })
  );
});

test('participants can change fen when moveSeq increments and lastMove.seq matches', async () => {
  const whiteDb = testEnv.authenticatedContext('white-player').firestore();

  await assertSucceeds(
    updateDoc(doc(whiteDb, 'games', 'game-1'), {
      fen: 'next-fen',
      moveSeq: 1,
      lastMove: {
        from: 'e2',
        to: 'e4',
        san: 'e4',
        seq: 1,
      },
      updatedAt: new Date().toISOString(),
    })
  );
});
