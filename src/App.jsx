import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import AppHeader from './components/AppHeader.jsx';
import AppPageRouter from './components/AppPageRouter.jsx';
import SeasonDecorations from './components/SeasonDecorations.jsx';
import { themeToVars } from './components/ThemeCreator.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import {
  BOARD_HAND_CAPTURE_TOTAL_MS,
  BOARD_HAND_TOTAL_MS,
} from './utils/boardHandAnimation.js';
import { db, firebaseEnabled } from './utils/firebase.js';
import './App.css';
const UserProfileModal = React.lazy(() => import('./components/UserProfileModal.jsx'));

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

const APP_BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '';

const TIME_CONTROLS = [
  { label: '1 min',  seconds: 60 },
  { label: '3 min',  seconds: 180 },
  { label: '5 min',  seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
];
const DEFAULT_TIME_CONTROL = 300;
const BOARD_VIEW_MODES = ['flat', 'realistic'];
const BASE_THEMES = [
  { key: 'classic', label: 'Classic', l: 'swatch-classic-light', d: 'swatch-classic-dark' },
  { key: 'slate', label: 'Slate', l: 'swatch-slate-light', d: 'swatch-slate-dark' },
  { key: 'rosewood', label: 'Rosewood', l: 'swatch-rosewood-light', d: 'swatch-rosewood-dark' },
];

const createNewGame = () => new KnightJumpChess();

const getInitialBoardView = () => {
  const savedBoardView = localStorage.getItem('cr_board_view');
  if (savedBoardView === '3d') return 'realistic';
  if (BOARD_VIEW_MODES.includes(savedBoardView)) return savedBoardView;
  return localStorage.getItem('cr_3d') === 'true' ? 'realistic' : 'flat';
};

const getInitialBoardCornerRadius = () => {
  const savedRadius = Number.parseInt(localStorage.getItem('cr_board_corner_radius') || '', 10);
  if (Number.isFinite(savedRadius)) {
    return Math.min(24, Math.max(0, savedRadius));
  }
  return 8;
};

const buildMoveAnimationPayload = (board, moveLike, actor = 'self') => {
  if (!board || !moveLike?.from || !moveLike?.to) return null;
  const movingPiece = board.get(moveLike.from);
  const capturedPiece = board.get(moveLike.to);
  if (!movingPiece) return null;
  return {
    key: `${moveLike.from}-${moveLike.to}-${moveLike.san || ''}-${Date.now()}`,
    from: moveLike.from,
    to: moveLike.to,
    actor,
    movingPiece: { color: movingPiece.color, type: movingPiece.type },
    capturedPiece: capturedPiece ? { color: capturedPiece.color, type: capturedPiece.type } : null,
  };
};

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

const getPageFromLocation = () => {
  if (typeof window === 'undefined') return 'home';
  if (/\/SignIn\/?$/.test(window.location.pathname)) return 'signin';
  if (/\/Tutorials\/?$/.test(window.location.pathname)) return 'tutorials';
  if (/\/Learn\/?$/.test(window.location.pathname)) return 'learn';
  if (/\/Play\/?$/.test(window.location.pathname)) return 'game';
  return 'home';
};

const setBrowserPage = (page, replace = false) => {
  if (typeof window === 'undefined') return;
  let nextUrl = APP_BASE_PATH ? `${APP_BASE_PATH}/` : '/';
  if (page === 'signin') nextUrl = `${APP_BASE_PATH}/SignIn`;
  else if (page === 'tutorials') nextUrl = `${APP_BASE_PATH}/Tutorials`;
  else if (page === 'learn') nextUrl = `${APP_BASE_PATH}/Learn`;
  else if (page === 'game') nextUrl = `${APP_BASE_PATH}/Play`;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method](null, '', nextUrl);
};

export default function App() {
  const {
    user,
    authReady,
    profile,
    displayName,
    rating,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInAnonymously,
    signOut
  } = useAuth();
  const [currentPage, setCurrentPage] = useState(() => getPageFromLocation());
  const [game, setGame] = useState(() => createNewGame());
  const [moveHistory, setMoveHistory] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [pendingPromotion, setPendingPromotion] = useState(null);
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
  const [boardView, setBoardView] = useState(() => getInitialBoardView());
  const [boardCornerRadius, setBoardCornerRadius] = useState(() => getInitialBoardCornerRadius());
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('cr_dark') !== 'false');
  const [pieceStyle, setPieceStyle] = useState('svg');
  const [liveVoiceChat, setLiveVoiceChat] = useState(() => localStorage.getItem('cr_live_voice_chat') === 'true');
  const [seasonalDecorations, setSeasonalDecorations] = useState(() => localStorage.getItem('cr_seasonal_decorations') !== 'false');
  const [seasonalDecorationDensity, setSeasonalDecorationDensity] = useState(() => {
    const raw = Number.parseInt(localStorage.getItem('cr_seasonal_decoration_density') || '100', 10);
    if (Number.isNaN(raw)) return 100;
    return Math.min(180, Math.max(20, raw));
  });
  const [waitingGames, setWaitingGames] = useState([]);
  const [joinGameId, setJoinGameId] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState('');
  const [activeTab, setActiveTab] = useState('play');
  const [authMode, setAuthMode] = useState('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
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
  const [moveAnimation, setMoveAnimation] = useState(null);
  const timeoutFiredRef = useRef(false);
  const localResultRef = useRef(null);
  const lastAiFenRef = useRef(null);
  const aiRequestIdRef = useRef(0);
  const aiWorkerRef = useRef(null);
  const isBotOnlineGameRef = useRef(false);
  const botMovePendingRef = useRef(false);
  const [pendingBotMove, setPendingBotMove] = useState(null);
  const gameRef = useRef(game);
  const lastAnimatedMoveRef = useRef(null);
  const hasLoadedOnlineGameRef = useRef(false);
  const rawAiDifficulty = (import.meta.env.VITE_AI_DIFFICULTY || 'medium').toLowerCase();
  const envAiDifficulty = AI_DIFFICULTY_LEVELS.includes(rawAiDifficulty)
    ? rawAiDifficulty
    : 'medium';
  const [aiDifficulty, setAiDifficulty] = useState(envAiDifficulty);

  const isOnline = Boolean(gameId);
  const board3d = boardView === 'realistic';

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(getPageFromLocation());
    };
    window.addEventListener('popstate', handlePopState);
    setCurrentPage(getPageFromLocation());
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToPage = useCallback((page, replace = false) => {
    setCurrentPage(page);
    setBrowserPage(page, replace);
  }, []);

  useEffect(() => {
    if (user && currentPage === 'signin') {
      navigateToPage('game', true);
    }
  }, [currentPage, navigateToPage, user]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (!moveAnimation) return undefined;
    const timer = setTimeout(() => {
      setMoveAnimation(null);
      lastAnimatedMoveRef.current = null;
    }, moveAnimation.capturedPiece ? BOARD_HAND_CAPTURE_TOTAL_MS : BOARD_HAND_TOTAL_MS);
    return () => clearTimeout(timer);
  }, [moveAnimation]);

  const playMoveAnimation = useCallback((board, moveLike, actor = 'self') => {
    if (!board3d) return;
    const animation = buildMoveAnimationPayload(board, moveLike, actor);
    if (!animation) return;
    const dedupeKey = `${animation.from}-${animation.to}-${moveLike.san || ''}`;
    if (lastAnimatedMoveRef.current === dedupeKey) return;
    lastAnimatedMoveRef.current = dedupeKey;
    setMoveAnimation(animation);
  }, [board3d]);

  const playerColor = useMemo(() => {
    if (!user || !gameData) return null;
    if (gameData.whiteId === user.uid) return 'w';
    if (gameData.blackId === user.uid) return 'b';
    return null;
  }, [gameData, user]);

  const handleEmailAuth = useCallback(async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('Enter an email and password.');
      return;
    }
    setAuthError('');
    try {
      if (authMode === 'signup') {
        await signUpWithEmail(authEmail.trim(), authPassword);
      } else {
        await signInWithEmail(authEmail.trim(), authPassword);
      }
      setAuthPassword('');
    } catch (error) {
      setAuthError(error?.message || 'Authentication failed.');
    }
  }, [authEmail, authMode, authPassword, signInWithEmail, signUpWithEmail]);

  // Apply dark/light theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('cr_dark', darkMode ? 'true' : 'false');
  }, [darkMode]);

  // Persist theme and 3D selections
  useEffect(() => { localStorage.setItem('cr_theme', theme); }, [theme]);
  useEffect(() => {
    localStorage.setItem('cr_board_view', boardView);
    localStorage.setItem('cr_3d', board3d ? 'true' : 'false');
  }, [board3d, boardView]);
  useEffect(() => {
    localStorage.setItem('cr_board_corner_radius', String(boardCornerRadius));
  }, [boardCornerRadius]);
  useEffect(() => { localStorage.setItem('cr_live_voice_chat', liveVoiceChat ? 'true' : 'false'); }, [liveVoiceChat]);
  useEffect(() => { localStorage.setItem('cr_seasonal_decorations', seasonalDecorations ? 'true' : 'false'); }, [seasonalDecorations]);
  useEffect(() => {
    localStorage.setItem('cr_seasonal_decoration_density', String(seasonalDecorationDensity));
  }, [seasonalDecorationDensity]);

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
    hasLoadedOnlineGameRef.current = false;
    const gameDocRef = doc(db, GAMES_COLLECTION, gameId);
    const unsub = onSnapshot(gameDocRef, (snap) => {
      if (!snap.exists()) {
        setGameId(null);
        setGameData(null);
        setMatchStatus('idle');
        return;
      }
      const data = { id: snap.id, ...snap.data() };
      setGameData(data);
      if (data.fen) {
        if (hasLoadedOnlineGameRef.current && data.lastMove) {
          const snapshotMoveKey = `${data.lastMove.from}-${data.lastMove.to}-${data.lastMove.san || ''}`;
          if (snapshotMoveKey !== lastAnimatedMoveRef.current) {
            const actor =
              data.lastMove.by === user?.uid ? 'self' :
              data.lastMove.by?.startsWith?.('bot_') ? 'ai' : 'opponent';
            playMoveAnimation(gameRef.current, data.lastMove, actor);
          }
        }
        setGame(new KnightJumpChess(data.fen));
        hasLoadedOnlineGameRef.current = true;
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
  }, [gameId, playMoveAnimation, user?.uid]);

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
            playMoveAnimation(prevGame, aiMoveObj, 'ai');
            gameCopy.move(aiMoveObj);
          } else {
            // Fallback: try direct move
            playMoveAnimation(prevGame, msg, 'ai');
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
  }, [playMoveAnimation]);

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
  }, [isOnline, gameData, user, addBotOpponent]);

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
  }, [isOnline, gameData, requestAiMove]);

  // ── Game actions ──
  const resetPractice = () => {
    const newGame = createNewGame();
    setGame(newGame);
    setMoveHistory([]);
    setSelectedSquare(null);
    setLegalMoves([]);
    setPendingPromotion(null);
    setLastMove(null);
    setMoveTimestamps([{ white: 0, black: 0 }]);
    setCurrentMoveStartTime(Date.now());
    setLocalResult(null);
    setMoveAnimation(null);
    lastAnimatedMoveRef.current = null;
  };

  const handleSquareClick = (square) => {
    if (pendingPromotion) return;
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
      const candidateMoves = game
        .moves({ square: selectedSquare, verbose: true })
        .filter((m) => m.to === square);

      const promotionMoves = candidateMoves.filter((m) => m.promotion);
      if (promotionMoves.length > 1) {
        setPendingPromotion({
          from: selectedSquare,
          to: square,
          color: promotionMoves[0].color,
          moves: promotionMoves,
        });
        return;
      }

      const moveObj = candidateMoves[0];

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
      setPendingPromotion(null);
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
    playMoveAnimation(game, moveObj, 'self');
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
        playMoveAnimation(new KnightJumpChess(data.fen), moveResult, 'self');

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

  const handlePromotionChoice = (promotion) => {
    if (!pendingPromotion) return;
    const moveObj = pendingPromotion.moves.find((move) => move.promotion === promotion) || pendingPromotion.moves[0];
    if (!moveObj) {
      setPendingPromotion(null);
      return;
    }

    if (isOnline && gameId) {
      handleOnlineMove(moveObj);
    } else {
      handleLocalMove(moveObj);
    }

    setSelectedSquare(null);
    setLegalMoves([]);
    setPendingPromotion(null);
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

  const winnerByKing = game.getWinnerByKingCapture();
  const isCheckmate = !localResult && !winnerByKing && game.isCheckmateRider();
  const isStalemate = !localResult && !winnerByKing && !isCheckmate && game.isStalemateRider();
  const victoryText = localResult?.text
    || (winnerByKing ? `${formatTurn(winnerByKing)} wins by king capture` : null)
    || (isCheckmate ? `Checkmate — ${formatTurn(game.turn() === 'w' ? 'b' : 'w')} wins` : null)
    || (isStalemate ? 'Stalemate — Draw' : null);
  const showCheckAlert = inCheck && !localResult && !winnerByKing && !isCheckmate;
  const showPlayerClocks = isOnline || (aiEnabled && !isOnline);
  const topColor = flipped ? 'w' : 'b';
  const bottomColor = flipped ? 'b' : 'w';
  const topClock = topColor === 'w' ? clockWhite : clockBlack;
  const bottomClock = bottomColor === 'w' ? clockWhite : clockBlack;
  const topPlayer = {
    color: topColor,
    isActiveTurn: game.turn() === topColor && !isGameOver(),
    name: flipped ? bottomPlayerName : topPlayerName,
    rating: flipped ? bottomPlayerRating : topPlayerRating,
    clock: showPlayerClocks ? topClock : null,
  };
  const bottomPlayer = {
    color: bottomColor,
    isActiveTurn: game.turn() === bottomColor && !isGameOver(),
    name: flipped ? topPlayerName : bottomPlayerName,
    rating: flipped ? topPlayerRating : bottomPlayerRating,
    clock: showPlayerClocks ? bottomClock : null,
  };

  const handleSelectTimeControl = useCallback(async (seconds) => {
    setSelectedTimeControl(seconds);
    if (gameId && db) {
      await updateDoc(doc(db, GAMES_COLLECTION, gameId), {
        timeControl: seconds,
        whiteTimeLeft: seconds,
        blackTimeLeft: seconds,
      });
    }
  }, [gameId]);

  const moveTable = renderMoveTable();

  const homePageProps = {
    user,
    profile,
    rating,
    firebaseEnabled,
    incomingChallenge,
    onPlayGuest: () => {
      setAiEnabled(false);
      resetPractice();
      navigateToPage('game');
    },
    onSignIn: () => navigateToPage('signin'),
    onOpenAccount: () => {
      if (user) setProfileModalUid(user.uid);
    },
    onHowItWorks: () => navigateToPage('learn'),
    onAcceptChallenge: async () => {
      await acceptChallenge();
      navigateToPage('game');
    },
    onDeclineChallenge: declineChallenge,
  };

  const signInPageProps = {
    authReady,
    firebaseEnabled,
    authMode,
    setAuthMode,
    authEmail,
    setAuthEmail,
    authPassword,
    setAuthPassword,
    authError,
    onSubmit: handleEmailAuth,
    onGoogle: signInWithGoogle,
    onGuest: signInAnonymously,
  };

  const boardShellProps = {
    boardView,
    board3d,
    isOnline,
    aiEnabled,
    playerColor,
    aiDifficulty,
    gameStatusText: gameStatusText(),
    incomingChallenge,
    onAcceptChallenge: acceptChallenge,
    onDeclineChallenge: declineChallenge,
    victoryText,
    showCheckAlert,
    topPlayer,
    bottomPlayer,
    formatClock,
    game,
    selectedSquare,
    legalMoves,
    onSquareClick: handleSquareClick,
    theme,
    customThemeVars,
    boardCornerRadius,
    pieceStyle,
    lastMove,
    flipped,
    inCheck,
    moveAnimation,
    pendingPromotion,
    onChoosePromotion: handlePromotionChoice,
    onCancelPromotion: () => setPendingPromotion(null),
    onFlipBoard: () => setFlipped(!flipped),
    onNewGame: resetPractice,
    onStopAi: () => {
      setAiEnabled(false);
      resetPractice();
    },
    onLeaveMatch: leaveMatch,
    matchError,
    aiThinking,
    aiError,
    isBotOnlineGame: isBotOnlineGameRef.current,
    gameData,
    gameId,
    user,
    displayName,
    liveVoiceChat,
  };

  const sidebarProps = {
    activeTab,
    setActiveTab,
    unreadDmCount,
    playProps: {
      isOnline,
      user,
      firebaseEnabled,
      gameData,
      matchStatus,
      opponentName,
      playerColor,
      readyStatus,
      timeControls: TIME_CONTROLS,
      selectedTimeControl,
      onSelectTimeControl: handleSelectTimeControl,
      formatClock,
      clockWhite,
      clockBlack,
      currentTurn: game.turn(),
      startMatchmaking,
      aiEnabled,
      onPlayAi: () => {
        setAiEnabled(true);
        resetPractice();
      },
      aiDifficulty,
      aiDifficultyLevels: AI_DIFFICULTY_LEVELS,
      onSelectAiDifficulty: setAiDifficulty,
      aiThinking,
      cancelMatchmaking,
      leaveMatch,
      toggleReady,
    },
    moveHistory,
    moveTable,
    aiEnabled,
    moveTimestamps,
    formatTime,
    gamesProps: {
      user,
      isOnline,
      createCustomGame,
      joinGameId,
      setJoinGameId,
      joinCustomGame,
      waitingGames,
    },
    settingsProps: {
      darkMode,
      setDarkMode,
      baseThemes: BASE_THEMES,
      theme,
      setTheme,
      customThemes,
      deleteCustomTheme,
      showThemeCreator,
      setShowThemeCreator,
      saveCustomTheme,
      pieceStyle,
      setPieceStyle,
      boardView,
      setBoardView,
      boardCornerRadius,
      setBoardCornerRadius,
      liveVoiceChat,
      setLiveVoiceChat,
      seasonalDecorations,
      setSeasonalDecorations,
      seasonalDecorationDensity,
      setSeasonalDecorationDensity,
      user,
      onEditProfile: () => setProfileModalUid(user.uid),
    },
    rankingsProps: {
      user,
      onPlayerClick: (player) => setProfileModalUid(player.id),
    },
    socialProps: {
      user,
      displayName,
      photoURL: profile?.photoURL || null,
      onPlayerClick: (player) => setProfileModalUid(player.id),
      pendingDm,
      onPendingDmHandled: () => setPendingDm(null),
      onChallengeFriend: handleChallengeFriend,
    },
  };

  return (
    <div className="app">
      <AppHeader
        authReady={authReady}
        user={user}
        profile={profile}
        displayName={displayName}
        rating={rating}
        onOpenProfile={() => setProfileModalUid(user.uid)}
        onOpenSignIn={() => navigateToPage('signin')}
        onSignOut={signOut}
      />
      <div className="left-bg-art" aria-hidden="true" />
      {seasonalDecorations && <SeasonDecorations density={seasonalDecorationDensity} />}
      <AppPageRouter
        currentPage={currentPage}
        onNavigate={navigateToPage}
        homePageProps={homePageProps}
        signInPageProps={signInPageProps}
        boardShellProps={boardShellProps}
        sidebarProps={sidebarProps}
      />

      {/* ── Profile Modal ── */}
      {profileModalUid && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </div>
  );
}
