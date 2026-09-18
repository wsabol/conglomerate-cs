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
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isEditor: false,
  loading: true,
  refresh: () => {},
  logout: async () => {},
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

  const logout = useCallback(async () => {
    const url = user?.logoutUrl;
    if (url) {
      const response = await fetch(url, {
        method: "GET",
        credentials: "same-origin",
        redirect: "manual",
        cache: "no-store",
      });
      if (response.type !== "opaqueredirect" && !response.ok) {
        throw new Error("Could not sign out. Please try again.");
      }
    }
    setUser(null);
    window.location.assign("/logged-out");
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
