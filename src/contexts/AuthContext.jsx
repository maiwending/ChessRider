import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInAnonymously as firebaseSignInAnonymously,
  signInWithPopup,
  signOut as firebaseSignOut
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { auth, db, firebaseEnabled, googleProvider } from '../utils/firebase.js';
import { ensureUniqueDisplayName, hasMatchingUsernameClaim } from '../utils/usernames.js';

const AuthContext = createContext(null);

const getDisplayName = (user) => {
  if (!user) return 'Guest';
  if (user.displayName) return user.displayName;
  if (user.isAnonymous) return `Guest-${user.uid.slice(0, 6)}`;
  return user.email || `Player-${user.uid.slice(0, 6)}`;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    if (!firebaseEnabled || !auth) {
      setAuthReady(true);
      setProfileReady(true);
      return undefined;
    }

    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!firebaseEnabled || !db) {
      setProfile(null);
      setProfileReady(true);
      return undefined;
    }

    let unsubscribe = null;
    let unloadCleanup = null;
    let active = true;

    const setupProfile = async () => {
      if (!user) {
        setProfile(null);
        setProfileReady(true);
        return;
      }

      try {
        const profileRef = doc(db, 'users', user.uid);
        const desiredDisplayName = getDisplayName(user);
        const snap = await getDoc(profileRef);
        const existing = snap.exists() ? (snap.data() || {}) : null;
        const profilePatch = {
          uid: user.uid,
          email: user.email || null,
          photoURL: user.photoURL || null,
          isAnonymous: user.isAnonymous,
          updatedAt: serverTimestamp()
        };

        if (!existing || typeof existing.rating !== 'number') {
          profilePatch.rating = 1200;
        }
        if (!existing?.createdAt) {
          profilePatch.createdAt = serverTimestamp();
        }

        let hasValidUsernameClaim = false;
        if (existing?.displayName && existing?.usernameKey) {
          hasValidUsernameClaim = await hasMatchingUsernameClaim({
            db,
            uid: user.uid,
            usernameKey: existing.usernameKey,
            displayName: existing.displayName
          });
        }

        if (!existing || !existing.displayName || !existing.usernameKey || !hasValidUsernameClaim) {
          await ensureUniqueDisplayName({
            db,
            uid: user.uid,
            desiredDisplayName: existing?.displayName || desiredDisplayName,
            fallbackDisplayName: user.isAnonymous
              ? desiredDisplayName
              : (user.email || `Player-${user.uid.slice(0, 6)}`),
            previousUsernameKey: existing?.usernameKey || null,
            profilePatch
          });
        } else {
          await setDoc(profileRef, profilePatch, { merge: true });
        }

        // Mark user as online
        await setDoc(profileRef, { online: true, lastSeen: serverTimestamp() }, { merge: true });

        if (!active) return;

        // Mark offline on tab close (attached after active check so ref is accessible in cleanup)
        const handleUnload = () => {
          setDoc(profileRef, { online: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
        };
        window.addEventListener('beforeunload', handleUnload);
        unloadCleanup = () => window.removeEventListener('beforeunload', handleUnload);

        unsubscribe = onSnapshot(profileRef, (docSnap) => {
          if (!docSnap.exists()) {
            setProfile(null);
            setProfileReady(true);
            return;
          }
          setProfile({ id: docSnap.id, ...docSnap.data() });
          setProfileReady(true);
        });
      } catch (error) {
        console.warn('Auth profile setup failed:', error?.message || error);
        if (active) {
          setProfile(null);
          setProfileReady(true);
        }
      }
    };

    setupProfile();

    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
      if (unloadCleanup) unloadCleanup();
      // Mark offline when signing out / user changes
      if (user && db) {
        setDoc(doc(db, 'users', user.uid), { online: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
      }
    };
  }, [user]);

  const firebaseNotReadyError = () =>
    Promise.reject(new Error('Firebase is not configured. Set VITE_FIREBASE_* env vars.'));

  const value = useMemo(() => {
    return {
      user,
      authReady,
      profile,
      profileReady,
      rating: profile?.rating ?? 1200,
      displayName: profile?.displayName || getDisplayName(user),
      signInWithGoogle: () => {
        if (!firebaseEnabled || !auth || !googleProvider) return firebaseNotReadyError();
        return signInWithPopup(auth, googleProvider);
      },
      signInWithEmail: (email, password) => {
        if (!firebaseEnabled || !auth) return firebaseNotReadyError();
        return signInWithEmailAndPassword(auth, email, password);
      },
      signUpWithEmail: (email, password) => {
        if (!firebaseEnabled || !auth) return firebaseNotReadyError();
        return createUserWithEmailAndPassword(auth, email, password);
      },
      signInAnonymously: () => {
        if (!firebaseEnabled || !auth) return firebaseNotReadyError();
        return firebaseSignInAnonymously(auth);
      },
      signOut: async () => {
        if (!firebaseEnabled || !auth) return Promise.resolve();
        if (user && db) {
          await setDoc(doc(db, 'users', user.uid), { online: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
        }
        return firebaseSignOut(auth);
      }
    };
  }, [user, authReady, profile, profileReady]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
