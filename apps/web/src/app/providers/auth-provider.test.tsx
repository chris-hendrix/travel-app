import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./auth-provider";
import type { User } from "@journiful/shared";

// Mock Next.js router
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const mockUser: User = {
  id: "123",
  phoneNumber: "+15551234567",
  displayName: "Test User",
  timezone: "America/New_York",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("AuthProvider", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders children", () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    render(
      <AuthProvider>
        <div>Test Child</div>
      </AuthProvider>,
    );

    expect(screen.getByText("Test Child")).toBeDefined();
  });

  it("fetches user on mount", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: mockUser }),
    } as Response);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/me"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("handles fetch user failure gracefully", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
  });

  it("throws error when useAuth is used outside provider", () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within AuthProvider");
  });

  describe("login", () => {
    it("calls POST /auth/request-code", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: "Code sent" }),
      } as Response);

      await act(async () => {
        await result.current.login("+15551234567");
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/request-code"),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: "+15551234567" }),
        }),
      );
    });

    it("throws error on failed login", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "Invalid phone number" } }),
      } as Response);

      await expect(
        act(async () => {
          await result.current.login("invalid");
        }),
      ).rejects.toThrow("Invalid phone number");
    });
  });

  describe("verify", () => {
    it("calls POST /auth/verify-code and updates user state", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: mockUser, requiresProfile: false }),
      } as Response);

      let verifyResult;
      await act(async () => {
        verifyResult = await result.current.verify("+15551234567", "123456");
      });

      expect(verifyResult).toEqual({ requiresProfile: false });
      expect(result.current.user).toEqual(mockUser);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/verify-code"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: "+15551234567", code: "123456" }),
        }),
      );
    });

    it("does not update user state when profile is required", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ requiresProfile: true }),
      } as Response);

      let verifyResult;
      await act(async () => {
        verifyResult = await result.current.verify("+15551234567", "123456");
      });

      expect(verifyResult).toEqual({ requiresProfile: true });
      expect(result.current.user).toBeNull();
    });

    it("throws error on failed verification", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "Invalid code" } }),
      } as Response);

      await expect(
        act(async () => {
          await result.current.verify("+15551234567", "000000");
        }),
      ).rejects.toThrow("Invalid code");
    });
  });

  describe("completeProfile", () => {
    it("calls POST /auth/complete-profile and updates user state", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: mockUser }),
      } as Response);

      await act(async () => {
        await result.current.completeProfile({
          displayName: "Test User",
          timezone: "America/New_York",
        });
      });

      expect(result.current.user).toEqual(mockUser);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/complete-profile"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: "Test User",
            timezone: "America/New_York",
          }),
        }),
      );
    });

    it("throws error on failed profile completion", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "Invalid display name" } }),
      } as Response);

      await expect(
        act(async () => {
          await result.current.completeProfile({
            displayName: "",
          });
        }),
      ).rejects.toThrow("Invalid display name");
    });
  });

  describe("logout", () => {
    it("calls POST /auth/logout and clears user state", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: mockUser }),
      } as Response);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: "Logged out" }),
      } as Response);

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/logout"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        }),
      );
    });
  });

  describe("refetch", () => {
    it("refetches user data", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider>{children}</AuthProvider>
      );

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.user).toBeNull();

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: mockUser }),
      } as Response);

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.user).toEqual(mockUser);
    });
  });
});
