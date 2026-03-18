import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useAuth } from './contexts/AuthContext.jsx';
import { db, firebaseEnabled } from './utils/firebase.js';
import ruleZoneImage from './assets/manual/rule-zone.svg';
import ruleJumpImage from './assets/manual/rule-jump.svg';
import ruleBlockImage from './assets/manual/rule-one-block.svg';
import './App.css';

const GAMES_COLLECTION = 'games';
const RULE_ID = 'chessrider';

const createNewGame = () => new KnightJumpChess();

const formatTurn = (turn) => (turn === 'w' ? 'White' : 'Black');

const manualCards = [
  {
    title: '1. Stay Near Your Knight',
    image: ruleZoneImage,
    alt: 'Knight influence zone showing adjacent and knight-jump range squares.',
    body: 'A piece gains jump power if it is adjacent to a friendly knight or on a knight-move square from it.'
  },
  {
    title: '2. Jump Exactly One Blocker',
    image: ruleJumpImage,
    alt: 'Rook jumping one blocking piece and landing farther on the same line.',
    body: 'Sliding pieces can jump one blocker, then keep moving along the same line and may capture after the jump.'
  },
  {
    title: '3. Second Blocker Stops You',
    image: ruleBlockImage,
    alt: 'Example where a second blocker prevents further travel after the jump.',
    body: 'You cannot jump twice in one move. After your one jump, the next piece on that line blocks you.'
  }
];

export default function App() {
  const { user, authReady, displayName, rating, signInWithGoogle, signInAnonymously, signOut } = useAuth();
  const [game, setGame] = useState(() => createNewGame());
  const [moveHistory, setMoveHistory] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
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
  const lastAiFenRef = useRef(null);
  const aiRequestIdRef = useRef(0);
  const rawAiDifficulty = (import.meta.env.VITE_AI_DIFFICULTY || 'expert').toLowerCase();
  const aiDifficulty = ['easy', 'medium', 'hard', 'expert'].includes(rawAiDifficulty)
    ? rawAiDifficulty
    : 'expert';
  const aiDepthRaw = Number(import.meta.env.VITE_AI_DEPTH);
  const aiTimeRaw = Number(import.meta.env.VITE_AI_TIME);
  const aiDepth = Number.isFinite(aiDepthRaw) && aiDepthRaw > 0 ? Math.floor(aiDepthRaw) : undefined;
  const aiTime = Number.isFinite(aiTimeRaw) && aiTimeRaw > 0 ? aiTimeRaw : undefined;
  const defaultAiTimeByDifficulty = {
    easy: 0.5,
    medium: 2.0,
    hard: 6.0,
    expert: 10.0
  };

  const isOnline = Boolean(gameId);

  const playerColor = useMemo(() => {
    if (!user || !gameData) return null;
    if (gameData.whiteId === user.uid) return 'w';
    if (gameData.blackId === user.uid) return 'b';
    return null;
  }, [gameData, user]);

  const opponentName = useMemo(() => {
    if (!gameData) return 'Opponent';
    if (playerColor === 'w') return gameData.blackName || 'Waiting opponent';
    if (playerColor === 'b') return gameData.whiteName || 'Opponent';
    return 'Opponent';
  }, [gameData, playerColor]);

  const readyStatus = useMemo(() => {
    if (!gameData || !playerColor) return { self: false, opponent: false };
    const selfReady = playerColor === 'w' ? Boolean(gameData.whiteReady) : Boolean(gameData.blackReady);
    const opponentReady = playerColor === 'w' ? Boolean(gameData.blackReady) : Boolean(gameData.whiteReady);
    return { self: selfReady, opponent: opponentReady };
  }, [gameData, playerColor]);

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
    const unsub = onSnapshot(waitingQuery, (snap) => {
      const rows = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.whiteId !== user.uid) {
          rows.push({
            id: docSnap.id,
            host: data.whiteName || 'Host',
            hostRating: data.whiteRating ?? 1200,
            createdAt: data.createdAt?.toDate?.() || null
          });
        }
      });
      setWaitingGames(rows);
    });
    return () => unsub();
  }, [gameId, user]);

  const canInteract = useMemo(() => {
    if (movePending) return false;
    const kingWinner = game.getWinnerByKingCapture?.();
    if (kingWinner || game.isCheckmateRider?.() || game.isStalemateRider?.()) return false;
    if (!isOnline) return true;
    if (!gameData || gameData.status !== 'active') return false;
    return playerColor === game.turn();
  }, [game, gameData, isOnline, movePending, playerColor]);

  const handleSquareClick = (square) => {
    if (!canInteract) return;

    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    const piece = game.get(square);

    if (!selectedSquare) {
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
        const moves = game.moves({
          square,
          verbose: true
        });
        setLegalMoves(moves.map((move) => move.to));
      }
      return;
    }

    if (legalMoves.includes(square)) {
      if (isOnline) {
        submitOnlineMove(selectedSquare, square);
      } else {
        makeLocalMove(selectedSquare, square);
      }
    } else if (piece && piece.color === game.turn()) {
      setSelectedSquare(square);
      const moves = game.moves({
        square,
        verbose: true
      });
      setLegalMoves(moves.map((move) => move.to));
    }
  };

  const makeLocalMove = (from, to, promotion) => {
    const gameCopy = new KnightJumpChess(game.fen());
    const moveResult = gameCopy.move({ from, to, promotion: promotion || 'q' });
    if (moveResult) {
      setGame(gameCopy);
      setMoveHistory((prev) => [...prev, moveResult.san || `${from}-${to}`]);
      setSelectedSquare(null);
      setLegalMoves([]);
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!aiEnabled || isOnline) return;
    if (aiThinking) return;
    if (game.getWinnerByKingCapture?.() || game.isCheckmateRider?.() || game.isStalemateRider?.()) return;
    if (game.turn() !== 'b') return;

    const aiEndpoint = import.meta.env.VITE_AI_ENDPOINT || '';
    const aiUrl = aiEndpoint ? `${aiEndpoint}/ai-move` : '/ai/ai-move';
    const fen = game.fen();
    if (lastAiFenRef.current === fen) return;
    lastAiFenRef.current = fen;
    setAiThinking(true);
    setAiError('');

    const requestId = ++aiRequestIdRef.current;
    const controller = new AbortController();
    const expectedAiSeconds = aiTime ?? defaultAiTimeByDifficulty[aiDifficulty] ?? 10.0;
    const requestTimeoutMs = Math.max(8000, Math.ceil(expectedAiSeconds * 1000) + 2500);
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    const aiPayload = { fen, difficulty: aiDifficulty };
    if (aiDepth) aiPayload.depth = aiDepth;
    if (aiTime) aiPayload.time = aiTime;

    fetch(aiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aiPayload),
      signal: controller.signal
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || 'AI error');
        }
        return res.json();
      })
      .then((data) => {
        const uci = data.uci || '';
        if (uci.length < 4) {
          throw new Error('Invalid AI move');
        }
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
        if (requestId !== aiRequestIdRef.current) return;
        const ok = makeLocalMove(from, to, promotion);
        if (!ok) {
          throw new Error(`AI move rejected: ${uci}`);
        }
        setAiError('');
      })
      .catch((error) => {
        if (requestId !== aiRequestIdRef.current) return;
        if (error?.name === 'AbortError') {
          setAiError('AI request timed out.');
          return;
        }
        setAiError(error?.message || 'AI move failed. Check server or rules.');
      })
      .finally(() => {
        if (requestId !== aiRequestIdRef.current) return;
        clearTimeout(timeout);
        setAiThinking(false);
      });

    return () => {
      clearTimeout(timeout);
    };
  }, [aiDepth, aiDifficulty, aiEnabled, aiThinking, aiTime, game, isOnline]);

  const submitOnlineMove = async (from, to) => {
    if (!gameId || !user) return;
    setMovePending(true);
    setMatchError('');
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists()) {
          throw new Error('Game no longer exists');
        }
        const data = snap.data();
        if (data.status !== 'active') {
          throw new Error('Game is not active');
        }
        const currentPlayerColor = data.whiteId === user.uid ? 'w' : data.blackId === user.uid ? 'b' : null;
        if (!currentPlayerColor) {
          throw new Error('You are not part of this game');
        }
        const currentGame = new KnightJumpChess(data.fen);
        if (currentGame.turn() !== currentPlayerColor) {
          throw new Error('Not your turn');
        }
        const moveResult = currentGame.move({ from, to, promotion: 'q' });
        if (!moveResult) {
          throw new Error('Illegal move');
        }
        const nextHistory = [...(data.moveHistory || []), moveResult.san || `${from}-${to}`];
        let nextStatus = 'active';
        let result = null;
        let winner = null;
        const kingWinner = currentGame.getWinnerByKingCapture();
        if (kingWinner) {
          nextStatus = 'completed';
          winner = kingWinner;
          result = `${formatTurn(kingWinner)} wins by king capture`;
        } else if (currentGame.isCheckmateRider()) {
          nextStatus = 'completed';
          winner = currentGame.turn() === 'w' ? 'b' : 'w';
          result = `${formatTurn(winner)} wins by checkmate`;
        } else if (currentGame.isStalemateRider()) {
          nextStatus = 'draw';
          result = 'Stalemate';
        }
        let ratingUpdate = null;
        if (nextStatus === 'completed' || nextStatus === 'draw') {
          const whiteRating = data.whiteRating ?? 1200;
          const blackRating = data.blackRating ?? 1200;
          const whiteScore = winner === 'w' ? 1 : winner === 'b' ? 0 : 0.5;
          const blackScore = winner === 'b' ? 1 : winner === 'w' ? 0 : 0.5;
          const whiteNew = calculateElo(whiteRating, blackRating, whiteScore);
          const blackNew = calculateElo(blackRating, whiteRating, blackScore);
          ratingUpdate = { whiteNew, blackNew };
          tx.update(doc(db, 'users', data.whiteId), {
            rating: whiteNew,
            updatedAt: serverTimestamp()
          });
          if (data.blackId) {
            tx.update(doc(db, 'users', data.blackId), {
              rating: blackNew,
              updatedAt: serverTimestamp()
            });
          }
        }
        tx.update(gameRef, {
          fen: currentGame.fen(),
          moveHistory: nextHistory,
          lastMove: { from, to, san: moveResult.san || null, by: user.uid },
          status: nextStatus,
          result,
          winner,
          whiteRatingAfter: ratingUpdate?.whiteNew ?? null,
          blackRatingAfter: ratingUpdate?.blackNew ?? null,
          updatedAt: serverTimestamp()
        });
      });
      setSelectedSquare(null);
      setLegalMoves([]);
    } catch (error) {
      setMatchError(error.message || 'Move failed');
    } finally {
      setMovePending(false);
    }
  };

  const resetPractice = () => {
    setGame(createNewGame());
    setMoveHistory([]);
    setSelectedSquare(null);
    setLegalMoves([]);
    setAiThinking(false);
    setAiError('');
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
      const opponentColor = playerColor === 'w' ? 'b' : 'w';
      await updateDoc(doc(db, GAMES_COLLECTION, gameId), {
        status: 'abandoned',
        winner: opponentColor,
        result: `${formatTurn(opponentColor)} wins by forfeit`,
        updatedAt: serverTimestamp()
      });
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
        return `King captured. ${formatTurn(kingWinner)} wins.`;
      }
      if (game.isCheckmateRider()) {
        return `Checkmate. ${formatTurn(game.turn() === 'w' ? 'b' : 'w')} wins.`;
      }
      if (game.isStalemateRider()) return 'Stalemate.';
      return `${formatTurn(game.turn())} to move.`;
    }
    if (!gameData) return 'Loading game...';
    if (gameData.status === 'waiting') return 'Waiting for an opponent...';
    if (gameData.status === 'completed' || gameData.status === 'draw') {
      return gameData.result || 'Game ended.';
    }
    if (gameData.status === 'abandoned') return gameData.result || 'Game abandoned.';
    return `${formatTurn(game.turn())} to move.`;
  };

  return (
    <div className="app">
      <header className="top-bar">
        <div className="brand">
          <p className="brand-kicker">ChessRider Arena</p>
          <h1>ChessRider</h1>
          <p className="brand-subtitle">Play the ChessRider rule online.</p>
        </div>
        <div className="auth-panel">
          {!authReady ? (
            <span className="auth-status">Connecting...</span>
          ) : !firebaseEnabled ? (
            <span className="auth-status">Local mode (Firebase not configured).</span>
          ) : user ? (
            <>
              <div className="auth-user">
                <span className="auth-name">{displayName}</span>
                <span className="auth-meta">Rating {rating}</span>
                <span className="auth-meta">{user.isAnonymous ? 'Anonymous' : 'Google'}</span>
              </div>
              <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <div className="auth-actions">
              <button className="btn btn-primary" onClick={signInWithGoogle}>Sign in with Google</button>
              <button className="btn btn-ghost" onClick={signInAnonymously}>Play Anonymously</button>
            </div>
          )}
        </div>
      </header>

      <main className="layout">
        <section className="board-panel">
          <div className="board-header">
            <div>
              <h2>{isOnline ? 'Live Match' : 'Practice Board'}</h2>
              <p className="muted">{gameStatusText()}</p>
            </div>
            {isOnline && playerColor && (
              <div className="player-chip">
                You are <strong>{formatTurn(playerColor)}</strong>
              </div>
            )}
          </div>
          {game.getWinnerByKingCapture() && (
            <div className="victory-banner">
              King captured. {formatTurn(game.getWinnerByKingCapture())} wins.
            </div>
          )}
          {!game.getWinnerByKingCapture() && game.isCheckmateRider() && (
            <div className="victory-banner">
              Checkmate. {formatTurn(game.turn() === 'w' ? 'b' : 'w')} wins.
            </div>
          )}
          {!game.getWinnerByKingCapture() && game.isStalemateRider() && (
            <div className="victory-banner">
              Stalemate. Draw.
            </div>
          )}
          {game.isCheckRider() && !game.getWinnerByKingCapture() && !game.isCheckmateRider() && (
            <div className="check-alert">
              Check! Your king can be captured.
            </div>
          )}

          <ChessBoard
            game={game}
            selectedSquare={selectedSquare}
            legalMoves={legalMoves}
            onSquareClick={handleSquareClick}
            theme={theme}
            pieceStyle={pieceStyle}
          />

          {matchError && <p className="error-text">{matchError}</p>}
        </section>

        <aside className="sidebar">
          <div className="panel">
            <h3>Matchmaking</h3>
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
                  <button className="btn btn-ghost" onClick={cancelMatchmaking}>Cancel Search</button>
                ) : (
                  <button className="btn btn-ghost" onClick={leaveMatch}>Leave Match</button>
                )}
              </>
            ) : (
              <>
                {user ? (
                  <button className="btn btn-primary" onClick={startMatchmaking}>Find Match</button>
                ) : (
                  <p className="muted">
                    {firebaseEnabled
                      ? 'Sign in to find an online match.'
                      : 'Local mode: online matchmaking is disabled.'}
                  </p>
                )}
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setAiEnabled(true);
                    resetPractice();
                  }}
                >
                  Play with AI
                </button>
              </>
            )}
          </div>

          <div className="panel">
            <h3>Custom Games</h3>
            {!user ? (
              <p className="muted">Sign in to create or join a game.</p>
            ) : isOnline ? (
              <p className="muted">Leave the current match to join another.</p>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={createCustomGame}>Create Game</button>
                <div className="theme-select">
                  <label htmlFor="join-game" className="muted">Join by game ID</label>
                  <input
                    id="join-game"
                    className="select"
                    type="text"
                    value={joinGameId}
                    onChange={(event) => setJoinGameId(event.target.value)}
                    placeholder="Paste game id"
                  />
                  <button className="btn btn-primary" onClick={() => joinCustomGame(joinGameId)}>
                    Join Game
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
                  <p className="muted">No open games yet.</p>
                )}
              </>
            )}
          </div>

          <div className="panel">
            <h3>Controls</h3>
            <button className="btn btn-ghost" onClick={resetPractice} disabled={isOnline}>New Practice Game</button>
            {aiEnabled && !isOnline && (
              <p className="muted">AI opponent: bot_engine.py ({aiDifficulty.toUpperCase()}).</p>
            )}
            {aiEnabled && aiThinking && (
              <p className="muted">AI thinking...</p>
            )}
            {aiEnabled && aiError && (
              <p className="error-text">{aiError}</p>
            )}
            <div className="theme-select">
              <label htmlFor="theme-choice" className="muted">Board style</label>
              <select
                id="theme-choice"
                className="select"
                value={theme}
                onChange={(event) => setTheme(event.target.value)}
              >
                <option value="classic">Classic Walnut</option>
                <option value="slate">Slate</option>
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
                <option value="svg">PyChess Classic (Cburnett)</option>
                <option value="minimal">Minimal Letters</option>
              </select>
            </div>
            <p className="muted">
              Online games follow the ChessRider rule: any piece near a friendly knight may jump
              over one blocker on its normal path.
            </p>
          </div>

          <div className="panel">
            <h3>Move History</h3>
            <div className="moves-list">
              {moveHistory.length === 0 ? (
                <p className="muted">No moves yet.</p>
              ) : (
                <ol>
                  {moveHistory.map((move, index) => (
                    <li key={`${move}-${index}`}>{index + 1}. {move}</li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className="panel manual-panel">
            <h3>Introduction & Manual</h3>
            <p className="manual-intro">
              ChessRider keeps normal chess movement, but pieces can jump when supported by friendly knights.
            </p>
            <div className="manual-grid">
              {manualCards.map((card) => (
                <article key={card.title} className="manual-card">
                  <img src={card.image} alt={card.alt} className="manual-image" />
                  <h4>{card.title}</h4>
                  <p className="muted">{card.body}</p>
                </article>
              ))}
            </div>
            <div className="manual-gif" role="img" aria-label="Animated example of a rook jumping one blocker.">
              <div className="manual-gif-track">
                <div className="manual-square manual-square--from">R</div>
                <div className="manual-square manual-square--blocked">P</div>
                <div className="manual-square" />
                <div className="manual-square manual-square--target">x</div>
                <div className="manual-jumper">R</div>
              </div>
              <p className="muted">Animated demo: one jump over a blocker, then land on a legal square.</p>
            </div>
          </div>

          <div className="panel">
            <h3>About the Variant</h3>
            <p className="muted">
              Pieces adjacent to or a knight's move away from a friendly knight can jump over one
              blocking piece and continue moving along their normal path.
            </p>
          </div>
        </aside>
      </main>

      <footer className="footer">
        <span>ChessRider</span>
        <span>Rule set: ChessRider</span>
      </footer>
    </div>
  );
}


