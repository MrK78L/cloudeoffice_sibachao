import { createContext, ReactNode, useMemo, useState } from "react";
import {
  getAuthSession,
  getUserFromSession,
  logout as clearSession,
  saveAuthSession,
  type AuthSession,
  type AuthUser
} from "./cognito";

type AuthContextValue = {
  session: AuthSession | null;
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loginWithSession: (session: AuthSession) => void;
  loginWithToken: (token: string) => void;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => getAuthSession());

  const value = useMemo<AuthContextValue>(() => {
    const user = getUserFromSession(session);
    return {
      session,
      token: session?.accessToken ?? null,
      user,
      isAuthenticated: Boolean(session?.accessToken),
      isAdmin: Boolean(user?.groups.includes("admin")),
      loginWithSession: (nextSession: AuthSession) => {
        saveAuthSession(nextSession);
        setSession(nextSession);
      },
      loginWithToken: (token: string) => {
        const nextSession = { accessToken: token, idToken: token };
        saveAuthSession(nextSession);
        setSession(nextSession);
      },
      logout: () => {
        clearSession();
        setSession(null);
      }
    };
  }, [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
