import React, { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, firebaseEnabled } from '../../utils/firebase.js';
import {
  DEFAULT_TEXT_AI_BASE_URL,
  isBotUid,
  loadBotChatMessages,
  requestTextAiReply,
  saveBotChatMessages,
} from '../../utils/textAi.js';

export default function DmConversation({
  chatId,
  partnerUid,
  partnerName,
  currentUser,
  currentUserName,
  onBack,
}) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const isBotConversation = isBotUid(partnerUid);

  useEffect(() => {
    if (isBotConversation) {
      setMessages(loadBotChatMessages(chatId));
      return undefined;
    }
    if (!firebaseEnabled || !db || !chatId) return undefined;
    const messagesQuery = query(
      collection(db, 'dms', chatId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    return onSnapshot(messagesQuery, (snap) => {
      setMessages(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      if (currentUser && db) {
        setDoc(doc(db, 'dms', chatId), {
          [`lastReadAt_${currentUser.uid}`]: serverTimestamp(),
        }, { merge: true }).catch(() => {});
      }
    });
  }, [chatId, currentUser, isBotConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isBotConversation) return;
    if (!firebaseEnabled || !db || !chatId || !currentUser) return;
    setDoc(doc(db, 'dms', chatId), {
      participants: chatId.split('_'),
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
  }, [chatId, currentUser, isBotConversation]);

  const handleSend = async () => {
    if (!currentUser || !text.trim()) return;
    setSending(true);
    setError('');
    const messageText = text.trim();
    setText('');

    if (isBotConversation) {
      const nextMessages = [
        ...messages,
        {
          id: `${Date.now()}-user`,
          text: messageText,
          senderId: currentUser.uid,
          senderName: currentUserName,
          createdAt: Date.now(),
        },
      ];
      setMessages(nextMessages);
      saveBotChatMessages(chatId, nextMessages);
      try {
        const history = nextMessages.map((message) => ({
          role: message.senderId === currentUser.uid ? 'user' : 'assistant',
          content: message.text,
        }));
        const reply = await requestTextAiReply({ history });
        const repliedMessages = [
          ...nextMessages,
          {
            id: `${Date.now()}-bot`,
            text: reply,
            senderId: partnerUid,
            senderName: partnerName,
            createdAt: Date.now(),
          },
        ];
        setMessages(repliedMessages);
        saveBotChatMessages(chatId, repliedMessages);
      } catch (sendError) {
        setError(sendError?.message || `Text AI is unavailable at ${DEFAULT_TEXT_AI_BASE_URL}`);
      } finally {
        setSending(false);
      }
      return;
    }

    if (!db) {
      setSending(false);
      setError('Direct messages are unavailable until Firebase is configured.');
      return;
    }

    try {
      await addDoc(collection(db, 'dms', chatId, 'messages'), {
        text: messageText,
        senderId: currentUser.uid,
        senderName: currentUserName,
        createdAt: serverTimestamp(),
      });
      setDoc(doc(db, 'dms', chatId), {
        lastMessageAt: serverTimestamp(),
        [`lastReadAt_${currentUser.uid}`]: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="dm-conversation">
      <div className="dm-header">
        <button className="btn btn-ghost dm-back-btn" onClick={onBack}>← Back</button>
        <span className="dm-partner-name">{partnerName}</span>
      </div>
      <div className="dm-messages">
        {messages.length === 0 && (
          <p className="muted dm-empty">Say hello!</p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`dm-message${message.senderId === currentUser?.uid ? ' dm-message--own' : ''}`}
          >
            {message.senderId !== currentUser?.uid && (
              <span className="dm-sender">{message.senderName}</span>
            )}
            <span className="dm-bubble">{message.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {error && <p className="error-text" style={{ margin: '0 12px 8px' }}>{error}</p>}
      <div className="dm-input-row">
        <input
          className="select dm-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type a message..."
          maxLength={500}
          disabled={sending}
        />
        <button
          className="btn btn-primary dm-send-btn"
          onClick={handleSend}
          disabled={sending || !text.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
