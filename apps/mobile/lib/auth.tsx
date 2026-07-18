import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadAuth, saveAuth, type AuthUser, type StoredAuth } from './api';
import { disconnectSocket } from './socket';

interface AuthContext {
  user: AuthUser | null;
  ready: boolean;
  signIn: (auth: StoredAuth) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthContext>({
  user: null,
  ready: false,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // Restore the session before the first render decides which stack to show,
  // otherwise a returning user sees the login screen flash past.
  useEffect(() => {
    loadAuth()
      .then((a) => setUser(a?.user ?? null))
      .finally(() => setReady(true));
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        ready,
        signIn: async (auth) => {
          await saveAuth(auth);
          setUser(auth.user);
        },
        signOut: async () => {
          disconnectSocket();
          await saveAuth(null);
          setUser(null);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
