import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AiWorker from './workers/aiWorker.js?worker';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import KnightJumpChess from './KnightJumpChess.js';
import ChessBoard from './components/ChessBoard.jsx';
import LearnPage from './components/LearnPage.jsx';
import LeaderboardPanel from './components/LeaderboardPanel.jsx';
import UserProfileModal from './components/UserProfileModal.jsx';
import SocialTab from './components/SocialTab.jsx';
import ThemeCreator, { themeToVars } from './components/ThemeCreator.jsx';
import GameChat from './components/GameChat.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import { db, firebaseEnabled } from './utils/firebase.js';
import './App.css';

const GAMES_COLLECTION = 'games';
const RULE_ID = 'chessrider';
const AI_DIFFICULTY_LEVELS = ['easy', 'medium', 'hard', 'expert'];

const BOT_POOL = [
  { uid: 'bot_alex_kim',      name: 'Alex Kim' },
  { uid: 'bot_jordan_park',   name: 'Jordan Park' },
  { uid: 'bot_morgan_chen',   name: 'Morgan Chen' },
  { uid: 'bot_casey_lee',     name: 'Casey Lee' },
  { uid: 'bot_riley_wang',    name: 'Riley Wang' },
  { uid: 'bot_taylor_singh',  name: 'Taylor Singh' },
  { uid: 'bot_avery_patel',   name: 'Avery Patel' },
  { uid: 'bot_quinn_rivera',  name: 'Quinn Rivera' },
  { uid: 'bot_sage_brooks',   name: 'Sage Brooks' },
  { uid: 'bot_drew_hayes',    name: 'Drew Hayes' },
  { uid: 'bot_blake_ross',    name: 'Blake Ross' },
  { uid: 'bot_reese_cole',    name: 'Reese Cole' },
  { uid: 'bot_skyler_grant',  name: 'Skyler Grant' },
  { uid: 'bot_cameron_webb',  name: 'Cameron Webb' },
  { uid: 'bot_dakota_bell',   name: 'Dakota Bell' },
  { uid: 'bot_hayden_shaw',   name: 'Hayden Shaw' },
  { uid: 'bot_parker_wells',  name: 'Parker Wells' },
  { uid: 'bot_emery_hunt',    name: 'Emery Hunt' },
  { uid: 'bot_finley_cruz',   name: 'Finley Cruz' },
  { uid: 'bot_rowan_reyes',   name: 'Rowan Reyes' },
];

const TIME_CONTROLS = [
  { label: '1 min',  seconds: 60 },
  { label: '3 min',  seconds: 180 },
  { label: '5 min',  seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
];
const DEFAULT_TIME_CONTROL = 300;

const createNewGame = () => new KnightJumpChess();

const formatTurn = (turn) => (turn === 'w' ? 'White' : 'Black');

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, '0')}`;
};

// mm:ss countdown display for online clocks
const formatClock = (seconds) => {
  if (seconds == null) return '--:--';
  const s = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const LEARN_STEPS = [
  {
    title: 'The Knight\'s Aura',
    subtitle: 'Unleash the horse\'s power',
    description: 'In conventional chess, only the knight can jump. In Knight-Aura Chess, that power radiates outward — any friendly piece inside the knight\'s aura inherits the ability to jump.',
    board: [
      ['','','','','',''],
      ['','','♞','','',''],
      ['','✦','','✦','',''],
      ['✦','','','','✦',''],
      ['','','','','',''],
    ],
    highlight: 'green',
    caption: '✦ = squares empowered by the knight\'s aura',
  },
  {
    title: 'Ride the Aura — Jump!',
    subtitle: 'Leap over a single blocker',
    description: 'A piece riding the knight\'s aura can jump over exactly one blocking piece along its normal move path, then keep sliding — or land for a capture.',
    board: [
      ['♖','','♟','','','♝'],
      ['','','','','',''],
    ],
    highlight: 'blue',
    caption: '♖ leaps over ♟ — lands anywhere beyond, or captures ♝',
  },
  {
    title: 'One Jump Per Move',
    subtitle: 'The horse\'s gift has limits',
    description: 'The knight shares its jumping power for one leap only. After clearing one blocker, the next piece on that line stops you dead.',
    board: [
      ['♕','','♟','','♜','',''],
      ['','','','','','',''],
    ],
    highlight: 'red',
    caption: '♕ clears ♟ but ♜ holds the line — cannot pass.',
  },
  {
    title: 'Every Piece Gets Wings',
    subtitle: 'Pawns & kings leap too',
    description: 'Even pawns and kings can feel the horse\'s power. Pawns near a knight jump one square forward over a blocker. Kings can jump one square in any safe direction.',
    board: [
      ['','♟','',''],
      ['♙','','',''],
      ['♞','','',''],
    ],
    highlight: 'green',
    caption: '♙ flies over ♟ — carried by ♞\'s aura',
  },
];

export default function App() {
  const { user, authReady, profile, displayName, rating, signInWithGoogle, signInAnonymously, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState('game');
  const [game, setGame] = useState(() => createNewGame());
  const [moveHistory, setMoveHistory] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [gameId, setGameIdRaw] = useState(() => localStorage.getItem('cr_gameId') || null);
  const setGameId = (id) => {
    if (id) localStorage.setItem('cr_gameId', id);
    else localStorage.removeItem('cr_gameId');
    setGameIdRaw(id);
  };
  const [gameData, setGameData] = useState(null);
  const [matchStatus, setMatchStatus] = useState('idle');
  const [matchError, setMatchError] = useState('');
  const [movePending, setMovePending] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('cr_theme') || 'classic');
  const [customThemes, setCustomThemes] = useState(() => JSON.parse(localStorage.getItem('cr_custom_themes') || '[]'));
  const [showThemeCreator, setShowThemeCreator] = useState(false);
  const [board3d, setBoard3d] = useState(() => localStorage.getItem('cr_3d') === 'true');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('cr_dark') !== 'false');
  const [pieceStyle, setPieceStyle] = useState('svg');
  const [waitingGames, setWaitingGames] = useState([]);
  const [joinGameId, setJoinGameId] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState('');
  const [activeTab, setActiveTab] = useState('play');
  const [profileModalUid, setProfileModalUid] = useState(null);
  const [pendingDm, setPendingDm] = useState(null);
  const [unreadDmCount, setUnreadDmCount] = useState(0);
  const [incomingChallenge, setIncomingChallenge] = useState(null);
  const [moveTimestamps, setMoveTimestamps] = useState([{ white: 0, black: 0 }]);
  const [currentMoveStartTime, setCurrentMoveStartTime] = useState(Date.now());
  const [selectedTimeControl, setSelectedTimeControl] = useState(DEFAULT_TIME_CONTROL);
  const [clockWhite, setClockWhite] = useState(null);
  const [clockBlack, setClockBlack] = useState(null);
  const [localResult, setLocalResult] = useState(null);
  const timeoutFiredRef = useRef(false);
  const localResultRef = useRef(null);
  const lastAiFenRef = useRef(null);
  const aiRequestIdRef = useRef(0);
  const aiWorkerRef = useRef(null);
  const isBotOnlineGameRef = useRef(false);
  const botMovePendingRef = useRef(false);
  const [pendingBotMove, setPendingBotMove] = useState(null);
  const rawAiDifficulty = (import.meta.env.VITE_AI_DIFFICULTY || 'medium').toLowerCase();
  const envAiDifficulty = AI_DIFFICULTY_LEVELS.includes(rawAiDifficulty)
    ? rawAiDifficulty
    : 'medium';
  const [aiDifficulty, setAiDifficulty] = useState(envAiDifficulty);

  const isOnline = Boolean(gameId);

  const playerColor = useMemo(() => {
    if (!user || !gameData) return null;
    if (gameData.whiteId === user.uid) return 'w';
    if (gameData.blackId === user.uid) return 'b';
    return null;
  }, [gameData, user]);

  // Apply dark/light theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('cr_dark', darkMode ? 'true' : 'false');
  }, [darkMode]);

  // Persist theme and 3D selections
  useEffect(() => { localStorage.setItem('cr_theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('cr_3d', board3d ? 'true' : 'false'); }, [board3d]);

  const customThemeVars = useMemo(() => {
    if (!theme.startsWith('custom:')) return null;
    const id = theme.slice(7);
    const ct = customThemes.find(t => t.id === id);
    return ct ? themeToVars(ct) : null;
  }, [theme, customThemes]);

  const saveCustomTheme = (themeData) => {
    const newTheme = { ...themeData, id: Date.now().toString() };
    const updated = [...customThemes, newTheme];
    setCustomThemes(updated);
    localStorage.setItem('cr_custom_themes', JSON.stringify(updated));
    setTheme(`custom:${newTheme.id}`);
    setShowThemeCreator(false);
  };

  const deleteCustomTheme = (id) => {
    const updated = customThemes.filter(ct => ct.id !== id);
    setCustomThemes(updated);
    localStorage.setItem('cr_custom_themes', JSON.stringify(updated));
    if (theme === `custom:${id}`) setTheme('classic');
  };

  useEffect(() => {
    localResultRef.current = localResult;
  }, [localResult]);

  // Auto-flip board when playing as black
  useEffect(() => {
    if (playerColor === 'b') setFlipped(true);
    else if (playerColor === 'w') setFlipped(false);
  }, [playerColor]);

  // Sync time control for guest (non-host) when gameData loads or host changes it
  useEffect(() => {
    if (gameData?.timeControl && playerColor === 'b') {
      setSelectedTimeControl(gameData.timeControl);
    }
  }, [gameData?.timeControl, playerColor]);

  // Online clock countdown
  useEffect(() => {
    if (!isOnline || !gameData || gameData.status !== 'active') {
      if (isOnline) {
        setClockWhite(null);
        setClockBlack(null);
      }
      return;
    }
    if (!gameData.timeControl) return;
    // lastMoveAt may briefly be null on the first snapshot after toggleReady
    const lastMoveMs = gameData.lastMoveAt?.toMillis?.() ?? Date.now();

    timeoutFiredRef.current = false;
    const turn = gameData.fen?.split(' ')?.[1] ?? 'w'; // whose clock is ticking

    const tick = () => {
      const elapsed = Math.max(0, (Date.now() - lastMoveMs) / 1000);
      const wt = turn === 'w'
        ? Math.max(0, (gameData.whiteTimeLeft ?? gameData.timeControl) - elapsed)
        : (gameData.whiteTimeLeft ?? gameData.timeControl);
      const bt = turn === 'b'
        ? Math.max(0, (gameData.blackTimeLeft ?? gameData.timeControl) - elapsed)
        : (gameData.blackTimeLeft ?? gameData.timeControl);
      setClockWhite(wt);
      setClockBlack(bt);
      // Only the player on the clock submits the timeout
      if (!timeoutFiredRef.current && playerColor === turn) {
        if (turn === 'w' && wt <= 0) { timeoutFiredRef.current = true; handleTimeout('w'); }
        if (turn === 'b' && bt <= 0) { timeoutFiredRef.current = true; handleTimeout('b'); }
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameData?.status, gameData?.lastMoveAt, gameData?.whiteTimeLeft, gameData?.blackTimeLeft, gameData?.timeControl, isOnline, playerColor]);

  // Local AI countdown clocks
  useEffect(() => {
    if (isOnline || !aiEnabled) {
      if (!isOnline) {
        setClockWhite(null);
        setClockBlack(null);
      }
      return undefined;
    }

    const tick = () => {
      const totals = moveTimestamps[moveTimestamps.length - 1] || { white: 0, black: 0 };
      const elapsed = isGameOver() ? 0 : Math.max(0, (Date.now() - currentMoveStartTime) / 1000);
      const turn = game.turn();
      const whiteLeft = Math.max(0, selectedTimeControl - (totals.white || 0) - (turn === 'w' ? elapsed : 0));
      const blackLeft = Math.max(0, selectedTimeControl - (totals.black || 0) - (turn === 'b' ? elapsed : 0));

      setClockWhite(whiteLeft);
      setClockBlack(blackLeft);

      if (!localResultRef.current && !isGameOver()) {
        if (whiteLeft <= 0) {
          setLocalResult({ winner: 'b', text: 'Black wins on time' });
          setAiThinking(false);
        } else if (blackLeft <= 0) {
          setLocalResult({ winner: 'w', text: 'White wins on time' });
          setAiThinking(false);
        }
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, aiEnabled, selectedTimeControl, moveTimestamps, currentMoveStartTime, game, localResult]);

  const opponentName = useMemo(() => {
    if (!gameData) return 'Opponent';
    if (playerColor === 'w') return gameData.blackName || 'Waiting...';
    if (playerColor === 'b') return gameData.whiteName || 'Opponent';
    return 'Opponent';
  }, [gameData, playerColor]);

  const readyStatus = useMemo(() => {
    if (!gameData || !playerColor) return { self: false, opponent: false };
    const selfReady = playerColor === 'w' ? Boolean(gameData.whiteReady) : Boolean(gameData.blackReady);
    const opponentReady = playerColor === 'w' ? Boolean(gameData.blackReady) : Boolean(gameData.whiteReady);
    return { self: selfReady, opponent: opponentReady };
  }, [gameData, playerColor]);

  const inCheck = useMemo(() => {
    try {
      return game?.isCheckRider?.() || false;
    } catch {
      return false;
    }
  }, [game]);

  // ── Firebase listeners ──
  useEffect(() => {
    if (!gameId) return undefined;
    const gameRef = doc(db, GAMES_COLLECTION, gameId);
    const unsub = onSnapshot(gameRef, (snap) => {
      if (!snap.exists()) {
        setGameId(null);
        setGameData(null);
        setMatchStatus('idle');
        return;
      }
      const data = { id: snap.id, ...snap.data() };
      setGameData(data);
      if (data.fen) {
        setGame(new KnightJumpChess(data.fen));
      }
      if (data.lastMove) {
        setLastMove({ from: data.lastMove.from, to: data.lastMove.to });
      }
      setMoveHistory(data.moveHistory || []);
      setSelectedSquare(null);
      setLegalMoves([]);
      setMatchStatus(data.status || 'active');
    });
    return () => unsub();
  }, [gameId]);

  useEffect(() => {
    // authReady guards against the brief window where user is null while Firebase
    // is still resolving the session — don't evict the persisted gameId prematurely.
    if (authReady && !user) {
      setGameId(null);
      setGameData(null);
      setMatchStatus('idle');
      setMatchError('');
    }
  }, [authReady, user]);

  // ── Unread DM badge ──
  useEffect(() => {
    if (!user || !firebaseEnabled || !db) { setUnreadDmCount(0); return; }
    const q = query(collection(db, 'dms'), where('participants', 'array-contains', user.uid));
    return onSnapshot(q, (snap) => {
      let count = 0;
      snap.docs.forEach((d) => {
        const data = d.data();
        const lastMsg = data.lastMessageAt;
        const lastRead = data[`lastReadAt_${user.uid}`];
        if (lastMsg && (!lastRead || lastMsg.toMillis() > lastRead.toMillis())) count++;
      });
      setUnreadDmCount(count);
    });
  }, [user]);

  // ── Incoming game challenges ──
  useEffect(() => {
    if (!user || !firebaseEnabled || !db) return;
    const q = query(
      collection(db, 'game_challenges'),
      where('to', '==', user.uid),
      where('status', '==', 'pending')
    );
    return onSnapshot(q, (snap) => {
      setIncomingChallenge(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    });
  }, [user]);

  useEffect(() => {
    if (!user || gameId) {
      setWaitingGames([]);
      return undefined;
    }
    const gamesRef = collection(db, GAMES_COLLECTION);
    const waitingQuery = query(
      gamesRef,
      where('status', '==', 'waiting'),
      where('rule', '==', RULE_ID),
      limit(20)
    );
    const unsub = onSnapshot(waitingQuery, (snapshot) => {
      const games = snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          host: docSnap.data().whiteName || 'Anonymous',
          createdAt: docSnap.data().createdAt?.toDate?.() || null,
        }))
        .filter((g) => g.id !== gameId)
        .sort((a, b) => (b.createdAt - a.createdAt));
      setWaitingGames(games);
    });
    return () => unsub();
  }, [user, gameId]);

  // ── AI Web Worker lifecycle ──
  useEffect(() => {
    const worker = new AiWorker();
    aiWorkerRef.current = worker;

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'result') {
        if (isBotOnlineGameRef.current) {
          // Bot online game: queue the move for Firestore submission
          setPendingBotMove(msg);
          setAiThinking(false);
          return;
        }
        if (localResultRef.current) {
          setAiThinking(false);
          return;
        }
        // Apply the AI move
        setGame((prevGame) => {
          const gameCopy = new KnightJumpChess(prevGame.fen());
          const aiMoveObj = gameCopy
            .moves({ verbose: true })
            .find((m) => m.from === msg.from && m.to === msg.to &&
              (!msg.promotion || m.promotion === msg.promotion));

          if (aiMoveObj) {
            gameCopy.move(aiMoveObj);
          } else {
            // Fallback: try direct move
            const result = gameCopy.move({ from: msg.from, to: msg.to, promotion: msg.promotion || 'q' });
            if (!result) {
              console.error('AI returned invalid move:', msg);
              setAiError(`AI returned invalid move: ${msg.from}${msg.to}`);
              setAiThinking(false);
              return prevGame;
            }
          }

          setMoveHistory((prev) => [...prev, msg.san || `${msg.from}${msg.to}`]);
          setLastMove({ from: msg.from, to: msg.to });

          // Track AI move time
          const aiMoveTime = (msg.timeMs || 0) / 1000;
          setMoveTimestamps((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last) last.black += aiMoveTime;
            return updated;
          });
          setCurrentMoveStartTime(Date.now());

          return new KnightJumpChess(gameCopy.fen());
        });
        setAiThinking(false);
      } else if (msg.type === 'error') {
        console.error('AI worker error:', msg.message);
        setAiError(msg.message);
        setAiThinking(false);
      }
    };

    worker.onerror = (err) => {
      console.error('AI worker crashed:', err);
      setAiError('AI engine crashed');
      setAiThinking(false);
    };

    return () => {
      worker.terminate();
      aiWorkerRef.current = null;
    };
  }, []);

  const requestAiMove = useCallback((fen, _history, _timestamps, forceDifficulty) => {
    if (!aiWorkerRef.current) return;
    setAiThinking(true);
    setAiError('');
    const requestId = ++aiRequestIdRef.current;
    lastAiFenRef.current = fen;
    aiWorkerRef.current.postMessage({
      type: 'search',
      fen,
      difficulty: forceDifficulty ?? aiDifficulty,
      id: requestId,
    });
  }, [aiDifficulty]);

  // ── Sync bot-online flag for AI worker callback ──
  useEffect(() => {
    isBotOnlineGameRef.current = isOnline && gameData?.blackId?.startsWith('bot_');
  }, [isOnline, gameData?.blackId]);

  // ── Auto-add bot opponent after 1 minute of waiting ──
  const addBotOpponent = useCallback(async () => {
    if (!gameId || !user || !db) return;
    try {
      // Pick a bot seeded by gameId so each game gets a different one
      const seed = gameId.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
      const bot = BOT_POOL[Math.abs(seed) % BOT_POOL.length];
      const botRef = doc(db, 'users', bot.uid);
      const botSnap = await getDoc(botRef);
      let botRating = 1200;
      if (!botSnap.exists()) {
        await setDoc(botRef, {
          uid: bot.uid,
          displayName: bot.name,
          isBot: true,
          rating: 1200,
          wins: 0,
          losses: 0,
          draws: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        const botData = botSnap.data();
        botRating = botData.rating ?? 1200;
        // Ensure displayName is always set (fixes any orphan documents)
        if (!botData.displayName) {
          await setDoc(botRef, { displayName: bot.name, uid: bot.uid, isBot: true, updatedAt: serverTimestamp() }, { merge: true });
        }
      }

      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.whiteId !== user.uid) return;
        if (data.status !== 'waiting' || data.blackId !== null) return;
        tx.update(gameRef, {
          blackId: bot.uid,
          blackName: bot.name,
          blackRating: botRating,
          blackReady: true,
          whiteReady: true,
          status: 'active',
          startedAt: serverTimestamp(),
          lastMoveAt: serverTimestamp(),
          whiteTimeLeft: data.timeControl ?? DEFAULT_TIME_CONTROL,
          blackTimeLeft: data.timeControl ?? DEFAULT_TIME_CONTROL,
          updatedAt: serverTimestamp()
        });
      });
    } catch (error) {
      console.error('Failed to add bot opponent:', error);
    }
  }, [gameId, user]);

  useEffect(() => {
    if (!isOnline || !gameData || !user) return;
    if (gameData.status !== 'waiting') return;
    if (gameData.whiteId !== user.uid) return;
    if (gameData.blackId !== null) return;
    const createdMs = gameData.createdAt?.toMillis?.();
    if (!createdMs) return;
    const delay = Math.max(0, 60000 - (Date.now() - createdMs));
    const timer = setTimeout(addBotOpponent, delay);
    return () => clearTimeout(timer);
  }, [isOnline, gameData?.status, gameData?.whiteId, gameData?.blackId, gameData?.createdAt, user?.uid, addBotOpponent]);

  // ── Trigger AI move when it's the bot's turn in an online bot game ──
  useEffect(() => {
    if (!isOnline || !gameData || gameData.status !== 'active') return;
    if (!gameData.blackId?.startsWith('bot_')) return;
    if (!gameData.fen) return;
    const turn = gameData.fen.split(' ')[1];
    if (turn !== 'b') return;
    if (botMovePendingRef.current) return;
    botMovePendingRef.current = true;
    requestAiMove(gameData.fen, [], [], 'hard');
  }, [isOnline, gameData?.status, gameData?.blackId, gameData?.fen, requestAiMove]);

  // ── Game actions ──
  const resetPractice = () => {
    const newGame = createNewGame();
    setGame(newGame);
    setMoveHistory([]);
    setSelectedSquare(null);
    setLegalMoves([]);
    setLastMove(null);
    setMoveTimestamps([{ white: 0, black: 0 }]);
    setCurrentMoveStartTime(Date.now());
    setLocalResult(null);
  };

  const handleSquareClick = (square) => {
    if (isOnline && playerColor !== game.turn()) return;
    if (aiEnabled && !isOnline && game.turn() === 'b') return; // block moving AI's pieces

    if (selectedSquare === null) {
      const piecesOnSquare = game.get(square);
      if (piecesOnSquare && piecesOnSquare.color === game.turn()) {
        setSelectedSquare(square);
        const moves = game
          .moves({ square, verbose: true })
          .map((m) => m.to);
        setLegalMoves(moves);
      }
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    if (legalMoves.includes(square)) {
      const moveObj = game
        .moves({ square: selectedSquare, verbose: true })
        .find((m) => m.to === square);

      if (!moveObj) {
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }

      if (isOnline && gameId) {
        handleOnlineMove(moveObj);
      } else {
        handleLocalMove(moveObj);
      }

      setSelectedSquare(null);
      setLegalMoves([]);
    } else {
      const piecesOnSquare = game.get(square);
      if (piecesOnSquare && piecesOnSquare.color === game.turn()) {
        setSelectedSquare(square);
        const moves = game
          .moves({ square, verbose: true })
          .map((m) => m.to);
        setLegalMoves(moves);
      } else {
        setSelectedSquare(null);
        setLegalMoves([]);
      }
    }
  };

  const handleLocalMove = async (moveObj) => {
    const gameCopy = new KnightJumpChess(game.fen());
    gameCopy.move(moveObj);
    setGame(gameCopy);
    const newHistory = [...moveHistory, moveObj.san];
    setMoveHistory(newHistory);
    setLastMove({ from: moveObj.from, to: moveObj.to });

    // Track move time
    const moveEndTime = Date.now();
    const moveTime = (moveEndTime - currentMoveStartTime) / 1000;
    const currentTurn = game.turn();
    
    const newTimestamps = [...moveTimestamps];
    const lastTimestamp = newTimestamps[newTimestamps.length - 1];
    if (currentTurn === 'w') {
      lastTimestamp.white += moveTime;
    } else {
      lastTimestamp.black += moveTime;
    }
    setMoveTimestamps(newTimestamps);
    setCurrentMoveStartTime(moveEndTime);

    if (aiEnabled && !isOnline) {
      requestAiMove(gameCopy.fen(), newHistory, newTimestamps);
    }
  };

  const handleOnlineMove = async (moveObj) => {
    if (!gameId || !gameData || movePending || !user) return;
    setMovePending(true);
    setMatchError('');
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) throw new Error('Game not found');

        const data = snap.data();
        if (data.status !== 'active') throw new Error('Game is not active');

        const currentPlayerColor =
          data.whiteId === user.uid ? 'w' : data.blackId === user.uid ? 'b' : null;
        if (!currentPlayerColor) throw new Error('You are not part of this game');

        const gameCopy = new KnightJumpChess(data.fen);
        if (gameCopy.turn() !== currentPlayerColor) throw new Error('Not your turn');

        const moveResult = gameCopy.move({
          from: moveObj.from,
          to: moveObj.to,
          promotion: moveObj.promotion || 'q'
        });
        if (!moveResult) throw new Error('Illegal move');

        const newHistory = [
          ...(data.moveHistory || []),
          moveResult.san || moveObj.san || `${moveObj.from}-${moveObj.to}`
        ];

        // Deduct elapsed time from the player who just moved
        let newWhiteTimeLeft = data.whiteTimeLeft ?? null;
        let newBlackTimeLeft = data.blackTimeLeft ?? null;
        if (data.timeControl && data.lastMoveAt) {
          const elapsed = Math.max(0, (Date.now() - data.lastMoveAt.toMillis()) / 1000);
          if (currentPlayerColor === 'w') newWhiteTimeLeft = Math.max(0, (data.whiteTimeLeft ?? data.timeControl) - elapsed);
          else newBlackTimeLeft = Math.max(0, (data.blackTimeLeft ?? data.timeControl) - elapsed);
        }

        let nextStatus = 'active';
        let result = null;
        let winner = null;

        // Timeout check
        if (newWhiteTimeLeft !== null && newWhiteTimeLeft <= 0) {
          nextStatus = 'completed'; winner = 'b'; result = 'Black wins on time';
        } else if (newBlackTimeLeft !== null && newBlackTimeLeft <= 0) {
          nextStatus = 'completed'; winner = 'w'; result = 'White wins on time';
        }

        const currentFen = gameCopy.fen().split(' ')[0];
        const hasWhiteKing = currentFen.includes('K');
        const hasBlackKing = currentFen.includes('k');

        if (!hasWhiteKing) {
          nextStatus = 'completed';
          winner = 'b';
          result = 'Black wins by king capture';
        } else if (!hasBlackKing) {
          nextStatus = 'completed';
          winner = 'w';
          result = 'White wins by king capture';
        } else if (gameCopy.isCheckmateRider()) {
          nextStatus = 'completed';
          winner = gameCopy.turn() === 'w' ? 'b' : 'w';
          result = `${formatTurn(winner)} wins by checkmate`;
        } else if (gameCopy.isStalemateRider() || gameCopy.isDraw()) {
          nextStatus = 'draw';
          result = 'Draw';
        }

        let whiteRatingAfter = data.whiteRating ?? 1200;
        let blackRatingAfter = data.blackRating ?? 1200;

        if ((nextStatus === 'completed' || nextStatus === 'draw') && data.whiteId && data.blackId) {
          const whiteScore = winner === 'w' ? 1 : winner === 'b' ? 0 : 0.5;
          const blackScore = winner === 'b' ? 1 : winner === 'w' ? 0 : 0.5;

          whiteRatingAfter = calculateElo(
            data.whiteRating ?? 1200,
            data.blackRating ?? 1200,
            whiteScore
          );
          blackRatingAfter = calculateElo(
            data.blackRating ?? 1200,
            data.whiteRating ?? 1200,
            blackScore
          );

          tx.set(
            doc(db, 'users', data.whiteId),
            {
              uid: data.whiteId,
              displayName: data.whiteName || 'White',
              rating: whiteRatingAfter,
              wins: increment(whiteScore === 1 ? 1 : 0),
              losses: increment(whiteScore === 0 ? 1 : 0),
              draws: increment(whiteScore === 0.5 ? 1 : 0),
              updatedAt: serverTimestamp()
            },
            { merge: true }
          );
          tx.set(
            doc(db, 'users', data.blackId),
            {
              uid: data.blackId,
              displayName: data.blackName || 'Black',
              rating: blackRatingAfter,
              wins: increment(blackScore === 1 ? 1 : 0),
              losses: increment(blackScore === 0 ? 1 : 0),
              draws: increment(blackScore === 0.5 ? 1 : 0),
              updatedAt: serverTimestamp()
            },
            { merge: true }
          );
        }

        tx.update(gameRef, {
          fen: gameCopy.fen(),
          moveHistory: newHistory,
          lastMove: {
            from: moveObj.from,
            to: moveObj.to,
            san: moveResult.san || null,
            by: user.uid
          },
          status: nextStatus,
          result,
          winner,
          whiteRatingAfter: nextStatus === 'active' ? null : whiteRatingAfter,
          blackRatingAfter: nextStatus === 'active' ? null : blackRatingAfter,
          whiteTimeLeft: newWhiteTimeLeft,
          blackTimeLeft: newBlackTimeLeft,
          lastMoveAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
    } catch (error) {
      console.error('Move error:', error);
      setMatchError(error.message || 'Failed to make move');
    } finally {
      setMovePending(false);
    }
  };

  const handleBotOnlineMove = useCallback(async (moveMsg) => {
    if (!gameId || !db) return;
    const gameRef = doc(db, GAMES_COLLECTION, gameId);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.status !== 'active' || !data.blackId?.startsWith('bot_')) return;
        const gameCopy = new KnightJumpChess(data.fen);
        if (gameCopy.turn() !== 'b') return;
        const moveResult = gameCopy.move({ from: moveMsg.from, to: moveMsg.to, promotion: moveMsg.promotion || 'q' });
        if (!moveResult) return;

        const newHistory = [...(data.moveHistory || []), moveResult.san || `${moveMsg.from}-${moveMsg.to}`];

        let newBlackTimeLeft = data.blackTimeLeft ?? null;
        if (data.timeControl && data.lastMoveAt) {
          const elapsed = Math.max(0, (Date.now() - data.lastMoveAt.toMillis()) / 1000);
          newBlackTimeLeft = Math.max(0, (data.blackTimeLeft ?? data.timeControl) - elapsed);
        }

        let nextStatus = 'active';
        let result = null;
        let winner = null;

        if (newBlackTimeLeft !== null && newBlackTimeLeft <= 0) {
          nextStatus = 'completed'; winner = 'w'; result = 'White wins on time';
        }

        if (nextStatus === 'active') {
          const fenBoard = gameCopy.fen().split(' ')[0];
          if (!fenBoard.includes('K')) {
            nextStatus = 'completed'; winner = 'b'; result = 'Black wins by king capture';
          } else if (!fenBoard.includes('k')) {
            nextStatus = 'completed'; winner = 'w'; result = 'White wins by king capture';
          } else if (gameCopy.isCheckmateRider()) {
            winner = gameCopy.turn() === 'w' ? 'b' : 'w';
            nextStatus = 'completed';
            result = `${formatTurn(winner)} wins by checkmate`;
          } else if (gameCopy.isStalemateRider() || gameCopy.isDraw()) {
            nextStatus = 'draw'; result = 'Draw';
          }
        }

        let whiteRatingAfter = data.whiteRating ?? 1200;
        let blackRatingAfter = data.blackRating ?? 1200;
        if (nextStatus === 'completed' || nextStatus === 'draw') {
          const whiteScore = winner === 'w' ? 1 : winner === 'b' ? 0 : 0.5;
          const blackScore = 1 - whiteScore;
          whiteRatingAfter = calculateElo(data.whiteRating ?? 1200, data.blackRating ?? 1200, whiteScore);
          blackRatingAfter = calculateElo(data.blackRating ?? 1200, data.whiteRating ?? 1200, blackScore);
          tx.set(doc(db, 'users', data.whiteId), {
            rating: whiteRatingAfter,
            wins: increment(whiteScore === 1 ? 1 : 0),
            losses: increment(whiteScore === 0 ? 1 : 0),
            draws: increment(whiteScore === 0.5 ? 1 : 0),
            updatedAt: serverTimestamp()
          }, { merge: true });
          tx.set(doc(db, 'users', data.blackId), {
            rating: blackRatingAfter,
            wins: increment(blackScore === 1 ? 1 : 0),
            losses: increment(blackScore === 0 ? 1 : 0),
            draws: increment(blackScore === 0.5 ? 1 : 0),
            updatedAt: serverTimestamp()
          }, { merge: true });
        }

        tx.update(gameRef, {
          fen: gameCopy.fen(),
          moveHistory: newHistory,
          lastMove: { from: moveMsg.from, to: moveMsg.to, san: moveResult.san || null, by: data.blackId },
          status: nextStatus,
          result,
          winner,
          whiteRatingAfter: nextStatus === 'active' ? null : whiteRatingAfter,
          blackRatingAfter: nextStatus === 'active' ? null : blackRatingAfter,
          blackTimeLeft: newBlackTimeLeft,
          lastMoveAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
    } catch (error) {
      console.error('Bot move error:', error);
    } finally {
      botMovePendingRef.current = false;
    }
  }, [gameId]);

  useEffect(() => {
    if (!pendingBotMove) return;
    setPendingBotMove(null);
    handleBotOnlineMove(pendingBotMove);
  }, [pendingBotMove, handleBotOnlineMove]);

  const startMatchmaking = async () => {
    if (!user) return;
    setMatchError('');
    setMatchStatus('searching');
    const gamesRef = collection(db, GAMES_COLLECTION);
    try {
      const waitingQuery = query(
        gamesRef,
        where('status', '==', 'waiting'),
        where('rule', '==', RULE_ID),
        limit(20)
      );
      const waitingSnapshot = await getDocs(waitingQuery);
      let bestDoc = null;
      let bestDiff = Number.POSITIVE_INFINITY;
      waitingSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.whiteId === user.uid) return;
        const hostRating = data.whiteRating ?? 1200;
        const diff = Math.abs(hostRating - rating);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestDoc = docSnap;
        }
      });
      if (bestDoc) {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(bestDoc.ref);
          if (!snap.exists()) return;
          const data = snap.data();
          if (data.status !== 'waiting') return;
          tx.update(bestDoc.ref, {
            blackId: user.uid,
            blackName: displayName,
            blackRating: rating,
            blackReady: false,
            status: 'waiting',
            updatedAt: serverTimestamp()
          });
        });
        setGameId(bestDoc.id);
        setMatchStatus('waiting');
        return;
      }
      const newGame = new KnightJumpChess();
      const docRef = await addDoc(gamesRef, {
        rule: RULE_ID,
        status: 'waiting',
        whiteId: user.uid,
        whiteName: displayName,
        whiteRating: rating,
        whiteReady: false,
        blackReady: false,
        blackId: null,
        blackName: null,
        blackRating: null,
        fen: newGame.fen(),
        moveHistory: [],
        timeControl: selectedTimeControl,
        whiteTimeLeft: selectedTimeControl,
        blackTimeLeft: selectedTimeControl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setGameId(docRef.id);
      setMatchStatus('waiting');
    } catch (error) {
      setMatchError(error.message || 'Matchmaking failed');
      setMatchStatus('idle');
    }
  };

  const createCustomGame = async () => {
    if (!user) return;
    setMatchError('');
    try {
      const newGame = new KnightJumpChess();
      const docRef = await addDoc(collection(db, GAMES_COLLECTION), {
        rule: RULE_ID,
        status: 'waiting',
        whiteId: user.uid,
        whiteName: displayName,
        whiteRating: rating,
        whiteReady: false,
        blackReady: false,
        blackId: null,
        blackName: null,
        blackRating: null,
        fen: newGame.fen(),
        moveHistory: [],
        timeControl: selectedTimeControl,
        whiteTimeLeft: selectedTimeControl,
        blackTimeLeft: selectedTimeControl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setGameId(docRef.id);
      setMatchStatus('waiting');
    } catch (error) {
      setMatchError(error.message || 'Failed to create game');
    }
  };

  const joinCustomGame = async (targetId) => {
    if (!user) return;
    const trimmed = targetId?.trim();
    if (!trimmed) return;
    setMatchError('');
    try {
      const gameRef = doc(db, GAMES_COLLECTION, trimmed);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) throw new Error('Game not found');
        const data = snap.data();
        if (data.status !== 'waiting') throw new Error('Game is not waiting');
        if (data.rule !== RULE_ID) throw new Error('Rule mismatch');
        if (data.whiteId === user.uid) throw new Error('Cannot join your own game');
        tx.update(gameRef, {
          blackId: user.uid,
          blackName: displayName,
          blackRating: rating,
          blackReady: false,
          status: 'waiting',
          updatedAt: serverTimestamp()
        });
      });
      setGameId(trimmed);
      setMatchStatus('waiting');
      setJoinGameId('');
    } catch (error) {
      setMatchError(error.message || 'Failed to join game');
    }
  };

  const toggleReady = async () => {
    if (!user || !gameId || !gameData || !playerColor) return;
    setMatchError('');
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) throw new Error('Game not found');
        const data = snap.data();
        if (data.status !== 'waiting') throw new Error('Game already started');
        const currentReady = playerColor === 'w' ? Boolean(data.whiteReady) : Boolean(data.blackReady);
        const nextReady = !currentReady;
        const update = playerColor === 'w' ? { whiteReady: nextReady } : { blackReady: nextReady };
        const opponentReady = playerColor === 'w' ? Boolean(data.blackReady) : Boolean(data.whiteReady);
        const bothReady = nextReady && opponentReady && data.blackId;
        tx.update(gameRef, {
          ...update,
          status: bothReady ? 'active' : 'waiting',
          startedAt: bothReady ? serverTimestamp() : data.startedAt || null,
          lastMoveAt: bothReady ? serverTimestamp() : data.lastMoveAt || null,
          whiteTimeLeft: bothReady ? (data.timeControl ?? DEFAULT_TIME_CONTROL) : (data.whiteTimeLeft ?? null),
          blackTimeLeft: bothReady ? (data.timeControl ?? DEFAULT_TIME_CONTROL) : (data.blackTimeLeft ?? null),
          updatedAt: serverTimestamp()
        });
      });
    } catch (error) {
      setMatchError(error.message || 'Failed to update ready status');
    }
  };

  const calculateElo = (playerRating, opponentRating, score, kFactor = 32) => {
    const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
    return Math.round(playerRating + kFactor * (score - expected));
  };

  const handleTimeout = async (losingColor) => {
    if (!gameId || !db || !gameData) return;
    const gameRef = doc(db, GAMES_COLLECTION, gameId);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists() || snap.data().status !== 'active') return;
        const data = snap.data();
        const winnerColor = losingColor === 'w' ? 'b' : 'w';
        const whiteScore = winnerColor === 'w' ? 1 : 0;
        const blackScore = 1 - whiteScore;
        let whiteRatingAfter = data.whiteRating ?? 1200;
        let blackRatingAfter = data.blackRating ?? 1200;
        if (data.whiteId && data.blackId) {
          whiteRatingAfter = calculateElo(data.whiteRating ?? 1200, data.blackRating ?? 1200, whiteScore);
          blackRatingAfter = calculateElo(data.blackRating ?? 1200, data.whiteRating ?? 1200, blackScore);
          tx.set(doc(db, 'users', data.whiteId), {
            rating: whiteRatingAfter,
            wins: increment(whiteScore === 1 ? 1 : 0),
            losses: increment(whiteScore === 0 ? 1 : 0),
            draws: increment(0),
            updatedAt: serverTimestamp()
          }, { merge: true });
          tx.set(doc(db, 'users', data.blackId), {
            rating: blackRatingAfter,
            wins: increment(blackScore === 1 ? 1 : 0),
            losses: increment(blackScore === 0 ? 1 : 0),
            draws: increment(0),
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
        tx.update(gameRef, {
          status: 'completed',
          winner: winnerColor,
          result: `${formatTurn(winnerColor)} wins on time`,
          whiteRatingAfter,
          blackRatingAfter,
          updatedAt: serverTimestamp()
        });
      });
    } catch (err) {
      console.error('Timeout error:', err);
    }
  };

  const handleChallengeFriend = async (friendUid, friendName) => {
    if (!user || !firebaseEnabled || !db) return;
    setMatchError('');
    try {
      const newGame = new KnightJumpChess();
      const gameRef = await addDoc(collection(db, GAMES_COLLECTION), {
        rule: RULE_ID,
        status: 'waiting',
        whiteId: user.uid,
        whiteName: displayName,
        whiteRating: rating,
        whiteReady: false,
        blackReady: false,
        blackId: null,
        blackName: null,
        blackRating: null,
        fen: newGame.fen(),
        moveHistory: [],
        timeControl: selectedTimeControl,
        whiteTimeLeft: selectedTimeControl,
        blackTimeLeft: selectedTimeControl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await addDoc(collection(db, 'game_challenges'), {
        from: user.uid,
        fromName: displayName,
        to: friendUid,
        toName: friendName,
        gameId: gameRef.id,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setGameId(gameRef.id);
      setMatchStatus('waiting');
      setActiveTab('play');
    } catch (error) {
      setMatchError(error.message || 'Failed to send challenge');
    }
  };

  const acceptChallenge = async () => {
    if (!incomingChallenge || !user || !db) return;
    try {
      await joinCustomGame(incomingChallenge.gameId);
      await updateDoc(doc(db, 'game_challenges', incomingChallenge.id), { status: 'accepted' });
    } catch (error) {
      setMatchError(error.message || 'Failed to accept challenge');
    }
  };

  const declineChallenge = async () => {
    if (!incomingChallenge || !db) return;
    await deleteDoc(doc(db, 'game_challenges', incomingChallenge.id));
  };

  const cancelMatchmaking = async () => {
    if (!gameId || !gameData) return;
    try {
      if (gameData.status === 'waiting' && gameData.whiteId === user?.uid && !gameData.blackId) {
        await deleteDoc(doc(db, GAMES_COLLECTION, gameId));
      } else {
        await updateDoc(doc(db, GAMES_COLLECTION, gameId), {
          status: 'abandoned',
          result: 'Match cancelled',
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      setMatchError(error.message || 'Failed to cancel match');
    } finally {
      setGameId(null);
      setGameData(null);
      setMatchStatus('idle');
    }
  };

  const leaveMatch = async () => {
    if (!gameId || !gameData) return;
    try {
      // If the game is already over, don't overwrite it in Firestore, just return to lobby locally.
      if (['completed', 'draw', 'abandoned'].includes(gameData.status)) {
        return;
      }

      if (gameData.status === 'active') {
        const gameRef = doc(db, GAMES_COLLECTION, gameId);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(gameRef);
          if (!snap.exists()) return;
          const data = snap.data();
          if (data.status !== 'active') return;

          const winnerColor = playerColor === 'w' ? 'b' : 'w';

          let whiteRatingAfter = data.whiteRating ?? 1200;
          let blackRatingAfter = data.blackRating ?? 1200;

          if (data.whiteId && data.blackId) {
            const whiteScore = winnerColor === 'w' ? 1 : 0;
            const blackScore = winnerColor === 'b' ? 1 : 0;

            whiteRatingAfter = calculateElo(data.whiteRating ?? 1200, data.blackRating ?? 1200, whiteScore);
            blackRatingAfter = calculateElo(data.blackRating ?? 1200, data.whiteRating ?? 1200, blackScore);

            const wScore = winnerColor === 'w' ? 1 : 0;
            const bScore = winnerColor === 'b' ? 1 : 0;
            tx.set(doc(db, 'users', data.whiteId), {
              rating: whiteRatingAfter,
              wins: increment(wScore === 1 ? 1 : 0),
              losses: increment(wScore === 0 ? 1 : 0),
              draws: increment(0),
              updatedAt: serverTimestamp()
            }, { merge: true });

            tx.set(doc(db, 'users', data.blackId), {
              rating: blackRatingAfter,
              wins: increment(bScore === 1 ? 1 : 0),
              losses: increment(bScore === 0 ? 1 : 0),
              draws: increment(0),
              updatedAt: serverTimestamp()
            }, { merge: true });
          }

          tx.update(gameRef, {
            status: 'abandoned',
            winner: winnerColor,
            result: `${formatTurn(winnerColor)} wins by forfeit`,
            whiteRatingAfter,
            blackRatingAfter,
            updatedAt: serverTimestamp()
          });
        });
      } else {
        // Cancel pre-game waiting
        await updateDoc(doc(db, GAMES_COLLECTION, gameId), {
          status: 'abandoned',
          result: 'Match cancelled',
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      setMatchError(error.message || 'Failed to leave match');
    } finally {
      setGameId(null);
      setGameData(null);
      setMatchStatus('idle');
    }
  };

  const gameStatusText = () => {
    if (!isOnline) {
      if (localResult?.text) return localResult.text;
      const kingWinner = game.getWinnerByKingCapture();
      if (kingWinner) {
        return `${formatTurn(kingWinner)} wins by king capture`;
      }
      if (game.isCheckmateRider()) {
        return `Checkmate — ${formatTurn(game.turn() === 'w' ? 'b' : 'w')} wins`;
      }
      if (game.isStalemateRider()) return 'Stalemate — Draw';
      return `${formatTurn(game.turn())} to move`;
    }
    if (!gameData) return 'Loading...';
    if (gameData.status === 'waiting') return 'Waiting for opponent...';
    if (gameData.status === 'completed' || gameData.status === 'draw') {
      return gameData.result || 'Game over';
    }
    if (gameData.status === 'abandoned') return gameData.result || 'Abandoned';
    return `${formatTurn(game.turn())} to move`;
  };

  const isGameOver = () => {
    return localResult || game.getWinnerByKingCapture() || game.isCheckmateRider() || game.isStalemateRider();
  };

  // ── Render helpers ──
  const renderMoveTable = () => {
    if (moveHistory.length === 0) {
      return <p className="muted">No moves yet. Make your first move!</p>;
    }

    const pairs = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      pairs.push({
        number: Math.floor(i / 2) + 1,
        white: moveHistory[i],
        black: moveHistory[i + 1] || null
      });
    }

    return (
      <div className="move-table">
        {pairs.map((pair) => (
          <div key={pair.number} className="move-table-row">
            <span className="move-number-cell">{pair.number}.</span>
            <span className="move-cell">{pair.white}</span>
            <span className={`move-cell ${!pair.black ? 'move-cell--empty' : ''}`}>
              {pair.black || ''}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // Player info for bars
  const topPlayerName = isOnline
    ? (playerColor === 'w' ? opponentName : displayName || 'White')
    : (aiEnabled ? 'AI Engine' : 'Black');
  const bottomPlayerName = isOnline
    ? (playerColor === 'w' ? displayName || 'White' : opponentName)
    : (aiEnabled ? displayName || 'You' : 'White');
  const topPlayerRating = isOnline
    ? (playerColor === 'w' ? (gameData?.blackRatingAfter ?? gameData?.blackRating) : (gameData?.whiteRatingAfter ?? gameData?.whiteRating))
    : (aiEnabled ? aiDifficulty.toUpperCase() : null);
  const bottomPlayerRating = isOnline
    ? (playerColor === 'w' ? (gameData?.whiteRatingAfter ?? gameData?.whiteRating) : (gameData?.blackRatingAfter ?? gameData?.blackRating))
    : (aiEnabled ? rating : null);

  return (
    <div className="app">
      {/* ── Top Bar ── */}
      <header className="top-bar">
        <div className="brand">
          <img src="/riderchess.png" alt="Logo" className="brand-logo" />
          <div className="brand-text">
            <h1>Knight-Aura Chess</h1>
            <p className="brand-subtitle">Chess reimagined — unleash the power of the horse</p>
          </div>
        </div>
        <div className="auth-panel">
          {!authReady ? (
            <span className="auth-status">Connecting...</span>
          ) : !firebaseEnabled ? (
            <span className="auth-status">Local mode</span>
          ) : user ? (
            <div className="auth-user">
              <div className="auth-user-chip" onClick={() => setProfileModalUid(user.uid)} role="button" tabIndex={0}>
                <div className="auth-avatar-mini">
                  {profile?.photoURL
                    ? <img src={profile.photoURL} alt="" referrerPolicy="no-referrer" />
                    : (displayName || '?')[0].toUpperCase()
                  }
                </div>
                <span className="auth-name">{displayName}</span>
                <span className="auth-meta">{rating}</span>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '5px 12px' }} onClick={signOut}>Sign out</button>
            </div>
          ) : (
            <div className="auth-actions">
              <button className="btn btn-primary" onClick={signInWithGoogle}>Sign in</button>
              <button className="btn btn-ghost" onClick={signInAnonymously}>Play as Guest</button>
            </div>
          )}
        </div>
      </header>

      {/* ── Left decorative background ── */}
      <div className="left-bg-art" aria-hidden="true" />

      {/* ── Main Layout ── */}
      {currentPage === 'learn' ? (
        <LearnPage onBack={() => setCurrentPage('game')} />
      ) : (
        <>
          <main className="layout">

        {/* ── Board Column ── */}
        <section className={`board-section${board3d ? ' board-section--3d' : ''}`}>
          {/* Status */}
          <div className="board-header">
            <div className="game-mode-badge">
              <span className={`game-mode-dot${isOnline ? ' game-mode-dot--live' : ''}`} />
              {isOnline ? 'Live Match' : aiEnabled ? 'vs AI' : 'Practice'}
            </div>
            <span className="game-status-text">{gameStatusText()}</span>
            {isOnline && playerColor && (
              <div className="player-chip">{formatTurn(playerColor)}</div>
            )}
            {!isOnline && aiEnabled && (
              <div className="ai-opponent-badge">
                <span className="badge-icon">⚙</span>
                <div className="badge-content">
                  <p className="badge-label">AI</p>
                  <p className="badge-difficulty">{aiDifficulty}</p>
                </div>
              </div>
            )}
          </div>

          {/* Challenge toast */}
          {incomingChallenge && !isOnline && (
            <div className="challenge-toast">
              <p className="challenge-toast-text">
                <strong>{incomingChallenge.fromName}</strong> challenged you to a game!
              </p>
              <div className="challenge-toast-actions">
                <button className="btn btn-primary" style={{ padding: '0.3rem 0.9rem', fontSize: '0.82rem' }} onClick={acceptChallenge}>Accept</button>
                <button className="btn btn-ghost" style={{ padding: '0.3rem 0.9rem', fontSize: '0.82rem' }} onClick={declineChallenge}>Decline</button>
              </div>
            </div>
          )}

          {/* Alerts */}
          {localResult?.text && (
            <div className="victory-banner">
              {localResult.text}
            </div>
          )}
          {!localResult && game.getWinnerByKingCapture() && (
            <div className="victory-banner">
              {formatTurn(game.getWinnerByKingCapture())} wins by king capture
            </div>
          )}
          {!localResult && !game.getWinnerByKingCapture() && game.isCheckmateRider() && (
            <div className="victory-banner">
              Checkmate — {formatTurn(game.turn() === 'w' ? 'b' : 'w')} wins
            </div>
          )}
          {!localResult && !game.getWinnerByKingCapture() && game.isStalemateRider() && (
            <div className="victory-banner">Stalemate — Draw</div>
          )}
          {inCheck && !localResult && !game.getWinnerByKingCapture() && !game.isCheckmateRider() && (
            <div className="check-alert">Check!</div>
          )}

          {/* Top player bar */}
          {(() => {
            const topColor = flipped ? 'w' : 'b';
            const isActiveTurn = game.turn() === topColor && !isGameOver();
            const topClock = topColor === 'w' ? clockWhite : clockBlack;
            return (
              <div className={`player-bar player-bar--top${isActiveTurn ? ' player-bar--active-turn' : ''}`}>
                <div className="player-bar__info">
                  <span className={`player-bar__color-indicator player-bar__color-indicator--${topColor === 'w' ? 'white' : 'black'}`} />
                  <span className="player-bar__name">{flipped ? bottomPlayerName : topPlayerName}</span>
                  {(flipped ? bottomPlayerRating : topPlayerRating) && (
                    <span className="player-bar__rating">
                      {flipped ? bottomPlayerRating : topPlayerRating}
                    </span>
                  )}
                </div>
                {((isOnline || (aiEnabled && !isOnline)) && topClock != null) && (
                  <div className={`player-bar__clock${isActiveTurn ? ' player-bar__clock--active' : ''}${topClock <= 10 ? ' player-bar__clock--low' : ''}`}>
                    {formatClock(topClock)}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Board */}
          <ChessBoard
            game={game}
            selectedSquare={selectedSquare}
            legalMoves={legalMoves}
            onSquareClick={handleSquareClick}
            theme={theme}
            customThemeVars={customThemeVars}
            pieceStyle={pieceStyle}
            lastMove={lastMove}
            flipped={flipped}
            inCheck={inCheck}
            board3d={board3d}
          />

          {/* Bottom player bar */}
          {(() => {
            const botColor = flipped ? 'b' : 'w';
            const isActiveTurn = game.turn() === botColor && !isGameOver();
            const botClock = botColor === 'w' ? clockWhite : clockBlack;
            return (
              <div className={`player-bar player-bar--bottom${isActiveTurn ? ' player-bar--active-turn' : ''}`}>
                <div className="player-bar__info">
                  <span className={`player-bar__color-indicator player-bar__color-indicator--${botColor === 'w' ? 'white' : 'black'}`} />
                  <span className="player-bar__name">{flipped ? topPlayerName : bottomPlayerName}</span>
                  {(flipped ? topPlayerRating : bottomPlayerRating) && (
                    <span className="player-bar__rating">
                      {flipped ? topPlayerRating : bottomPlayerRating}
                    </span>
                  )}
                </div>
                {((isOnline || (aiEnabled && !isOnline)) && botClock != null) && (
                  <div className={`player-bar__clock${isActiveTurn ? ' player-bar__clock--active' : ''}${botClock <= 10 ? ' player-bar__clock--low' : ''}`}>
                    {formatClock(botClock)}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Board action buttons */}
          <div className="board-actions">
            <button
              className="btn btn-ghost"
              onClick={() => setFlipped(!flipped)}
              title="Flip board"
            >
              ⇅ Flip
            </button>
            <button
              className="btn btn-ghost"
              onClick={resetPractice}
              disabled={isOnline}
              title="New game"
            >
              + New
            </button>
            {aiEnabled && (
              <button
                className="btn btn-ghost"
                onClick={() => { setAiEnabled(false); resetPractice(); }}
              >
                Stop AI
              </button>
            )}
            {isOnline && (
              <button className="btn btn-danger" onClick={leaveMatch}>
                Resign
              </button>
            )}
          </div>

          {matchError && <p className="error-text">{matchError}</p>}

          {/* AI thinking indicator — hide when bot is playing as online opponent */}
          {aiThinking && !isBotOnlineGameRef.current && (
            <div className="ai-thinking-indicator">
              <div className="thinking-spinner" />
              <span className="thinking-text">AI is thinking...</span>
            </div>
          )}
          {aiError && <p className="error-text">{aiError}</p>}

          {/* Live game chat */}
          {isOnline && gameData?.status === 'active' && gameId && user && firebaseEnabled && (
            <GameChat gameId={gameId} currentUser={user} currentUserName={displayName} />
          )}
        </section>

        {/* ── Sidebar ── */}
        <div className="sidebar">
          <nav className="tab-navigation">
            {[
              { key: 'play',     icon: '▶',  label: 'Play' },
              { key: 'moves',    icon: '☰',  label: 'Moves' },
              { key: 'games',    icon: '⚔',  label: 'Games' },
              { key: 'social',   icon: '👥', label: 'Social', badge: unreadDmCount },
              { key: 'rankings', icon: '🏆', label: 'Rank' },
              { key: 'settings', icon: '⚙',  label: 'Settings' },
            ].map((tab) => (
              <button
                key={tab.key}
                className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="tab-icon-wrap">
                  <span className="tab-icon">{tab.icon}</span>
                  {tab.badge > 0 && <span className="tab-badge">{tab.badge}</span>}
                </span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
            <button
              className="tab-btn"
              onClick={() => setCurrentPage('learn')}
            >
              <span className="tab-icon-wrap"><span className="tab-icon">📖</span></span>
              <span className="tab-label">Learn</span>
            </button>
          </nav>

          <div className="tab-content">
            {/* ── Play Tab ── */}
            {activeTab === 'play' && (
              <div className="tab-panel">
                <h3>Play</h3>
                {isOnline ? (
                  <>
                    <p className="match-state">
                      Status: <strong>{gameData?.status || matchStatus}</strong>
                    </p>
                    <p className="muted">Opponent: {opponentName}</p>
                    {gameData?.status === 'waiting' && playerColor && (
                      <div className="ready-panel">
                        {/* Time control — host (white) can set before readying up */}
                        {playerColor === 'w' && !readyStatus.self ? (
                          <div style={{ marginBottom: '12px' }}>
                            <p className="play-section-label" style={{ marginBottom: '6px' }}>Time Control</p>
                            <div className="time-control-grid">
                              {TIME_CONTROLS.map((tc) => (
                                <button
                                  key={tc.seconds}
                                  className={`time-control-btn${selectedTimeControl === tc.seconds ? ' active' : ''}`}
                                  onClick={async () => {
                                    setSelectedTimeControl(tc.seconds);
                                    if (gameId && db) {
                                      await updateDoc(doc(db, GAMES_COLLECTION, gameId), {
                                        timeControl: tc.seconds,
                                        whiteTimeLeft: tc.seconds,
                                        blackTimeLeft: tc.seconds
                                      });
                                    }
                                  }}
                                >
                                  {tc.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="muted" style={{ marginBottom: '8px' }}>
                            ⏱ {formatClock(gameData?.timeControl ?? selectedTimeControl)} per player
                          </p>
                        )}
                        <div className="ready-row">
                          <span>You</span>
                          <span className={readyStatus.self ? 'ready-chip ready-chip--on' : 'ready-chip'}>
                            {readyStatus.self ? 'Ready' : 'Not ready'}
                          </span>
                        </div>
                        <div className="ready-row">
                          <span>{opponentName}</span>
                          <span className={readyStatus.opponent ? 'ready-chip ready-chip--on' : 'ready-chip'}>
                            {readyStatus.opponent ? 'Ready' : 'Not ready'}
                          </span>
                        </div>
                        <button className="btn btn-primary" onClick={toggleReady}>
                          {readyStatus.self ? 'Unready' : 'Ready up'}
                        </button>
                        <p className="muted">Game starts when both players are ready.</p>
                      </div>
                    )}
                    {/* Live clocks in sidebar */}
                    {gameData?.status === 'active' && clockWhite != null && (
                      <div className="sidebar-clocks">
                        <div className={`sidebar-clock-row${game.turn() === 'b' ? ' sidebar-clock-row--active' : ''}`}>
                          <span className="sidebar-clock-label">⬛ Black</span>
                          <span className={`sidebar-clock-val${clockBlack <= 10 ? ' sidebar-clock-val--low' : ''}`}>
                            {formatClock(clockBlack)}
                          </span>
                        </div>
                        <div className={`sidebar-clock-row${game.turn() === 'w' ? ' sidebar-clock-row--active' : ''}`}>
                          <span className="sidebar-clock-label">⬜ White</span>
                          <span className={`sidebar-clock-val${clockWhite <= 10 ? ' sidebar-clock-val--low' : ''}`}>
                            {formatClock(clockWhite)}
                          </span>
                        </div>
                      </div>
                    )}
                    {gameData?.status === 'waiting' ? (
                      <button className="btn btn-ghost" onClick={cancelMatchmaking}>Cancel</button>
                    ) : ['completed', 'draw', 'abandoned'].includes(gameData?.status) ? (
                      <button className="btn btn-primary" onClick={leaveMatch}>Return to Lobby</button>
                    ) : (
                      <button className="btn btn-danger" onClick={leaveMatch}>Resign</button>
                    )}
                  </>
                ) : (
                  <>
                    {user && (
                      <div style={{ marginBottom: '10px' }}>
                        <p className="play-section-label" style={{ marginBottom: '6px' }}>⏱ Time Control</p>
                        <div className="time-control-grid">
                          {TIME_CONTROLS.map((tc) => (
                            <button
                              key={tc.seconds}
                              className={`time-control-btn${selectedTimeControl === tc.seconds ? ' active' : ''}`}
                              onClick={() => setSelectedTimeControl(tc.seconds)}
                            >
                              {tc.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {user ? (
                      <button className="btn btn-primary" onClick={startMatchmaking} style={{ width: '100%', marginBottom: 8 }}>
                        Find Online Match
                      </button>
                    ) : (
                      <p className="muted" style={{ marginBottom: 8 }}>
                        {firebaseEnabled
                          ? 'Sign in to play online.'
                          : 'Local mode — online play disabled.'}
                      </p>
                    )}
                    <button
                      className="btn btn-ghost"
                      style={{ width: '100%', marginBottom: 8 }}
                      onClick={() => {
                        setAiEnabled(true);
                        resetPractice();
                      }}
                    >
                      ⚙ Play vs AI
                    </button>
                    
                    <div style={{ marginBottom: '8px' }}>
                      <p className="play-section-label" style={{ marginBottom: '6px' }}>AI Difficulty</p>
                      <div className="difficulty-grid">
                        {AI_DIFFICULTY_LEVELS.map((d) => (
                          <button
                            key={d}
                            className={`difficulty-btn${aiDifficulty === d ? ' active' : ''}`}
                            onClick={() => setAiDifficulty(d)}
                            disabled={aiThinking}
                          >
                            {d.charAt(0).toUpperCase() + d.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {aiEnabled && (
                      <div className="ai-mode-status">
                        <p className="ai-status-text">✓ AI Active</p>
                        <p className="ai-status-difficulty">{aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1)}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Moves Tab ── */}
            {activeTab === 'moves' && (
              <div className="tab-panel">
                <h3>Moves</h3>
                <div className="moves-list">
                  {renderMoveTable()}
                </div>
                {moveHistory.length > 0 && aiEnabled && (
                  <div className="time-summary" style={{ marginTop: 10 }}>
                    <div className="summary-item">
                      <span className="summary-label">White</span>
                      <span className="summary-time">
                        {formatTime(moveTimestamps.reduce((sum, t) => sum + (t?.white || 0), 0))}
                      </span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Black</span>
                      <span className="summary-time">
                        {formatTime(moveTimestamps.reduce((sum, t) => sum + (t?.black || 0), 0))}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Games Tab ── */}
            {activeTab === 'games' && (
              <div className="tab-panel">
                <h3>Custom Games</h3>
                {!user ? (
                  <p className="muted">Sign in to create or join a game.</p>
                ) : isOnline ? (
                  <p className="muted">Leave the current match to join another.</p>
                ) : (
                  <>
                    <button className="btn btn-primary" onClick={createCustomGame} style={{ width: '100%', marginBottom: 8 }}>
                      Create New Game
                    </button>
                    <div className="theme-select">
                      <label htmlFor="join-game" className="muted">Join by game ID</label>
                      <input
                        id="join-game"
                        className="select"
                        type="text"
                        value={joinGameId}
                        onChange={(event) => setJoinGameId(event.target.value)}
                        placeholder="Paste game ID"
                      />
                      <button className="btn btn-primary" onClick={() => joinCustomGame(joinGameId)} style={{ marginTop: 4 }}>
                        Join
                      </button>
                    </div>
                    {waitingGames.length > 0 ? (
                      <div className="waiting-list">
                        <p className="muted">Open games:</p>
                        <ul>
                          {waitingGames.map((row) => (
                            <li key={row.id}>
                              <div className="waiting-meta">
                                <strong>{row.host}</strong>
                                <span className="muted">
                                  {row.createdAt
                                    ? row.createdAt.toLocaleString()
                                    : 'Just now'}
                                </span>
                              </div>
                              <button className="btn btn-ghost" onClick={() => joinCustomGame(row.id)}>
                                Join
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="muted">No open games.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Settings Tab ── */}
            {activeTab === 'settings' && (
              <div className="tab-panel">
                <h3>Settings</h3>

                <div className="settings-section">
                  <span className="settings-section-label">Interface Mode</span>
                  <div className="piece-set-grid">
                    <button
                      className={`piece-set-btn${!darkMode ? ' active' : ''}`}
                      onClick={() => setDarkMode(false)}
                    >
                      <span className="piece-set-preview">☀</span>
                      Light
                    </button>
                    <button
                      className={`piece-set-btn${darkMode ? ' active' : ''}`}
                      onClick={() => setDarkMode(true)}
                    >
                      <span className="piece-set-preview">🌙</span>
                      Dark
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <span className="settings-section-label">Board Theme</span>
                  <div className="theme-swatches">
                    {[
                      { key: 'classic', label: 'Classic', l: 'swatch-classic-light', d: 'swatch-classic-dark' },
                      { key: 'slate', label: 'Slate', l: 'swatch-slate-light', d: 'swatch-slate-dark' },
                      { key: 'rosewood', label: 'Rosewood', l: 'swatch-rosewood-light', d: 'swatch-rosewood-dark' },
                    ].map((t) => (
                      <button key={t.key} className={`theme-swatch${theme === t.key ? ' active' : ''}`} onClick={() => setTheme(t.key)}>
                        <div className="theme-swatch-preview">
                          <span className={t.l} /><span className={t.d} />
                          <span className={t.d} /><span className={t.l} />
                        </div>
                        {t.label}
                      </button>
                    ))}
                    {customThemes.map((ct) => {
                      const ctVars = themeToVars(ct);
                      return (
                        <button
                          key={ct.id}
                          className={`theme-swatch theme-swatch--custom${theme === `custom:${ct.id}` ? ' active' : ''}`}
                          onClick={() => setTheme(`custom:${ct.id}`)}
                        >
                          <div className="theme-swatch-preview">
                            <span style={{ background: ctVars['--board-light'] }} />
                            <span style={{ background: ctVars['--board-dark'] }} />
                            <span style={{ background: ctVars['--board-dark'] }} />
                            <span style={{ background: ctVars['--board-light'] }} />
                          </div>
                          {ct.name}
                          <span
                            role="button"
                            tabIndex={0}
                            className="theme-swatch-delete"
                            title="Delete theme"
                            onClick={e => { e.stopPropagation(); deleteCustomTheme(ct.id); }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); deleteCustomTheme(ct.id); } }}
                          >
                            ×
                          </span>
                        </button>
                      );
                    })}
                    <button
                      className="theme-swatch theme-swatch--add"
                      onClick={() => setShowThemeCreator(v => !v)}
                    >
                      <div className="theme-swatch-preview theme-swatch-preview--add">+</div>
                      Create
                    </button>
                  </div>
                  {showThemeCreator && (
                    <ThemeCreator
                      onSave={saveCustomTheme}
                      onCancel={() => setShowThemeCreator(false)}
                    />
                  )}
                </div>

                <div className="settings-section">
                  <span className="settings-section-label">Piece Set</span>
                  <div className="piece-set-grid">
                    <button className={`piece-set-btn${pieceStyle === 'svg' ? ' active' : ''}`} onClick={() => setPieceStyle('svg')}>
                      <span className="piece-set-preview">♜</span>
                      Cburnett
                    </button>
                    <button className={`piece-set-btn${pieceStyle === 'minimal' ? ' active' : ''}`} onClick={() => setPieceStyle('minimal')}>
                      <span className="piece-set-preview" style={{ fontSize: '1.1rem', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>K</span>
                      Letters
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <span className="settings-section-label">Board View</span>
                  <div className="piece-set-grid">
                    <button className={`piece-set-btn${!board3d ? ' active' : ''}`} onClick={() => setBoard3d(false)}>
                      <span className="piece-set-preview">⬛</span>
                      Flat
                    </button>
                    <button className={`piece-set-btn${board3d ? ' active' : ''}`} onClick={() => setBoard3d(true)}>
                      <span className="piece-set-preview">🎲</span>
                      3D
                    </button>
                  </div>
                </div>

                {user && (
                  <button
                    className="btn btn-ghost"
                    style={{ width: '100%', marginTop: '4px' }}
                    onClick={() => setProfileModalUid(user.uid)}
                  >
                    Edit My Profile
                  </button>
                )}
              </div>
            )}

            {/* ── Rankings Tab ── */}
            {activeTab === 'rankings' && firebaseEnabled && (
              <div className="tab-panel">
                <LeaderboardPanel
                  currentUser={user}
                  onPlayerClick={(p) => setProfileModalUid(p.id)}
                  embedded
                />
              </div>
            )}

            {/* ── Social Tab ── */}
            {activeTab === 'social' && (
              <SocialTab
                currentUser={user}
                currentUserName={displayName}
                currentUserPhotoURL={profile?.photoURL || null}
                onPlayerClick={(p) => setProfileModalUid(p.id)}
                pendingDm={pendingDm}
                onPendingDmHandled={() => setPendingDm(null)}
                onChallengeFriend={handleChallengeFriend}
              />
            )}

          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="footer-brand">
          <span className="footer-brand-dot" />
          Knight-Aura Chess
        </div>
        <span className="footer-meta">Chess reimagined — unleash the power of the horse</span>
      </footer>
        </>
      )}

      {/* ── Profile Modal ── */}
      {profileModalUid && (
        <UserProfileModal
          profileUid={profileModalUid}
          currentUser={user}
          currentUserName={displayName}
          onClose={() => setProfileModalUid(null)}
          onOpenDm={({ chatId, partnerUid, partnerName }) => {
            setPendingDm({ chatId, partnerUid, partnerName });
            setProfileModalUid(null);
            setActiveTab('social');
          }}
        />
      )}
    </div>
  );
}
