import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import LoginPage from "./page";

// Mock PhoneInput component for testing
vi.mock("@/components/ui/phone-input", () => ({
  PhoneInput: ({
    value,
    onChange,
    disabled,
    placeholder,
    name,
    onBlur,
    defaultCountry: _dc,
    className: _cn,
    ...props
  }: any) => (
    <input
      type="tel"
      value={value || ""}
      onChange={(e: any) => onChange?.(e.target.value)}
      onBlur={onBlur}
      name={name}
      disabled={disabled}
      placeholder={placeholder}
      aria-label="Phone number"
      data-testid="phone-input"
      {...props}
    />
  ),
}));

// Mock next/navigation — include useSearchParams
const mockSearchParamsGet = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
}));

// Mock auth provider
const mockLogin = vi.fn();
vi.mock("@/app/providers/auth-provider", () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

/** Check the SMS consent checkbox so the Continue button is enabled */
async function checkSmsConsent(user: ReturnType<typeof userEvent.setup>) {
  const checkbox = screen.getByRole("checkbox", { name: /i agree to receive text messages/i });
  await user.click(checkbox);
}

describe("LoginPage", () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
    } as any);
    mockLogin.mockClear();
    mockPush.mockClear();
    mockSearchParamsGet.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the login form", () => {
    render(<LoginPage />);

    expect(screen.getByText("Get started")).toBeDefined();
    expect(
      screen.getByText(
        "Enter your phone number to sign in or create an account",
      ),
    ).toBeDefined();
    expect(screen.getByLabelText(/phone number/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDefined();
  });

  it("displays validation error for phone number that is too short", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const input = screen.getByLabelText(/phone number/i);
    const button = screen.getByRole("button", { name: /continue/i });

    await user.type(input, "123");
    await checkSmsConsent(user);
    await user.click(button);

    await waitFor(
      () => {
        const errorMessage = screen.queryByText(
          /phone number must be at least 10 characters/i,
        );
        expect(errorMessage).not.toBeNull();
      },
      { timeout: 3000 },
    );

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("displays validation error for phone number that is too long", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const input = screen.getByLabelText(/phone number/i);
    const button = screen.getByRole("button", { name: /continue/i });

    await user.type(input, "123456789012345678901");
    await checkSmsConsent(user);
    await user.click(button);

    await waitFor(() => {
      const errorMessage = screen.queryByText(
        "Phone number must not exceed 20 characters",
      );
      expect(errorMessage).toBeTruthy();
    });

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("calls login with correct phone number on submit", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);

    render(<LoginPage />);

    const input = screen.getByLabelText(/phone number/i);
    const button = screen.getByRole("button", { name: /continue/i });

    await user.type(input, "+15551234567");
    await checkSmsConsent(user);
    await user.click(button);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("+15551234567", true);
    });
  });

  it("redirects to verify page on successful login", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);

    render(<LoginPage />);

    const input = screen.getByLabelText(/phone number/i);
    const button = screen.getByRole("button", { name: /continue/i });

    await user.type(input, "+15551234567");
    await checkSmsConsent(user);
    await user.click(button);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/verify?phone=%2B15551234567&smsConsent=true");
    });
  });

  it("displays error message on API failure", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValue(new Error("Invalid phone number"));

    render(<LoginPage />);

    const input = screen.getByLabelText(/phone number/i);
    const button = screen.getByRole("button", { name: /continue/i });

    await user.type(input, "+15551234567");
    await checkSmsConsent(user);
    await user.click(button);

    await waitFor(() => {
      const errorMessage = screen.queryByText("Invalid phone number");
      expect(errorMessage).toBeTruthy();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("displays rate limit error", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValue(
      new Error("Too many requests. Please try again later."),
    );

    render(<LoginPage />);

    const input = screen.getByLabelText(/phone number/i);
    const button = screen.getByRole("button", { name: /continue/i });

    await user.type(input, "+15551234567");
    await checkSmsConsent(user);
    await user.click(button);

    await waitFor(() => {
      const errorMessage = screen.queryByText(
        "Too many requests. Please try again later.",
      );
      expect(errorMessage).toBeTruthy();
    });
  });

  it("disables button while loading", async () => {
    const user = userEvent.setup();
    let resolveLogin: () => void;
    mockLogin.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve as () => void;
      }),
    );

    render(<LoginPage />);

    const input = screen.getByLabelText(/phone number/i);
    const button = screen.getByRole("button", { name: /continue/i });

    await user.type(input, "+15551234567");
    await checkSmsConsent(user);
    await user.click(button);

    await waitFor(() => {
      expect(button).toHaveProperty("disabled", true);
      const sendingText = screen.queryByText("Sending...");
      expect(sendingText).toBeTruthy();
    });

    // Resolve the promise
    resolveLogin!();

    await waitFor(() => {
      expect(button).toHaveProperty("disabled", false);
    });
  });

  it("shows SMS disclaimer text", () => {
    render(<LoginPage />);

    expect(
      screen.getByText("We'll send you a verification code via SMS"),
    ).toBeDefined();
  });

  it("shows terms and privacy policy disclaimer", () => {
    render(<LoginPage />);

    expect(
      screen.getByText(/By continuing, you agree to our/i),
    ).toBeDefined();
  });

  it("renders phone input with country selector mock", () => {
    render(<LoginPage />);

    const input = screen.getByTestId("phone-input");
    expect(input).toBeDefined();
    expect(input.getAttribute("type")).toBe("tel");
  });
});
