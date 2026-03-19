import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
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
    let active = true;

    const setupProfile = async () => {
      if (!user) {
        setProfile(null);
        setProfileReady(true);
        return;
      }

      try {
        const profileRef = doc(db, 'users', user.uid);
        const baseProfile = {
          uid: user.uid,
          displayName: getDisplayName(user),
          email: user.email || null,
          photoURL: user.photoURL || null,
          isAnonymous: user.isAnonymous,
          updatedAt: serverTimestamp()
        };

        const snap = await getDoc(profileRef);
        if (!snap.exists()) {
          await setDoc(profileRef, {
            ...baseProfile,
            rating: 1200,
            createdAt: serverTimestamp()
          });
        } else {
          const existing = snap.data() || {};
          const patch = {
            ...baseProfile,
          };

          // Never reset rating for returning users.
          if (typeof existing.rating !== 'number') {
            patch.rating = 1200;
          }
          if (!existing.createdAt) {
            patch.createdAt = serverTimestamp();
          }

          await setDoc(profileRef, patch, { merge: true });
        }

        if (!active) return;
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
      signInAnonymously: () => {
        if (!firebaseEnabled || !auth) return firebaseNotReadyError();
        return firebaseSignInAnonymously(auth);
      },
      signOut: () => {
        if (!firebaseEnabled || !auth) return Promise.resolve();
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
