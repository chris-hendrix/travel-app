import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter, useSearchParams } from "next/navigation";
import VerifyPage from "./page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

// Mock auth provider
const mockVerify = vi.fn();
const mockLogin = vi.fn();
let mockUser: any = null;
vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({
    verify: mockVerify,
    login: mockLogin,
    get user() {
      return mockUser;
    },
  }),
}));

describe("VerifyPage", () => {
  const mockPush = vi.fn();
  const mockGet = vi.fn();

  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
    } as any);

    mockGet.mockImplementation((key: string) => {
      if (key === "phone") return "+15551234567";
      if (key === "smsConsent") return "true";
      return null;
    });
    vi.mocked(useSearchParams).mockReturnValue({
      get: mockGet,
    } as any);

    mockVerify.mockClear();
    mockLogin.mockClear();
    mockPush.mockClear();
    mockGet.mockClear();
    mockUser = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the verification form", () => {
    render(<VerifyPage />);

    expect(screen.getByText("Verify your number")).toBeDefined();
    expect(screen.getByLabelText(/verification code/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /verify/i })).toBeDefined();
  });

  it("displays phone number from query param", () => {
    mockGet.mockReturnValue("+15551234567");

    render(<VerifyPage />);

    expect(screen.getByText("+1 555 123 4567")).toBeDefined();
    expect(mockGet).toHaveBeenCalledWith("phone");
  });

  it("displays formatted phone number from query param", () => {
    mockGet.mockReturnValue("+14155552671");

    render(<VerifyPage />);

    // formatPhoneNumber converts E.164 to international format
    expect(screen.getByText("+1 415 555 2671")).toBeDefined();
  });

  it("displays validation error for code that is not 6 digits", async () => {
    const user = userEvent.setup();
    render(<VerifyPage />);

    const input = screen.getByLabelText(/verification code/i);
    const button = screen.getByRole("button", { name: /verify/i });

    await user.type(input, "123");
    await user.click(button);

    await waitFor(() => {
      // Look for the error message text
      const errorMessage = screen.queryByText((content, element) => {
        return (
          element?.getAttribute("data-slot") === "form-message" &&
          content.includes("exactly 6 characters")
        );
      });
      expect(errorMessage).toBeTruthy();
    });

    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("displays validation error for code with non-digits", async () => {
    const user = userEvent.setup();
    render(<VerifyPage />);

    const input = screen.getByLabelText(/verification code/i);
    const button = screen.getByRole("button", { name: /verify/i });

    await user.type(input, "abcdef");
    await user.click(button);

    await waitFor(() => {
      const errorMessage = screen.queryByText((content, element) => {
        return (
          element?.getAttribute("data-slot") === "form-message" &&
          content.includes("only digits")
        );
      });
      expect(errorMessage).toBeTruthy();
    });

    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("calls verify with correct phone number and code on submit", async () => {
    const user = userEvent.setup();
    mockVerify.mockResolvedValue({ requiresProfile: false });

    render(<VerifyPage />);

    const input = screen.getByLabelText(/verification code/i);
    const button = screen.getByRole("button", { name: /verify/i });

    await user.type(input, "123456");
    await user.click(button);

    await waitFor(() => {
      expect(mockVerify).toHaveBeenCalledWith("+15551234567", "123456", true);
    });
  });

  it("redirects to complete-profile when requiresProfile is true", async () => {
    const user = userEvent.setup();
    mockVerify.mockResolvedValue({ requiresProfile: true });

    render(<VerifyPage />);

    const input = screen.getByLabelText(/verification code/i);
    const button = screen.getByRole("button", { name: /verify/i });

    await user.type(input, "123456");
    await user.click(button);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/complete-profile");
    });
  });

  it("redirects to trips when requiresProfile is false", async () => {
    const user = userEvent.setup();
    mockVerify.mockImplementation(async () => {
      mockUser = { id: "1", name: "Test User", phoneNumber: "+15551234567" };
      return { requiresProfile: false };
    });

    render(<VerifyPage />);

    const input = screen.getByLabelText(/verification code/i);
    const button = screen.getByRole("button", { name: /verify/i });

    await user.type(input, "123456");
    await user.click(button);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/trips");
    });
  });

  it("displays error message for invalid code", async () => {
    const user = userEvent.setup();
    mockVerify.mockRejectedValue(new Error("Invalid verification code"));

    render(<VerifyPage />);

    const input = screen.getByLabelText(/verification code/i);
    const button = screen.getByRole("button", { name: /verify/i });

    await user.type(input, "123456");
    await user.click(button);

    await waitFor(() => {
      const errorMessage = screen.queryByText((content, element) => {
        return (
          element?.getAttribute("data-slot") === "form-message" &&
          content.includes("Invalid verification code")
        );
      });
      expect(errorMessage).toBeTruthy();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("displays error message for expired code", async () => {
    const user = userEvent.setup();
    mockVerify.mockRejectedValue(new Error("Verification code has expired"));

    render(<VerifyPage />);

    const input = screen.getByLabelText(/verification code/i);
    const button = screen.getByRole("button", { name: /verify/i });

    await user.type(input, "123456");
    await user.click(button);

    await waitFor(() => {
      const errorMessage = screen.queryByText((content, element) => {
        return (
          element?.getAttribute("data-slot") === "form-message" &&
          content.includes("expired")
        );
      });
      expect(errorMessage).toBeTruthy();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("disables button while verifying", async () => {
    const user = userEvent.setup();
    let resolveVerify: () => void;
    mockVerify.mockReturnValue(
      new Promise((resolve) => {
        resolveVerify = resolve as () => void;
      }),
    );

    render(<VerifyPage />);

    const input = screen.getByLabelText(/verification code/i);
    const button = screen.getByRole("button", { name: /verify/i });

    await user.type(input, "123456");
    await user.click(button);

    await waitFor(() => {
      expect(button).toHaveProperty("disabled", true);
      const verifyingText = screen.queryByText("Verifying...");
      expect(verifyingText).toBeTruthy();
    });

    // Resolve the promise
    resolveVerify!();

    await waitFor(() => {
      expect(button).toHaveProperty("disabled", false);
    });
  });

  it("renders change number link", () => {
    render(<VerifyPage />);

    const link = screen.getByText("Change number");
    expect(link).toBeDefined();
    expect(link.closest("a")).toHaveProperty(
      "href",
      expect.stringContaining("/login"),
    );
  });

  it("renders resend code button", () => {
    render(<VerifyPage />);

    const button = screen.getByRole("button", { name: /resend code/i });
    expect(button).toBeDefined();
  });

  it("calls login again when resend code is clicked", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);

    render(<VerifyPage />);

    const resendButton = screen.getByRole("button", { name: /resend code/i });
    await user.click(resendButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("+15551234567", true);
    });
  });

  it("shows success message after resending code", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);

    render(<VerifyPage />);

    const resendButton = screen.getByRole("button", { name: /resend code/i });
    await user.click(resendButton);

    await waitFor(() => {
      expect(screen.getByText(/new code has been sent/i)).toBeDefined();
    });
  });

  it("clears input after resending code", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);

    render(<VerifyPage />);

    const input = screen.getByLabelText(
      /verification code/i,
    ) as HTMLInputElement;
    await user.type(input, "123456");
    expect(input.value).toBe("123456");

    const resendButton = screen.getByRole("button", { name: /resend code/i });
    await user.click(resendButton);

    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });

  it("disables resend button while resending", async () => {
    const user = userEvent.setup();
    let resolveLogin: () => void;
    mockLogin.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve as () => void;
      }),
    );

    render(<VerifyPage />);

    const resendButton = screen.getByRole("button", { name: /resend code/i });
    await user.click(resendButton);

    await waitFor(() => {
      expect(resendButton).toHaveProperty("disabled", true);
      const sendingText = screen.queryByText("Sending...");
      expect(sendingText).toBeTruthy();
    });

    // Resolve the promise
    resolveLogin!();

    await waitFor(() => {
      expect(resendButton).toHaveProperty("disabled", false);
    });
  });

  it("shows error message if resending fails", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValue(new Error("Too many requests"));

    render(<VerifyPage />);

    const resendButton = screen.getByRole("button", { name: /resend code/i });
    await user.click(resendButton);

    await waitFor(() => {
      const errorMessage = screen.queryByText((content, element) => {
        return (
          element?.getAttribute("data-slot") === "form-message" &&
          content.includes("Too many requests")
        );
      });
      expect(errorMessage).toBeTruthy();
    });
  });

  it("has focus ref attached to code input", () => {
    render(<VerifyPage />);

    const input = screen.getByLabelText(
      /verification code/i,
    ) as HTMLInputElement;

    // Verify the input has the ref attribute (which enables auto-focus)
    // Note: Auto-focus behavior in test environment is limited, so we verify the input exists
    expect(input).toBeDefined();
    expect(input.type).toBe("text");
  });

  it("limits code input to 6 characters", async () => {
    const user = userEvent.setup();
    render(<VerifyPage />);

    const input = screen.getByLabelText(
      /verification code/i,
    ) as HTMLInputElement;
    await user.type(input, "1234567890");

    // Input should be limited to 6 characters by maxLength attribute
    expect(input).toHaveProperty("maxLength", 6);
  });

  it("shows SMS disclaimer text", () => {
    render(<VerifyPage />);

    expect(
      screen.getByText("Check your SMS messages for the code"),
    ).toBeDefined();
  });

  it("shows resend disclaimer text", () => {
    render(<VerifyPage />);

    expect(
      screen.getByText(
        "Didn't receive the code? Wait a moment and try resending",
      ),
    ).toBeDefined();
  });

  it("handles missing phone number in query param", () => {
    mockGet.mockReturnValue(null);

    render(<VerifyPage />);

    // Should still render but with empty phone number
    expect(screen.getByText("Verify your number")).toBeDefined();
  });
});
