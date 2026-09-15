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

interface AuthContextType {
  user: User | null;
  userData: any | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, pass: string, name: string, phone: string) => Promise<void>;
  signIn: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  signInWithGoogle: async () => {},
  signUp: async () => {},
  signIn: async () => {},
  logout: async () => {},
});

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
              session_key: sessionKey
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
          const profileRes = await fetch(`http://localhost:8000/api/users/user/${activeUser.uid}/`);
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
    } catch (error) {
      console.error("Error signing in with Google", error);
      throw error;
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
          phone
        })
      });
    } catch (error: any) {
      console.warn("Firebase sign up failed. Falling back to local mock signup.", error);
      
      // Mock signup fallback
      const mockUid = 'mock_uid_' + Math.random().toString(36).substring(2, 10);
      const mockUser = {
        uid: mockUid,
        displayName: name,
        email: email,
        metadata: { creationTime: new Date().toISOString() }
      };
      
      localStorage.setItem('tv_mock_user', JSON.stringify(mockUser));
      
      // Sync with Django API
      await fetch('http://localhost:8000/api/users/sync/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: mockUid,
          name,
          email,
          phone,
          session_key: sessionKey
        })
      });
      
      setUser(mockUser as any);
    }
  };

  const signIn = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      console.warn("Firebase sign in failed. Falling back to local mock signin.", error);
      
      // Mock signin fallback
      const mockUid = 'mock_uid_' + email.split('@')[0];
      const mockUser = {
        uid: mockUid,
        displayName: email.split('@')[0].toUpperCase(),
        email: email,
        metadata: { creationTime: new Date().toISOString() }
      };
      
      localStorage.setItem('tv_mock_user', JSON.stringify(mockUser));
      
      // Sync with Django API
      await fetch('http://localhost:8000/api/users/sync/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: mockUid,
          name: mockUser.displayName,
          email: email,
          phone: '',
          session_key: sessionKey
        })
      });
      
      setUser(mockUser as any);
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
