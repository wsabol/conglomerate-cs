import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UserRole } from "@shared/types";
import { apiFetch } from "./api";

export interface CurrentUser {
  id: number;
  email: string;
  role: UserRole;
  personId: number | null;
  displayName?: string | null;
  instrument?: string | null;
  logoutUrl?: string | null;
}

interface AuthContextValue {
  user: CurrentUser | null;
  isEditor: boolean;
  loading: boolean;
  refresh: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isEditor: false,
  loading: true,
  refresh: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    apiFetch<CurrentUser>("/api/me")
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    window.location.assign(user?.logoutUrl ?? "/welcome");
  }, [user?.logoutUrl]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isEditor: user?.role === "editor", loading, refresh, logout }),
    [user, loading, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
