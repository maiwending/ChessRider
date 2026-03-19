import React, { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { db, firebaseEnabled } from '../utils/firebase.js';

function Avatar({ photoURL, displayName, size = 'md' }) {
  const initial = (displayName || '?')[0].toUpperCase();
  if (photoURL) {
    return (
      <div className={`avatar avatar--${size}`}>
        <img src={photoURL} alt="" referrerPolicy="no-referrer" />
      </div>
    );
  }
  return (
    <div className={`avatar avatar--${size} avatar--initials`}>
      <span>{initial}</span>
    </div>
  );
}

export default function UserProfileModal({ profileUid, currentUser, currentUserName, onClose, onOpenDm }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIntro, setEditIntro] = useState('');
  const [editPhoto, setEditPhoto] = useState('');
  const [saving, setSaving] = useState(false);
  const [friendStatus, setFriendStatus] = useState(null); // null | 'pending_sent' | 'pending_received' | 'accepted'
  const [friendReqId, setFriendReqId] = useState(null);

  const isOwn = currentUser?.uid === profileUid;

  useEffect(() => {
    if (!firebaseEnabled || !db || !profileUid) return;
    setLoading(true);
    getDoc(doc(db, 'users', profileUid)).then((snap) => {
      if (snap.exists()) setProfile({ id: snap.id, ...snap.data() });
      setLoading(false);
    });
  }, [profileUid]);

  useEffect(() => {
    if (!firebaseEnabled || !db || !currentUser || isOwn) return;
    const checkFriendship = async () => {
      const [outSnap, inSnap] = await Promise.all([
        getDocs(query(collection(db, 'friend_requests'), where('from', '==', currentUser.uid), where('to', '==', profileUid))),
        getDocs(query(collection(db, 'friend_requests'), where('from', '==', profileUid), where('to', '==', currentUser.uid)))
      ]);
      if (!outSnap.empty) {
        const req = outSnap.docs[0];
        setFriendReqId(req.id);
        setFriendStatus(req.data().status === 'accepted' ? 'accepted' : 'pending_sent');
      } else if (!inSnap.empty) {
        const req = inSnap.docs[0];
        setFriendReqId(req.id);
        setFriendStatus(req.data().status === 'accepted' ? 'accepted' : 'pending_received');
      }
    };
    checkFriendship();
  }, [profileUid, currentUser, isOwn]);

  const handleSave = async () => {
    if (!currentUser || !db) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', currentUser.uid), {
        displayName: editName.trim() || profile.displayName,
        introduction: editIntro.trim(),
        photoURL: editPhoto.trim() || profile.photoURL || null,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setProfile(p => ({
        ...p,
        displayName: editName.trim() || p.displayName,
        introduction: editIntro.trim(),
        photoURL: editPhoto.trim() || p.photoURL
      }));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAddFriend = async () => {
    if (!currentUser || !db || !profile) return;
    if (friendStatus === 'pending_received' && friendReqId) {
      await updateDoc(doc(db, 'friend_requests', friendReqId), { status: 'accepted' });
      setFriendStatus('accepted');
      return;
    }
    const docRef = await addDoc(collection(db, 'friend_requests'), {
      from: currentUser.uid,
      fromName: currentUserName,
      to: profileUid,
      toName: profile.displayName || 'Player',
      status: 'pending',
      createdAt: serverTimestamp()
    });
    setFriendReqId(docRef.id);
    setFriendStatus('pending_sent');
  };

  const handleMessage = () => {
    if (!currentUser || !profile) return;
    const chatId = [currentUser.uid, profileUid].sort().join('_');
    onOpenDm({ chatId, partnerUid: profileUid, partnerName: profile.displayName || 'Player' });
    onClose();
  };

  const friendButtonLabel = () => {
    if (friendStatus === 'accepted') return '✓ Friends';
    if (friendStatus === 'pending_sent') return 'Request Sent';
    if (friendStatus === 'pending_received') return 'Accept Request';
    return 'Add Friend';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box profile-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        {loading && <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</p>}
        {!loading && !profile && <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>Player not found.</p>}

        {!loading && profile && !editing && (
          <>
            <div className="profile-header">
              <Avatar photoURL={profile.photoURL} displayName={profile.displayName} size="lg" />
              <div className="profile-meta">
                <h2 className="profile-name">{profile.displayName || 'Player'}</h2>
                <div className="profile-rating-badge">{profile.rating ?? 1200} Elo</div>
                {profile.isAnonymous && <span className="profile-anon-tag">Anonymous</span>}
              </div>
            </div>
            {profile.introduction ? (
              <p className="profile-intro">{profile.introduction}</p>
            ) : isOwn ? (
              <p className="muted profile-intro-empty">Add an introduction to tell others about yourself.</p>
            ) : null}
            <div className="profile-actions">
              {isOwn && (
                <button className="btn btn-ghost" onClick={() => {
                  setEditName(profile.displayName || '');
                  setEditIntro(profile.introduction || '');
                  setEditPhoto(profile.photoURL || '');
                  setEditing(true);
                }}>
                  Edit Profile
                </button>
              )}
              {!isOwn && currentUser && (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={handleAddFriend}
                    disabled={friendStatus === 'accepted' || friendStatus === 'pending_sent'}
                  >
                    {friendButtonLabel()}
                  </button>
                  <button className="btn btn-ghost" onClick={handleMessage}>
                    Message
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {!loading && profile && editing && (
          <div className="profile-edit-form">
            <h3 style={{ marginTop: 0 }}>Edit Profile</h3>
            <label className="edit-label">
              Display Name
              <input
                className="select"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={40}
                placeholder="Your name"
              />
            </label>
            <label className="edit-label">
              Profile Picture URL
              <input
                className="select"
                value={editPhoto}
                onChange={(e) => setEditPhoto(e.target.value)}
                placeholder="https://..."
              />
            </label>
            <label className="edit-label">
              Introduction
              <textarea
                className="select edit-textarea"
                value={editIntro}
                onChange={(e) => setEditIntro(e.target.value)}
                maxLength={300}
                rows={4}
                placeholder="Tell others about yourself..."
              />
            </label>
            <div className="profile-actions">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
