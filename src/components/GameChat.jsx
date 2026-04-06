import React, { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../utils/firebase.js';

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function GameChat({
  gameId,
  currentUser,
  currentUserName,
  liveVoiceChat = false,
  playerColor,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Voice chat off');
  const [voiceError, setVoiceError] = useState('');
  const bottomRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerRef = useRef(null);
  const currentSessionIdRef = useRef(null);
  const isCallerRef = useRef(false);
  const sessionUnsubsRef = useRef([]);
  const activeCurrentVoiceUnsubRef = useRef(null);
  const addedCandidateIdsRef = useRef(new Set());

  useEffect(() => {
    const q = query(
      collection(db, 'games', gameId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [gameId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const stopSessionListeners = () => {
    sessionUnsubsRef.current.forEach((unsub) => unsub?.());
    sessionUnsubsRef.current = [];
    addedCandidateIdsRef.current.clear();
  };

  const teardownPeer = (stopLocalTracks = false) => {
    stopSessionListeners();
    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.ontrack = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (stopLocalTracks && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setVoiceConnected(false);
  };

  const leaveVoice = async ({ clearSession = true } = {}) => {
    const currentVoiceRef = doc(db, 'games', gameId, 'voice', 'current');
    const sessionId = currentSessionIdRef.current;
    teardownPeer(true);
    activeCurrentVoiceUnsubRef.current?.();
    activeCurrentVoiceUnsubRef.current = null;
    setVoiceEnabled(false);
    setMicMuted(false);
    setVoiceStatus('Voice chat off');
    setVoiceError('');

    if (clearSession && sessionId) {
      try {
        const snap = await getDoc(currentVoiceRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.sessionId === sessionId && data.callerUid === currentUser?.uid) {
            await deleteDoc(currentVoiceRef);
          } else if (data.sessionId === sessionId && data.status !== 'ended') {
            await updateDoc(currentVoiceRef, {
              status: 'waiting',
              joinedUid: null,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (error) {
        console.warn('Voice cleanup failed:', error?.message || error);
      }
    }

    currentSessionIdRef.current = null;
    isCallerRef.current = false;
  };

  const ensureLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    localStreamRef.current = stream;
    return stream;
  };

  const attachPeerCore = (pc) => {
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteAudioRef.current && remoteStream) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        setVoiceConnected(true);
        setVoiceStatus('Voice connected');
      } else if (state === 'connecting') {
        setVoiceStatus('Connecting voice...');
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        setVoiceConnected(false);
        if (voiceEnabled) setVoiceStatus('Voice disconnected');
      }
    };
  };

  const subscribeToCandidates = (candidatesRef, pc) => {
    return onSnapshot(candidatesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const key = `${candidatesRef.path}:${change.doc.id}`;
        if (addedCandidateIdsRef.current.has(key)) return;
        addedCandidateIdsRef.current.add(key);
        const data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data)).catch(() => {});
      });
    });
  };

  const startCallerSession = async () => {
    const stream = await ensureLocalStream();
    const currentVoiceRef = doc(db, 'games', gameId, 'voice', 'current');
    const sessionRef = doc(collection(db, 'games', gameId, 'voiceSessions'));
    const pc = new RTCPeerConnection(rtcConfig);
    peerRef.current = pc;
    currentSessionIdRef.current = sessionRef.id;
    isCallerRef.current = true;
    attachPeerCore(pc);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const callerCandidatesRef = collection(sessionRef, 'callerCandidates');
    const calleeCandidatesRef = collection(sessionRef, 'calleeCandidates');
    pc.onicecandidate = (event) => {
      if (event.candidate) addDoc(callerCandidatesRef, event.candidate.toJSON());
    };

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
    });
    await pc.setLocalDescription(offer);

    await setDoc(sessionRef, {
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
      callerUid: currentUser.uid,
      callerName: currentUserName || 'Anonymous',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await setDoc(currentVoiceRef, {
      sessionId: sessionRef.id,
      callerUid: currentUser.uid,
      callerName: currentUserName || 'Anonymous',
      status: 'calling',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    sessionUnsubsRef.current.push(
      onSnapshot(sessionRef, async (snap) => {
        const data = snap.data();
        if (!data || !data.answer || pc.currentRemoteDescription) return;
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }),
      subscribeToCandidates(calleeCandidatesRef, pc)
    );

    setVoiceStatus('Waiting for opponent to join voice...');
  };

  const joinCallerSession = async (sessionId, callerUid) => {
    if (currentSessionIdRef.current === sessionId && peerRef.current) return;
    teardownPeer(false);
    const stream = await ensureLocalStream();
    const currentVoiceRef = doc(db, 'games', gameId, 'voice', 'current');
    const sessionRef = doc(db, 'games', gameId, 'voiceSessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) return;
    const sessionData = sessionSnap.data();
    if (!sessionData.offer) return;

    const pc = new RTCPeerConnection(rtcConfig);
    peerRef.current = pc;
    currentSessionIdRef.current = sessionId;
    isCallerRef.current = false;
    attachPeerCore(pc);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const callerCandidatesRef = collection(sessionRef, 'callerCandidates');
    const calleeCandidatesRef = collection(sessionRef, 'calleeCandidates');
    pc.onicecandidate = (event) => {
      if (event.candidate) addDoc(calleeCandidatesRef, event.candidate.toJSON());
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sessionData.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await updateDoc(sessionRef, {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
      answeredBy: currentUser.uid,
      updatedAt: serverTimestamp(),
    });

    await updateDoc(currentVoiceRef, {
      status: 'connected',
      joinedUid: currentUser.uid,
      joinedCallerUid: callerUid,
      updatedAt: serverTimestamp(),
    });

    sessionUnsubsRef.current.push(
      subscribeToCandidates(callerCandidatesRef, pc)
    );

    setVoiceStatus('Connecting voice...');
  };

  useEffect(() => {
    if (!liveVoiceChat || !voiceEnabled || !gameId || !currentUser) return undefined;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      setVoiceError('Voice streaming is not supported in this browser.');
      return undefined;
    }

    const currentVoiceRef = doc(db, 'games', gameId, 'voice', 'current');
    activeCurrentVoiceUnsubRef.current?.();
    activeCurrentVoiceUnsubRef.current = onSnapshot(currentVoiceRef, async (snap) => {
      try {
        if (!snap.exists()) {
          if (playerColor === 'w' && !peerRef.current) {
            await startCallerSession();
          } else {
            setVoiceStatus('Waiting for white to start voice...');
          }
          return;
        }

        const data = snap.data();
        if (!data?.sessionId) return;
        if (data.callerUid === currentUser.uid) {
          if (currentSessionIdRef.current !== data.sessionId && !peerRef.current) {
            await startCallerSession();
          }
          return;
        }

        await joinCallerSession(data.sessionId, data.callerUid);
      } catch (error) {
        console.error('Voice session error:', error);
        setVoiceError(error?.message || 'Failed to start voice chat.');
        setVoiceStatus('Voice unavailable');
      }
    });

    return () => {
      activeCurrentVoiceUnsubRef.current?.();
      activeCurrentVoiceUnsubRef.current = null;
    };
  }, [currentUser, currentUserName, gameId, liveVoiceChat, playerColor, voiceEnabled]);

  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !micMuted;
      });
    }
  }, [micMuted]);

  useEffect(() => {
    if (liveVoiceChat) return undefined;
    if (voiceEnabled) leaveVoice().catch(() => {});
    return undefined;
  }, [liveVoiceChat, voiceEnabled]);

  useEffect(() => () => {
    leaveVoice().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleVoiceToggle = async () => {
    if (voiceEnabled) {
      await leaveVoice();
      return;
    }
    setVoiceError('');
    setVoiceStatus('Starting voice...');
    setVoiceEnabled(true);
  };

  return (
    <div className="game-chat">
      <div className="game-chat__header">
        <span>Game Chat</span>
        {liveVoiceChat && <span className="game-chat__mode">Peer Voice</span>}
      </div>
      {liveVoiceChat && (
        <div className="game-chat__voice-panel">
          <div className="game-chat__voice-meta">
            <span className={`game-chat__voice-dot${voiceConnected ? ' game-chat__voice-dot--live' : ''}`} />
            <span>{voiceStatus}</span>
          </div>
          <div className="game-chat__voice-actions">
            <button
              className={`btn btn-ghost game-chat__voice-btn${voiceEnabled ? ' game-chat__voice-btn--live' : ''}`}
              onClick={handleVoiceToggle}
              type="button"
            >
              {voiceEnabled ? 'Leave Voice' : 'Join Voice'}
            </button>
            <button
              className="btn btn-ghost game-chat__voice-btn"
              onClick={() => setMicMuted((value) => !value)}
              disabled={!voiceEnabled}
              type="button"
            >
              {micMuted ? 'Unmute Mic' : 'Mute Mic'}
            </button>
          </div>
          <audio ref={remoteAudioRef} autoPlay playsInline />
          {voiceError && <div className="game-chat__speech-status">{voiceError}</div>}
        </div>
      )}
      <div className="game-chat__messages">
        {messages.length === 0 && (
          <span className="game-chat__empty">No messages yet. Say hello!</span>
        )}
        {messages.map((msg) => (
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
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
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
