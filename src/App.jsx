import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AiWorker from './workers/aiWorker.js?worker';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import KnightJumpChess from './KnightJumpChess.js';
import ChessBoard from './components/ChessBoard.jsx';
import LearnPage from './components/LearnPage.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import { db, firebaseEnabled } from './utils/firebase.js';
import './App.css';

const GAMES_COLLECTION = 'games';
const RULE_ID = 'chessrider';
const AI_DIFFICULTY_LEVELS = ['easy', 'medium', 'hard', 'expert'];

const createNewGame = () => new KnightJumpChess();

const formatTurn = (turn) => (turn === 'w' ? 'White' : 'Black');

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, '0')}`;
};

const LEARN_STEPS = [
  {
    title: 'The Knight Aura',
    subtitle: 'Proximity is power',
    description: 'Any friendly piece adjacent to a knight — or reachable by a knight\'s L-shaped move — gains the ability to jump.',
    board: [
      ['','','','','',''],
      ['','','♞','','',''],
      ['','✦','','✦','',''],
      ['✦','','','','✦',''],
      ['','','','','',''],
    ],
    highlight: 'green',
    caption: '✦ = squares in the Knight\'s aura zone',
  },
  {
    title: 'Jump One Blocker',
    subtitle: 'Leap over a single piece',
    description: 'A piece in the knight\'s aura can jump over exactly one blocking piece along its normal move path, then keep sliding.',
    board: [
      ['♖','','♟','','','♝'],
      ['','','','','',''],
    ],
    highlight: 'blue',
    caption: '♖ jumps over ♟ and can land on any square beyond — or capture ♝',
  },
  {
    title: 'Second Blocker Stops',
    subtitle: 'Only one jump per move',
    description: 'After jumping one piece, the next piece on that line blocks you. You cannot jump twice in a single move.',
    board: [
      ['♕','','♟','','♜','',''],
      ['','','','','','',''],
    ],
    highlight: 'red',
    caption: '♕ jumps ♟ but ♜ blocks further travel. Cannot land past ♜.',
  },
  {
    title: 'Pawns & Kings',
    subtitle: 'Short-range jumps too',
    description: 'Pawns near a knight can jump one square forward over a blocker. Kings can jump one square in any direction when blocked.',
    board: [
      ['','♟','',''],
      ['♙','','',''],
      ['♞','','',''],
    ],
    highlight: 'green',
    caption: '♙ can jump over ♟ — powered by ♞ below',
  },
];

export default function App() {
  const { user, authReady, displayName, rating, signInWithGoogle, signInAnonymously, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState('game');
  const [game, setGame] = useState(() => createNewGame());
  const [moveHistory, setMoveHistory] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [gameId, setGameId] = useState(null);
  const [gameData, setGameData] = useState(null);
  const [matchStatus, setMatchStatus] = useState('idle');
  const [matchError, setMatchError] = useState('');
  const [movePending, setMovePending] = useState(false);
  const [theme, setTheme] = useState('classic');
  const [pieceStyle, setPieceStyle] = useState('svg');
  const [waitingGames, setWaitingGames] = useState([]);
  const [joinGameId, setJoinGameId] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState('');
  const [activeTab, setActiveTab] = useState('play');
  const [moveTimestamps, setMoveTimestamps] = useState([{ white: 0, black: 0 }]);
  const [currentMoveStartTime, setCurrentMoveStartTime] = useState(Date.now());
  const lastAiFenRef = useRef(null);
  const aiRequestIdRef = useRef(0);
  const aiWorkerRef = useRef(null);
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
    if (!user) {
      setGameId(null);
      setGameData(null);
      setMatchStatus('idle');
      setMatchError('');
    }
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

  const requestAiMove = useCallback((fen, _history, _timestamps) => {
    if (!aiWorkerRef.current) return;
    setAiThinking(true);
    setAiError('');
    const requestId = ++aiRequestIdRef.current;
    lastAiFenRef.current = fen;
    aiWorkerRef.current.postMessage({
      type: 'search',
      fen,
      difficulty: aiDifficulty,
      id: requestId,
    });
  }, [aiDifficulty]);

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
  };

  const handleSquareClick = (square) => {
    if (isOnline && playerColor !== game.turn()) {
      return;
    }

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

        let nextStatus = 'active';
        let result = null;
        let winner = null;

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

            tx.set(doc(db, 'users', data.whiteId), {
              rating: whiteRatingAfter, updatedAt: serverTimestamp()
            }, { merge: true });

            tx.set(doc(db, 'users', data.blackId), {
              rating: blackRatingAfter, updatedAt: serverTimestamp()
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
        // Just cancel if not officially active
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
    return game.getWinnerByKingCapture() || game.isCheckmateRider() || game.isStalemateRider();
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
    ? (playerColor === 'w' ? gameData?.blackRating : gameData?.whiteRating)
    : (aiEnabled ? aiDifficulty.toUpperCase() : null);
  const bottomPlayerRating = isOnline
    ? (playerColor === 'w' ? gameData?.whiteRating : gameData?.blackRating)
    : (aiEnabled ? rating : null);

  return (
    <div className="app">
      {/* ── Top Bar ── */}
      <header className="top-bar">
        <div className="brand">
          <img src="/riderchess.png" alt="Logo" className="brand-logo" />
          <h1>KNightAuraChess</h1>
        </div>
        <div className="auth-panel">
          {!authReady ? (
            <span className="auth-status">Connecting...</span>
          ) : !firebaseEnabled ? (
            <span className="auth-status">Local mode</span>
          ) : user ? (
            <div className="auth-user">
              <span className="auth-name">{displayName}</span>
              <span className="auth-meta">({rating})</span>
              <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
            </div>
          ) : (
            <div className="auth-actions">
              <button className="btn btn-primary" onClick={signInWithGoogle}>Sign in</button>
              <button className="btn btn-ghost" onClick={signInAnonymously}>Play as Guest</button>
            </div>
          )}
        </div>
      </header>

      {/* ── Main Layout ── */}
      {currentPage === 'learn' ? (
        <LearnPage onBack={() => setCurrentPage('game')} />
      ) : (
        <>
          <main className="layout">
        {/* ── Board Column ── */}
        <section className="board-section">
          {/* Status text */}
          <div className="board-header">
            <div>
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                {isOnline ? 'Live Match' : aiEnabled ? 'vs AI' : 'Practice'}
                {' · '}
                {gameStatusText()}
              </p>
            </div>
            {isOnline && playerColor && (
              <div className="player-chip">
                {formatTurn(playerColor)}
              </div>
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

          {/* Alerts */}
          {game.getWinnerByKingCapture() && (
            <div className="victory-banner">
              {formatTurn(game.getWinnerByKingCapture())} wins by king capture
            </div>
          )}
          {!game.getWinnerByKingCapture() && game.isCheckmateRider() && (
            <div className="victory-banner">
              Checkmate — {formatTurn(game.turn() === 'w' ? 'b' : 'w')} wins
            </div>
          )}
          {!game.getWinnerByKingCapture() && game.isStalemateRider() && (
            <div className="victory-banner">Stalemate — Draw</div>
          )}
          {inCheck && !game.getWinnerByKingCapture() && !game.isCheckmateRider() && (
            <div className="check-alert">Check!</div>
          )}

          {/* Top player bar */}
          <div className="player-bar player-bar--top">
            <div className="player-bar__info">
              <span className="player-bar__name">{flipped ? bottomPlayerName : topPlayerName}</span>
              {(flipped ? bottomPlayerRating : topPlayerRating) && (
                <span className="player-bar__rating">
                  ({flipped ? bottomPlayerRating : topPlayerRating})
                </span>
              )}
            </div>
            {aiEnabled && !isOnline && (
              <div className="player-bar__clock">
                <span className={game.turn() === (flipped ? 'w' : 'b') ? 'player-bar__clock--active' : ''}>
                  {formatTime(moveTimestamps[moveTimestamps.length - 1]?.[flipped ? 'white' : 'black'] || 0)}
                </span>
              </div>
            )}
          </div>

          {/* Board */}
          <ChessBoard
            game={game}
            selectedSquare={selectedSquare}
            legalMoves={legalMoves}
            onSquareClick={handleSquareClick}
            theme={theme}
            pieceStyle={pieceStyle}
            lastMove={lastMove}
            flipped={flipped}
            inCheck={inCheck}
          />

          {/* Bottom player bar */}
          <div className="player-bar player-bar--bottom">
            <div className="player-bar__info">
              <span className="player-bar__name">{flipped ? topPlayerName : bottomPlayerName}</span>
              {(flipped ? topPlayerRating : bottomPlayerRating) && (
                <span className="player-bar__rating">
                  ({flipped ? topPlayerRating : bottomPlayerRating})
                </span>
              )}
            </div>
            {aiEnabled && !isOnline && (
              <div className="player-bar__clock">
                <span className={game.turn() === (flipped ? 'b' : 'w') ? 'player-bar__clock--active' : ''}>
                  {formatTime(moveTimestamps[moveTimestamps.length - 1]?.[flipped ? 'black' : 'white'] || 0)}
                </span>
              </div>
            )}
          </div>

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

          {/* AI thinking indicator */}
          {aiThinking && (
            <div className="ai-thinking-indicator">
              <div className="thinking-spinner" />
              <span className="thinking-text">AI is thinking...</span>
            </div>
          )}
          {aiError && <p className="error-text">{aiError}</p>}
        </section>

        {/* ── Sidebar ── */}
        <div className="sidebar">
          <nav className="tab-navigation">
            {[
              { key: 'play', icon: '▶', label: 'Play' },
              { key: 'moves', icon: '☰', label: 'Moves' },
              { key: 'games', icon: '⚔', label: 'Games' },
              { key: 'settings', icon: '⚙', label: 'Settings' },
            ].map((tab) => (
              <button
                key={tab.key}
                className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
            <button
              className="tab-btn"
              onClick={() => setCurrentPage('learn')}
              title="Learn the rules"
            >
              <span className="tab-icon">📖</span>
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
                    {gameData?.status === 'waiting' ? (
                      <button className="btn btn-ghost" onClick={cancelMatchmaking}>Cancel</button>
                    ) : (
                      <button className="btn btn-danger" onClick={leaveMatch}>Resign</button>
                    )}
                  </>
                ) : (
                  <>
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
                    
                    <div className="theme-select">
                      <label htmlFor="ai-difficulty" className="muted">AI Difficulty</label>
                      <select
                        id="ai-difficulty"
                        className="select"
                        value={aiDifficulty}
                        onChange={(event) => setAiDifficulty(event.target.value)}
                        disabled={aiThinking}
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                        <option value="expert">Expert</option>
                      </select>
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
                <div className="theme-select">
                  <label htmlFor="theme-choice" className="muted">Board theme</label>
                  <select
                    id="theme-choice"
                    className="select"
                    value={theme}
                    onChange={(event) => setTheme(event.target.value)}
                  >
                    <option value="classic">Brown (Classic)</option>
                    <option value="slate">Blue-Gray (Slate)</option>
                    <option value="rosewood">Rosewood</option>
                  </select>
                </div>
                <div className="theme-select">
                  <label htmlFor="piece-choice" className="muted">Piece set</label>
                  <select
                    id="piece-choice"
                    className="select"
                    value={pieceStyle}
                    onChange={(event) => setPieceStyle(event.target.value)}
                  >
                    <option value="svg">Cburnett (Classic)</option>
                    <option value="minimal">Letters</option>
                  </select>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      <footer className="footer">
        <span>KNightAuraChess</span>
        <span>A chess variant with knight-empowered jumping</span>
      </footer>
        </>
      )}
    </div>
  );
}
