import React, { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
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
  const [error, setError] = useState('');
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
    setError('');
    try {
      await addDoc(collection(db, 'announcements'), {
        text: text.trim(),
        authorId: currentUser.uid,
        authorName: currentUserName,
        authorPhotoURL: currentUserPhotoURL || null,
        createdAt: serverTimestamp()
      });
      setText('');
    } catch (e) {
      setError(e?.message || 'Failed to post');
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
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '0.4rem 0' }}>{error}</p>}
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
      // Mark as read whenever messages update
      if (currentUser && db) {
        setDoc(doc(db, 'dms', chatId), {
          [`lastReadAt_${currentUser.uid}`]: serverTimestamp()
        }, { merge: true }).catch(() => {});
      }
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
      // Update parent doc: lastMessageAt for unread tracking, lastReadAt for sender
      setDoc(doc(db, 'dms', chatId), {
        lastMessageAt: serverTimestamp(),
        [`lastReadAt_${currentUser.uid}`]: serverTimestamp()
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

function FriendsSection({ currentUser, currentUserName, onOpenDm, onPlayerClick, onChallengeFriend }) {
  const [outgoing, setOutgoing] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [presence, setPresence] = useState({});

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
    ...outgoing.filter((r) => r.status === 'accepted').map((r) => ({ uid: r.to, name: r.toName, reqId: r.id })),
    ...incoming.filter((r) => r.status === 'accepted').map((r) => ({ uid: r.from, name: r.fromName, reqId: r.id }))
  ];
  const pendingIn = incoming.filter((r) => r.status === 'pending');

  // Subscribe to online presence for each friend
  const friendUidKey = friends.map((f) => f.uid).sort().join(',');
  useEffect(() => {
    if (!firebaseEnabled || !db || friends.length === 0) return;
    const unsubs = friends.map((f) =>
      onSnapshot(doc(db, 'users', f.uid), (snap) => {
        if (snap.exists()) {
          setPresence((prev) => ({ ...prev, [f.uid]: Boolean(snap.data().online) }));
        }
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [friendUidKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const acceptRequest = async (reqId) => {
    if (!db) return;
    await updateDoc(doc(db, 'friend_requests', reqId), { status: 'accepted' });
  };

  const declineRequest = async (reqId) => {
    if (!db) return;
    await deleteDoc(doc(db, 'friend_requests', reqId));
  };

  const removeFriend = async (reqId, name) => {
    if (!db) return;
    if (!window.confirm(`Remove ${name} from friends?`)) return;
    await deleteDoc(doc(db, 'friend_requests', reqId));
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
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className="btn btn-primary" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }} onClick={() => acceptRequest(req.id)}>
                  Accept
                </button>
                <button className="btn btn-ghost" style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }} onClick={() => declineRequest(req.id)}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {friends.length === 0 && pendingIn.length === 0 && (
        <p className="muted">No friends yet. Click a player in the leaderboard to add them.</p>
      )}
      {friends.map((f) => (
        <div key={f.uid} className="friend-item">
          <span
            className={`presence-dot${presence[f.uid] ? ' presence-dot--online' : ''}`}
            title={presence[f.uid] ? 'Online' : 'Offline'}
          />
          <button className="friend-name-btn" onClick={() => onPlayerClick({ id: f.uid })}>
            {f.name || 'Player'}
          </button>
          <div className="friend-actions">
            <button
              className="btn btn-ghost"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
              onClick={() => onOpenDm({ chatId: getChatId(f.uid), partnerUid: f.uid, partnerName: f.name || 'Player' })}
            >
              Message
            </button>
            {onChallengeFriend && (
              <button
                className="btn btn-primary"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                onClick={() => onChallengeFriend(f.uid, f.name || 'Player')}
              >
                Challenge
              </button>
            )}
            <button
              className="btn btn-ghost friend-remove-btn"
              onClick={() => removeFriend(f.reqId, f.name || 'Player')}
              title="Remove friend"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Social Tab ──────────────────────────────────────────────────────────

export default function SocialTab({
  currentUser,
  currentUserName,
  currentUserPhotoURL,
  onPlayerClick,
  pendingDm,
  onPendingDmHandled,
  onChallengeFriend
}) {
  const [activeDm, setActiveDm] = useState(null);
  const [subTab, setSubTab] = useState('lobby');

  useEffect(() => {
    if (pendingDm) {
      setActiveDm(pendingDm);
      setSubTab('friends');
      onPendingDmHandled?.();
    }
  }, [pendingDm]);

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
          <div className="social-subtabs">
            <button
              className={`social-subtab-btn${subTab === 'lobby' ? ' active' : ''}`}
              onClick={() => setSubTab('lobby')}
            >
              Lobby
            </button>
            <button
              className={`social-subtab-btn${subTab === 'friends' ? ' active' : ''}`}
              onClick={() => setSubTab('friends')}
            >
              Friends
            </button>
          </div>
          {subTab === 'lobby' && (
            <AnnouncementsSection
              currentUser={currentUser}
              currentUserName={currentUserName}
              currentUserPhotoURL={currentUserPhotoURL}
            />
          )}
          {subTab === 'friends' && (
            <FriendsSection
              currentUser={currentUser}
              currentUserName={currentUserName}
              onOpenDm={setActiveDm}
              onPlayerClick={onPlayerClick}
              onChallengeFriend={onChallengeFriend}
            />
          )}
        </>
      )}
    </div>
  );
}
