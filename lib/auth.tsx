import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import {
  ClerkProvider as BaseClerkProvider,
  useAuth as useBaseAuth,
  useClerk as useBaseClerk,
  useUser as useBaseUser,
} from '@clerk/clerk-react';

type AuthUser = {
  id?: string;
  fullName?: string | null;
  username?: string | null;
  imageUrl?: string;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
  emailAddresses?: Array<{ emailAddress?: string | null }>;
} | null;

type UserState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser;
};

type ClerkState = {
  openSignIn: (...args: any[]) => void;
  signOut: (...args: any[]) => Promise<void>;
};

type SessionState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: (...args: any[]) => Promise<string | null>;
};

type AuthContextValue = {
  clerkEnabled: boolean;
  userState: UserState;
  clerkState: ClerkState;
  sessionState: SessionState;
};

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const noopAsync = async () => {};
let hasWarnedMissingClerkKey = false;

const warnMissingClerkKey = () => {
  if (hasWarnedMissingClerkKey) return;
  hasWarnedMissingClerkKey = true;
  console.warn('VITE_CLERK_PUBLISHABLE_KEY is not set. Project access is blocked until cloud auth is configured.');
};

const fallbackContextValue: AuthContextValue = {
  clerkEnabled: false,
  userState: {
    isLoaded: true,
    isSignedIn: false,
    user: null,
  },
  clerkState: {
    openSignIn: warnMissingClerkKey,
    signOut: noopAsync,
  },
  sessionState: {
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    getToken: async () => null,
  },
};

const AuthContext = createContext<AuthContextValue>(fallbackContextValue);

const ClerkBridge: React.FC<React.PropsWithChildren> = ({ children }) => {
  const user = useBaseUser();
  const clerk = useBaseClerk();
  const auth = useBaseAuth();
  const openSignInRef = useRef(clerk.openSignIn);
  const signOutRef = useRef(clerk.signOut);
  const getTokenRef = useRef(auth.getToken);
  openSignInRef.current = clerk.openSignIn;
  signOutRef.current = clerk.signOut;
  getTokenRef.current = auth.getToken;

  const openSignIn = useCallback((...args: any[]) => {
    void openSignInRef.current(...args);
  }, []);
  const signOut = useCallback((...args: any[]) => signOutRef.current(...args), []);
  const getToken = useCallback((...args: any[]) => getTokenRef.current(...args), []);

  const value = useMemo<AuthContextValue>(() => ({
    clerkEnabled: true,
    userState: {
      isLoaded: user.isLoaded,
      isSignedIn: !!user.isSignedIn,
      user: (user.user as AuthUser) ?? null,
    },
    clerkState: {
      openSignIn,
      signOut,
    },
    sessionState: {
      isLoaded: auth.isLoaded,
      isSignedIn: !!auth.isSignedIn,
      userId: auth.userId || null,
      getToken,
    },
  }), [
    auth.isLoaded,
    auth.isSignedIn,
    auth.userId,
    getToken,
    openSignIn,
    signOut,
    user.isLoaded,
    user.isSignedIn,
    user.user,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  if (!clerkPublishableKey) {
    warnMissingClerkKey();
    return <AuthContext.Provider value={fallbackContextValue}>{children}</AuthContext.Provider>;
  }

  return (
    <BaseClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
      <ClerkBridge>{children}</ClerkBridge>
    </BaseClerkProvider>
  );
};

export const useUser = () => useContext(AuthContext).userState;

export const useClerk = () => useContext(AuthContext).clerkState;

export const useAuth = () => useContext(AuthContext).sessionState;

export const isClerkConfigured = () => Boolean(clerkPublishableKey);
