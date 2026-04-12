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
import { db, firebaseEnabled } from '../../utils/firebase.js';

export default function AnnouncementsSection({ currentUser, currentUserName, currentUserPhotoURL }) {
  const [announcements, setAnnouncements] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (!firebaseEnabled || !db) return undefined;
    const announcementsQuery = query(
      collection(db, 'announcements'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    return onSnapshot(announcementsQuery, (snap) => {
      setAnnouncements(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });
  }, []);

  const handleSend = async () => {
    if (!currentUser || !text.trim()) return;
    setSending(true);
    setError('');
    try {
      await addDoc(collection(db, 'announcements'), {
        text: text.trim(),
        authorId: currentUser.uid,
        authorName: currentUserName,
        authorPhotoURL: currentUserPhotoURL || null,
        createdAt: serverTimestamp(),
      });
      setText('');
    } catch (sendError) {
      setError(sendError?.message || 'Failed to post');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="social-section">
      <h4 className="social-section-title">Lobby Announcements</h4>
      <div className="announcements-list" ref={listRef}>
        {announcements.length === 0 && <p className="muted">No announcements yet.</p>}
        {[...announcements].reverse().map((announcement) => (
          <div
            key={announcement.id}
            className={`ann-item${announcement.authorId === currentUser?.uid ? ' ann-item--own' : ''}`}
          >
            <div className="ann-row">
              <span className="ann-author">{announcement.authorName || 'Player'}</span>
              {announcement.createdAt?.toDate && (
                <span className="ann-time">
                  {announcement.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <p className="ann-text">{announcement.text}</p>
          </div>
        ))}
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '0.4rem 0' }}>{error}</p>}
      {currentUser ? (
        <div className="ann-input-row">
          <input
            className="select ann-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
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
