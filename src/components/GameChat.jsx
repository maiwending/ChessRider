import React, { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../utils/firebase.js';

export default function GameChat({ gameId, currentUser, currentUserName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    const q = query(
      collection(db, 'games', gameId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [gameId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !currentUser) return;
    setInput('');
    await addDoc(collection(db, 'games', gameId, 'messages'), {
      uid: currentUser.uid,
      displayName: currentUserName || 'Anonymous',
      text,
      createdAt: serverTimestamp(),
    });
  };

  return (
    <div className="game-chat">
      <div className="game-chat__header">Game Chat</div>
      <div className="game-chat__messages">
        {messages.length === 0 && (
          <span className="game-chat__empty">No messages yet. Say hello!</span>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`game-chat__message${msg.uid === currentUser?.uid ? ' game-chat__message--own' : ''}`}
          >
            <span className="game-chat__message-name">{msg.displayName}:</span>
            <span className="game-chat__message-text">{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="game-chat__input-row">
        <input
          className="select"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Type a message..."
          maxLength={200}
        />
        <button className="btn btn-primary" onClick={handleSend} disabled={!input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
