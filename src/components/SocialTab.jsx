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
  updateDoc,
  where
} from 'firebase/firestore';
import { db, firebaseEnabled } from '../utils/firebase.js';

// ─── Announcements ────────────────────────────────────────────────────────────

function AnnouncementsSection({ currentUser, currentUserName, currentUserPhotoURL }) {
  const [announcements, setAnnouncements] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (!firebaseEnabled || !db) return;
    const q = query(
      collection(db, 'announcements'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(q, (snap) => {
      setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const handleSend = async () => {
    if (!currentUser || !text.trim() || !db) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        text: text.trim(),
        authorId: currentUser.uid,
        authorName: currentUserName,
        authorPhotoURL: currentUserPhotoURL || null,
        createdAt: serverTimestamp()
      });
      setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="social-section">
      <h4 className="social-section-title">Lobby Announcements</h4>
      <div className="announcements-list" ref={listRef}>
        {announcements.length === 0 && <p className="muted">No announcements yet.</p>}
        {[...announcements].reverse().map((a) => (
          <div
            key={a.id}
            className={`ann-item${a.authorId === currentUser?.uid ? ' ann-item--own' : ''}`}
          >
            <div className="ann-row">
              <span className="ann-author">{a.authorName || 'Player'}</span>
              {a.createdAt?.toDate && (
                <span className="ann-time">
                  {a.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <p className="ann-text">{a.text}</p>
          </div>
        ))}
      </div>
      {currentUser ? (
        <div className="ann-input-row">
          <input
            className="select ann-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Post to lobby..."
            maxLength={200}
          />
          <button
            className="btn btn-primary ann-send-btn"
            onClick={handleSend}
            disabled={sending || !text.trim()}
          >
            Post
          </button>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: '0.85rem' }}>Sign in to post announcements.</p>
      )}
    </div>
  );
}

// ─── DM Conversation ──────────────────────────────────────────────────────────

function DmConversation({ chatId, partnerName, currentUser, currentUserName, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!firebaseEnabled || !db || !chatId) return;
    const q = query(
      collection(db, 'dms', chatId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Ensure the parent DM doc exists
  useEffect(() => {
    if (!firebaseEnabled || !db || !chatId || !currentUser) return;
    setDoc(doc(db, 'dms', chatId), {
      participants: chatId.split('_'),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }, [chatId, currentUser]);

  const handleSend = async () => {
    if (!currentUser || !text.trim() || !db) return;
    setSending(true);
    const msg = text.trim();
    setText('');
    try {
      await addDoc(collection(db, 'dms', chatId, 'messages'), {
        text: msg,
        senderId: currentUser.uid,
        senderName: currentUserName,
        createdAt: serverTimestamp()
      });
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
        {messages.map((m) => (
          <div
            key={m.id}
            className={`dm-message${m.senderId === currentUser?.uid ? ' dm-message--own' : ''}`}
          >
            {m.senderId !== currentUser?.uid && (
              <span className="dm-sender">{m.senderName}</span>
            )}
            <span className="dm-bubble">{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="dm-input-row">
        <input
          className="select dm-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
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

// ─── Friends Section ──────────────────────────────────────────────────────────

function FriendsSection({ currentUser, currentUserName, onOpenDm, onPlayerClick }) {
  const [outgoing, setOutgoing] = useState([]);
  const [incoming, setIncoming] = useState([]);

  useEffect(() => {
    if (!firebaseEnabled || !db || !currentUser) return;
    const outQ = query(collection(db, 'friend_requests'), where('from', '==', currentUser.uid));
    const inQ = query(collection(db, 'friend_requests'), where('to', '==', currentUser.uid));
    const unsub1 = onSnapshot(outQ, (snap) =>
      setOutgoing(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsub2 = onSnapshot(inQ, (snap) =>
      setIncoming(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => { unsub1(); unsub2(); };
  }, [currentUser]);

  const friends = [
    ...outgoing.filter((r) => r.status === 'accepted').map((r) => ({ uid: r.to, name: r.toName })),
    ...incoming.filter((r) => r.status === 'accepted').map((r) => ({ uid: r.from, name: r.fromName }))
  ];
  const pendingIn = incoming.filter((r) => r.status === 'pending');

  const acceptRequest = async (reqId) => {
    if (!db) return;
    await updateDoc(doc(db, 'friend_requests', reqId), { status: 'accepted' });
  };

  const getChatId = (uid) => [currentUser.uid, uid].sort().join('_');

  return (
    <div className="social-section">
      <h4 className="social-section-title">Friends</h4>
      {pendingIn.length > 0 && (
        <div className="friend-requests-inbox">
          <p className="muted" style={{ marginBottom: '0.4rem', fontSize: '0.85rem' }}>Friend Requests:</p>
          {pendingIn.map((req) => (
            <div key={req.id} className="friend-request-item">
              <span className="friend-request-name">{req.fromName || 'Player'}</span>
              <button className="btn btn-primary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }} onClick={() => acceptRequest(req.id)}>
                Accept
              </button>
            </div>
          ))}
        </div>
      )}
      {friends.length === 0 && pendingIn.length === 0 && (
        <p className="muted">No friends yet. Click a player in the leaderboard to add them.</p>
      )}
      {friends.map((f) => (
        <div key={f.uid} className="friend-item">
          <button className="friend-name-btn" onClick={() => onPlayerClick({ id: f.uid })}>
            {f.name || 'Player'}
          </button>
          <button
            className="btn btn-ghost"
            style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
            onClick={() => onOpenDm({ chatId: getChatId(f.uid), partnerUid: f.uid, partnerName: f.name || 'Player' })}
          >
            Message
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Social Tab ──────────────────────────────────────────────────────────

export default function SocialTab({ currentUser, currentUserName, currentUserPhotoURL, onPlayerClick }) {
  const [activeDm, setActiveDm] = useState(null);

  return (
    <div className="tab-panel social-tab">
      {activeDm ? (
        <DmConversation
          chatId={activeDm.chatId}
          partnerName={activeDm.partnerName}
          currentUser={currentUser}
          currentUserName={currentUserName}
          onBack={() => setActiveDm(null)}
        />
      ) : (
        <>
          <AnnouncementsSection
            currentUser={currentUser}
            currentUserName={currentUserName}
            currentUserPhotoURL={currentUserPhotoURL}
          />
          <FriendsSection
            currentUser={currentUser}
            currentUserName={currentUserName}
            onOpenDm={setActiveDm}
            onPlayerClick={onPlayerClick}
          />
        </>
      )}
    </div>
  );
}
