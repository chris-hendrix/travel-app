"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@journiful/shared";
import { API_URL } from "@/lib/api";

interface ImpersonatingState {
  active: boolean;
  user?: { id: string; displayName: string };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  impersonating: ImpersonatingState;
  login: (phoneNumber: string, smsConsent?: boolean) => Promise<void>;
  verify: (
    phoneNumber: string,
    code: string,
    smsConsent?: boolean,
  ) => Promise<{ requiresProfile: boolean }>;
  completeProfile: (data: {
    displayName: string;
    timezone?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
  stopImpersonating: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [impersonating, setImpersonating] = useState<ImpersonatingState>({
    active: false,
  });
  const router = useRouter();

  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setIsAdmin(data.isAdmin === true);
        setImpersonating(
          data.impersonating
            ? { active: true, user: data.impersonatingUser }
            : { active: false },
        );
      } else {
        setUser(null);
        setIsAdmin(false);
        setImpersonating({ active: false });
      }
    } catch {
      setUser(null);
      setIsAdmin(false);
      setImpersonating({ active: false });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch current user on mount
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(async (phoneNumber: string, smsConsent?: boolean) => {
    const response = await fetch(`${API_URL}/auth/request-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber, smsConsent: smsConsent ?? true }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Request failed");
    }
  }, []);

  const verify = useCallback(async (phoneNumber: string, code: string, smsConsent?: boolean) => {
    const response = await fetch(`${API_URL}/auth/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ phoneNumber, code, smsConsent: smsConsent ?? true }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Request failed");
    }

    const data = await response.json();

    if (!data.requiresProfile) {
      setUser(data.user);
    }

    return { requiresProfile: data.requiresProfile };
  }, []);

  const completeProfile = useCallback(
    async (profileData: { displayName: string; timezone?: string }) => {
      const response = await fetch(`${API_URL}/auth/complete-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Request failed");
      }

      const data = await response.json();
      setUser(data.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });

    setUser(null);
    setIsAdmin(false);
    setImpersonating({ active: false });
    router.push("/login");
  }, [router]);

  const stopImpersonating = useCallback(async () => {
    const response = await fetch(`${API_URL}/admin/stop-impersonate`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to stop impersonation");
    }

    await fetchUser();
    router.push("/admin/users");
  }, [fetchUser, router]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin,
      impersonating,
      login,
      verify,
      completeProfile,
      logout,
      refetch: fetchUser,
      stopImpersonating,
    }),
    [user, loading, isAdmin, impersonating, login, verify, completeProfile, logout, fetchUser, stopImpersonating],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
