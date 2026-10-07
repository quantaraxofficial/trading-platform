'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signInWithPopup, 
  signOut, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { backendFetch } from "@/lib/backend";

interface AuthContextType {
  user: User | null;
  userData: any | null;
  loading: boolean;
  signInWithGoogle: () => Promise<boolean>; // false when the Google window was closed
  signUp: (email: string, pass: string, name: string, phone: string) => Promise<void>;
  signIn: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  signInWithGoogle: async () => false,
  signUp: async () => {},
  signIn: async () => {},
  logout: async () => {},
});

// Firebase's error codes as messages for the sign-in / sign-up forms
function authErrorMessage(error: any): string {
  switch (error?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials': return 'Incorrect email or password.';
    case 'auth/invalid-email': return "That email address isn't valid.";
    case 'auth/user-disabled': return 'This account has been disabled.';
    case 'auth/too-many-requests': return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/email-already-in-use': return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password': return 'Choose a stronger password (at least 6 characters).';
    case 'auth/network-request-failed': return "Couldn't reach the sign-in service. Check your connection and try again.";
    case 'auth/operation-not-allowed': return "Email sign-in isn't enabled for this site.";
    default: return 'Sign-in failed. Please try again.';
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionKey, setSessionKey] = useState<string>('');

  useEffect(() => {
    // Generate or get session key
    let sk = localStorage.getItem('tv_session_key');
    if (!sk) {
      sk = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('tv_session_key', sk);
    }
    setSessionKey(sk);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      let activeUser = fbUser;
      if (!activeUser) {
        const savedMockUser = localStorage.getItem('tv_mock_user');
        if (savedMockUser) {
          try {
            activeUser = JSON.parse(savedMockUser);
          } catch {
            activeUser = null;
          }
        }
      }

      setUser(activeUser);

      if (activeUser && sessionKey) {
        try {
          // Sync with Django API
          const syncRes = await fetch('http://localhost:8000/api/users/sync/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: activeUser.uid,
              name: activeUser.displayName || 'Trader',
              email: activeUser.email,
              phone: '',
              session_key: sessionKey,
              id_token: fbUser ? await fbUser.getIdToken() : undefined
            })
          });
          
          if (!syncRes.ok) {
            console.warn('[Auth] Sync failed (SQLite lock?), ignoring:', syncRes.status);
          } else {
            const syncResult = await syncRes.json();
            
            if (syncResult.limit_reached) {
              const confirm = window.confirm(syncResult.message + "\n\nDo you want to log out of one of your other devices and log in here?");
            if (confirm) {
              await fetch('http://localhost:8000/api/users/sync/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  uid: activeUser.uid,
                  name: activeUser.displayName || 'Trader',
                  email: activeUser.email,
                  phone: '',
                  session_key: sessionKey,
                  id_token: fbUser ? await fbUser.getIdToken() : undefined,
                  force: true
                })
              });
            } else {
              if (fbUser) {
                await signOut(auth);
              } else {
                localStorage.removeItem('tv_mock_user');
                setUser(null);
              }
              setLoading(false);
              return;
            }
          }
        }
          
        // Fetch full profile from Django
          const profileRes = await backendFetch(`http://localhost:8000/api/users/user/${activeUser.uid}/`);
          const profileData = await profileRes.json();
          setUserData(profileData);
        } catch (error) {
          console.error("Error syncing with Django", error);
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [sessionKey]);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      return true;
    } catch (error: any) {
      // Closing the Google window isn't an error worth showing
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') return false;
      if (error?.code === 'auth/popup-blocked') throw new Error('The sign-in window was blocked. Allow pop-ups for this site and try again.');
      throw new Error(authErrorMessage(error));
    }
  };

  const signUp = async (email: string, pass: string, name: string, phone: string) => {
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(res.user, { displayName: name });

      // Sync with Django API
      await fetch('http://localhost:8000/api/users/sync/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: res.user.uid,
          name,
          email,
          phone,
          session_key: sessionKey,
          id_token: await res.user.getIdToken()
        })
      });
    } catch (error: any) {
      // A failed sign-up is shown to the user (no local stand-in account)
      throw new Error(authErrorMessage(error));
    }
  };

  const signIn = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      // A wrong password etc. is an error on the form, never a local stand-in account
      throw new Error(authErrorMessage(error));
    }
  };

  const logout = async () => {
    try {
      localStorage.removeItem('tv_mock_user');
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signUp, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
