import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  ApiError,
  apiRequest,
  getActiveAuthMode,
  getStoredLocalToken,
  registerUnauthorizedHandler,
  setActiveAuthMode,
  setStoredLocalToken,
  type ActiveAuthMode,
} from '../services/apiClient';
import { auth, googleProvider } from '../services/firebase';
import type { UserProfile } from '../types/domain';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  profile: UserProfile | null;
  authMode: ActiveAuthMode | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  signInWithLocalStaff: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authMode, setAuthModeState] = useState<ActiveAuthMode | null>(getActiveAuthMode());
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Monotonic sequence & guards prevent concurrent onAuthStateChanged vs login races
  const syncSeqRef = useRef(0);
  const suppressAuthListenerRef = useRef(false);
  const handling401Ref = useRef(false);

  const clearLocalStateOnly = useCallback(() => {
    setStoredLocalToken(null);
    setActiveAuthMode(null);
    setAuthModeState(null);
  }, []);

  const verifyBackendSession = useCallback(
    async (
      fbUser: FirebaseUser | null,
      seq: number,
      isExplicitSignIn = false
    ): Promise<void> => {
      const localToken = getStoredLocalToken();
      const storedMode = getActiveAuthMode();

      const useLocalSession =
        (storedMode === 'LOCAL_STAFF' && Boolean(localToken)) ||
        (!fbUser && Boolean(localToken));

      if (!useLocalSession && !fbUser) {
        if (seq !== syncSeqRef.current) return;
        setProfile(null);
        setAuthModeState(null);
        return;
      }

      if (useLocalSession) {
        setActiveAuthMode('LOCAL_STAFF');
        try {
          const res = await apiRequest<{ success: boolean; user: UserProfile }>('/api/auth/me', {
            skipUnauthorizedHandler: true,
          });
          if (seq !== syncSeqRef.current) return;
          setProfile(res.user);
          setAuthModeState('LOCAL_STAFF');
          setAuthError(null);
        } catch (err) {
          if (seq !== syncSeqRef.current) return;
          clearLocalStateOnly();
          setProfile(null);
          if (err instanceof ApiError && err.status === 401) {
            setAuthError('انتهت صلاحية الجلسة المحلية أو لم تعد صالحة، يرجى تسجيل الدخول مجدداً.');
          } else {
            setAuthError(err instanceof Error ? err.message : 'تعذر التحقق من صلاحية الجلسة المحلية.');
          }
        }
        return;
      }

      // Firebase session verification (with single force-refresh retry on cached 401)
      if (fbUser) {
        setActiveAuthMode('FIREBASE');
        try {
          const res = await apiRequest<{ success: boolean; user: UserProfile }>('/api/auth/me', {
            skipUnauthorizedHandler: true,
          });
          if (seq !== syncSeqRef.current) return;
          setProfile(res.user);
          setAuthModeState('FIREBASE');
          setAuthError(null);
        } catch (firstErr) {
          if (firstErr instanceof ApiError && firstErr.status === 401 && !isExplicitSignIn) {
            try {
              const refreshed = await apiRequest<{ success: boolean; user: UserProfile }>('/api/auth/me', {
                forceRefreshToken: true,
                skipUnauthorizedHandler: true,
              });
              if (seq !== syncSeqRef.current) return;
              setProfile(refreshed.user);
              setAuthModeState('FIREBASE');
              setAuthError(null);
              return;
            } catch (retryErr) {
              if (seq !== syncSeqRef.current) return;
              suppressAuthListenerRef.current = true;
              await signOut(auth).catch(() => undefined);
              suppressAuthListenerRef.current = false;
              clearLocalStateOnly();
              setFirebaseUser(null);
              setProfile(null);
              setAuthError(
                retryErr instanceof ApiError && retryErr.status === 401
                  ? 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً.'
                  : retryErr instanceof Error
                    ? retryErr.message
                    : 'تعذر استعادة الجلسة، يرجى تسجيل الدخول مجدداً.'
              );
              return;
            }
          }

          if (seq !== syncSeqRef.current) return;
          if (firstErr instanceof ApiError && firstErr.status === 401) {
            suppressAuthListenerRef.current = true;
            await signOut(auth).catch(() => undefined);
            suppressAuthListenerRef.current = false;
            setFirebaseUser(null);
            clearLocalStateOnly();
          }
          setProfile(null);
          setAuthError(firstErr instanceof Error ? firstErr.message : 'تعذر التحقق من صلاحية الحساب.');
        }
      }
    },
    [clearLocalStateOnly]
  );

  // Register global 401 handler for expired active sessions during background requests
  useEffect(() => {
    registerUnauthorizedHandler((err) => {
      if (handling401Ref.current) return;
      handling401Ref.current = true;
      syncSeqRef.current += 1;

      clearLocalStateOnly();
      suppressAuthListenerRef.current = true;
      void signOut(auth)
        .catch(() => undefined)
        .finally(() => {
          suppressAuthListenerRef.current = false;
          setFirebaseUser(null);
          setProfile(null);
          setAuthError(err.message || 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً.');
          handling401Ref.current = false;
        });
    });

    return () => {
      registerUnauthorizedHandler(null);
    };
  }, [clearLocalStateOnly]);

  // Initial Firebase auth hydration + listener (prevents stale errors before loading finishes)
  useEffect(() => {
    let mounted = true;
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!mounted || suppressAuthListenerRef.current) return;

      const seq = ++syncSeqRef.current;
      setLoading(true);
      setFirebaseUser(fbUser);

      // Wait for Firebase Auth SDK persistence hydration before checking stored tokens
      await auth.authStateReady().catch(() => undefined);
      if (!mounted || seq !== syncSeqRef.current) return;

      await verifyBackendSession(fbUser, seq, false);
      if (mounted && seq === syncSeqRef.current) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [verifyBackendSession]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    setStoredLocalToken(null);
    setActiveAuthMode('FIREBASE');
    const seq = ++syncSeqRef.current;
    suppressAuthListenerRef.current = true;
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      setFirebaseUser(cred.user);
      await verifyBackendSession(cred.user, seq, true);
      if (!auth.currentUser) {
        throw new Error('تعذر تفعيل جلسة الحساب بعد تسجيل الدخول.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل تسجيل الدخول عبر Google.';
      setAuthError(msg);
      throw err;
    } finally {
      suppressAuthListenerRef.current = false;
      setLoading(false);
    }
  };

  const signInWithEmailPassword = async (email: string, password: string) => {
    setAuthError(null);
    setStoredLocalToken(null);
    setActiveAuthMode('FIREBASE');
    const seq = ++syncSeqRef.current;
    suppressAuthListenerRef.current = true;
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      setFirebaseUser(cred.user);
      await verifyBackendSession(cred.user, seq, true);
      if (!auth.currentUser) {
        throw new Error('تعذر التحقق من جلسة الحساب بعد تسجيل الدخول.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل الدخول بالبريد وكلمة المرور.';
      setAuthError(msg);
      throw err;
    } finally {
      suppressAuthListenerRef.current = false;
      setLoading(false);
    }
  };

  const signInWithLocalStaff = async (email: string, password: string) => {
    setAuthError(null);
    const seq = ++syncSeqRef.current;
    suppressAuthListenerRef.current = true;
    setLoading(true);
    try {
      // Clear any leftover Firebase user so apiClient strictly sends the new local token
      await signOut(auth).catch(() => undefined);
      setFirebaseUser(null);
      clearLocalStateOnly();

      const res = await apiRequest<{ success: boolean; token: string; user: UserProfile }>(
        '/api/auth/local-login',
        {
          method: 'POST',
          authenticated: false,
          body: { email, password },
        }
      );

      if (seq !== syncSeqRef.current) return;
      setActiveAuthMode('LOCAL_STAFF');
      setStoredLocalToken(res.token);
      setAuthModeState('LOCAL_STAFF');
      setProfile(res.user);
      setAuthError(null);
    } catch (err) {
      clearLocalStateOnly();
      setProfile(null);
      const msg = err instanceof Error ? err.message : 'فشل تسجيل الدخول المحلي.';
      setAuthError(msg);
      throw err;
    } finally {
      suppressAuthListenerRef.current = false;
      setLoading(false);
    }
  };

  const logout = async () => {
    syncSeqRef.current += 1;
    suppressAuthListenerRef.current = true;
    clearLocalStateOnly();
    await signOut(auth).catch(() => undefined);
    suppressAuthListenerRef.current = false;
    setFirebaseUser(null);
    setProfile(null);
    setAuthError(null);
  };

  const refreshProfile = async () => {
    const seq = ++syncSeqRef.current;
    await verifyBackendSession(auth.currentUser, seq, false);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        authMode,
        loading,
        authError,
        signInWithGoogle,
        signInWithEmailPassword,
        signInWithLocalStaff,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
