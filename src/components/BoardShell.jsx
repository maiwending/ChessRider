import React, { Suspense, lazy } from 'react';
import ChessBoard from './ChessBoard.jsx';
import PlayerBar from './PlayerBar.jsx';
import wn from '../assets/chess/cburnett/Chess_nlt45.svg';
import wb from '../assets/chess/cburnett/Chess_blt45.svg';
import wr from '../assets/chess/cburnett/Chess_rlt45.svg';
import wq from '../assets/chess/cburnett/Chess_qlt45.svg';
import bn from '../assets/chess/cburnett/Chess_ndt45.svg';
import bb from '../assets/chess/cburnett/Chess_bdt45.svg';
import br from '../assets/chess/cburnett/Chess_rdt45.svg';
import bq from '../assets/chess/cburnett/Chess_qdt45.svg';

const GameChat = lazy(() => import('./GameChat.jsx'));

const promotionSprites = {
  w: { q: wq, r: wr, b: wb, n: wn },
  b: { q: bq, r: br, b: bb, n: bn },
};

export default function BoardShell({
  boardView,
  board3d,
  isOnline,
  aiEnabled,
  playerColor,
  aiDifficulty,
  gameStatusText,
  incomingChallenge,
  onAcceptChallenge,
  onDeclineChallenge,
  victoryText,
  showCheckAlert,
  topPlayer,
  bottomPlayer,
  formatClock,
  game,
  selectedSquare,
  legalMoves,
  onSquareClick,
  theme,
  customThemeVars,
  boardCornerRadius,
  pieceStyle,
  lastMove,
  flipped,
  inCheck,
  moveAnimation,
  pendingPromotion,
  onChoosePromotion,
  onCancelPromotion,
  onFlipBoard,
  onNewGame,
  onStopAi,
  onLeaveMatch,
  matchError,
  aiThinking,
  aiError,
  isBotOnlineGame,
  gameData,
  gameId,
  user,
  displayName,
  liveVoiceChat,
}) {
  return (
    <section className={`board-section${board3d ? ' board-section--3d' : ''}${boardView === 'realistic' ? ' board-section--realistic' : ''}`}>
      <div className="board-header">
        <div className="game-mode-badge">
          <span className={`game-mode-dot${isOnline ? ' game-mode-dot--live' : ''}`} />
          {isOnline ? 'Live Match' : aiEnabled ? 'vs AI' : 'Practice'}
        </div>
        <span className="game-status-text">{gameStatusText}</span>
        {isOnline && playerColor && (
          <div className="player-chip">{playerColor === 'w' ? 'White' : 'Black'}</div>
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

      {incomingChallenge && !isOnline && (
        <div className="challenge-toast">
          <p className="challenge-toast-text">
            <strong>{incomingChallenge.fromName}</strong> challenged you to a game!
          </p>
          <div className="challenge-toast-actions">
            <button
              className="btn btn-primary"
              style={{ padding: '0.3rem 0.9rem', fontSize: '0.82rem' }}
              onClick={onAcceptChallenge}
            >
              Accept
            </button>
            <button
              className="btn btn-ghost"
              style={{ padding: '0.3rem 0.9rem', fontSize: '0.82rem' }}
              onClick={onDeclineChallenge}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {victoryText && <div className="victory-banner">{victoryText}</div>}
      {showCheckAlert && <div className="check-alert">Check!</div>}

      <PlayerBar position="top" formatClock={formatClock} {...topPlayer} />

      <ChessBoard
        game={game}
        selectedSquare={selectedSquare}
        legalMoves={legalMoves}
        onSquareClick={onSquareClick}
        theme={theme}
        customThemeVars={customThemeVars}
        boardCornerRadius={boardCornerRadius}
        pieceStyle={pieceStyle}
        lastMove={lastMove}
        flipped={flipped}
        inCheck={inCheck}
        board3d={board3d}
        boardView={boardView}
        moveAnimation={moveAnimation}
      />

      {pendingPromotion && (
        <div className="promotion-picker" role="dialog" aria-label="Choose promotion piece">
          <p className="promotion-picker__title">Promote pawn to</p>
          <div className="promotion-picker__options">
            {[
              { key: 'q', label: 'Queen' },
              { key: 'r', label: 'Rook' },
              { key: 'b', label: 'Bishop' },
              { key: 'n', label: 'Knight' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                className="promotion-picker__option"
                onClick={() => onChoosePromotion(option.key)}
              >
                <img
                  className="promotion-picker__icon"
                  src={promotionSprites[pendingPromotion.color || 'w'][option.key]}
                  alt=""
                  draggable="false"
                />
                <span className="promotion-picker__label">{option.label}</span>
              </button>
            ))}
          </div>
          <button type="button" className="promotion-picker__cancel" onClick={onCancelPromotion}>
            Cancel
          </button>
        </div>
      )}

      <PlayerBar position="bottom" formatClock={formatClock} {...bottomPlayer} />

      <div className="board-actions">
        <button className="btn btn-ghost" onClick={onFlipBoard} title="Flip board">
          ⇅ Flip
        </button>
        <button className="btn btn-ghost" onClick={onNewGame} disabled={isOnline} title="New game">
          + New
        </button>
        {aiEnabled && (
          <button className="btn btn-ghost" onClick={onStopAi}>
            Stop AI
          </button>
        )}
        {isOnline && (
          <button className="btn btn-danger" onClick={onLeaveMatch}>
            Resign
          </button>
        )}
      </div>

      {matchError && <p className="error-text">{matchError}</p>}

      {aiThinking && !isBotOnlineGame && (
        <div className="ai-thinking-indicator">
          <div className="thinking-spinner" />
          <span className="thinking-text">AI is thinking...</span>
        </div>
      )}
      {aiError && <p className="error-text">{aiError}</p>}

      {isOnline && gameData?.status === 'active' && gameId && user && (
        <Suspense fallback={<p className="muted">Loading chat...</p>}>
          <GameChat
            gameId={gameId}
            currentUser={user}
            currentUserName={displayName}
            liveVoiceChat={liveVoiceChat}
            playerColor={playerColor}
          />
        </Suspense>
      )}
    </section>
  );
}
