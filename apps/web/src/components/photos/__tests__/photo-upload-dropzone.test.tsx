import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PhotoUploadDropzone } from "../photo-upload-dropzone";

// Mock the API module
vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  API_URL: "http://localhost:8000/api",
  APIError: class APIError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "APIError";
    }
  },
}));

describe("PhotoUploadDropzone", () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    mockCreateObjectURL = vi.fn((file) => `blob:${file.name || "file"}`);
    mockRevokeObjectURL = vi.fn();

    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;
  });

  afterEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  const createMockFile = (name: string, type: string, size: number): File => {
    const blob = new Blob(["x".repeat(size)], { type });
    return new File([blob], name, { type });
  };

  const renderDropzone = (
    props?: Partial<React.ComponentProps<typeof PhotoUploadDropzone>>,
  ) => {
    return render(
      <PhotoUploadDropzone
        tripId="trip-123"
        currentCount={0}
        maxCount={20}
        {...props}
      />,
      { wrapper },
    );
  };

  describe("Rendering", () => {
    it("renders upload zone with correct text", () => {
      renderDropzone();

      expect(
        screen.getByRole("button", { name: "Upload photos" }),
      ).toBeDefined();
      expect(
        screen.getByText("Click to upload or drag and drop"),
      ).toBeDefined();
      expect(
        screen.getByText("JPG, PNG, or WEBP (max 5MB each)"),
      ).toBeDefined();
    });

    it("renders file input with correct accept attribute and multiple", () => {
      const { container } = renderDropzone();

      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      expect(fileInput).toBeDefined();
      expect(fileInput.accept).toBe("image/jpeg,image/png,image/webp");
      expect(fileInput.multiple).toBe(true);
    });

    it("shows remaining photo count", () => {
      renderDropzone({ currentCount: 17, maxCount: 20 });

      expect(screen.getByText("3 photos remaining")).toBeDefined();
    });

    it("shows singular remaining when 1 left", () => {
      renderDropzone({ currentCount: 19, maxCount: 20 });

      expect(screen.getByText("1 photo remaining")).toBeDefined();
    });
  });

  describe("Disabled state", () => {
    it("disables when limit reached", () => {
      renderDropzone({ currentCount: 20, maxCount: 20 });

      expect(screen.getByText("Photo limit reached")).toBeDefined();
      expect(screen.queryByText(/remaining/)).toBeNull();
    });

    it("disables file input when limit reached", () => {
      const { container } = renderDropzone({ currentCount: 20, maxCount: 20 });

      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      expect(fileInput.disabled).toBe(true);
    });

    it("sets tabIndex to -1 when disabled", () => {
      renderDropzone({ currentCount: 20, maxCount: 20 });

      const uploadZone = screen.getByRole("button", { name: "Upload photos" });
      expect(uploadZone.tabIndex).toBe(-1);
    });

    it("prevents click when disabled", async () => {
      const user = userEvent.setup();
      const { container } = renderDropzone({ currentCount: 20, maxCount: 20 });

      const uploadZone = screen.getByRole("button", { name: "Upload photos" });
      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const clickSpy = vi.spyOn(fileInput, "click");

      await user.click(uploadZone);

      expect(clickSpy).not.toHaveBeenCalled();
    });

    it("prevents drag and drop when disabled", () => {
      renderDropzone({ currentCount: 20, maxCount: 20 });

      const uploadZone = screen.getByRole("button", { name: "Upload photos" });

      fireEvent.dragOver(uploadZone);

      expect(uploadZone.className).not.toContain("border-primary bg-primary");
    });
  });

  describe("File validation", () => {
    it("rejects invalid file types", async () => {
      const { container } = renderDropzone();

      const file = createMockFile("test.pdf", "application/pdf", 1024);
      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(
          screen.getByText(
            "Invalid file type. Only JPG, PNG, and WEBP are allowed",
          ),
        ).toBeDefined();
      });
    });

    it("rejects files over 5MB", async () => {
      const { container } = renderDropzone();

      const file = createMockFile("large.jpg", "image/jpeg", 6 * 1024 * 1024);
      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(
          screen.getByText(
            "Image must be under 5MB. Please choose a smaller file",
          ),
        ).toBeDefined();
      });
    });

    it("rejects when files exceed remaining capacity", async () => {
      const { container } = renderDropzone({ currentCount: 19, maxCount: 20 });

      const file1 = createMockFile("a.jpg", "image/jpeg", 1024);
      const file2 = createMockFile("b.jpg", "image/jpeg", 1024);
      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(
          screen.getByText("You can only upload 1 more photo"),
        ).toBeDefined();
      });
    });

    it("rejects more than 5 files at a time", async () => {
      const { container } = renderDropzone();

      const files = Array.from({ length: 6 }, (_, i) =>
        createMockFile(`file${i}.jpg`, "image/jpeg", 1024),
      );
      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files } });

      await waitFor(() => {
        expect(
          screen.getByText("You can upload up to 5 files at a time"),
        ).toBeDefined();
      });
    });
  });

  describe("Drag and drop", () => {
    it("handles drag over event", () => {
      renderDropzone();

      const uploadZone = screen.getByRole("button", { name: "Upload photos" });

      fireEvent.dragOver(uploadZone, {
        dataTransfer: { files: [] },
      });

      expect(uploadZone.className).toContain("border-primary");
      expect(screen.getByText("Drop photos here")).toBeDefined();
    });

    it("handles drag leave event", () => {
      renderDropzone();

      const uploadZone = screen.getByRole("button", { name: "Upload photos" });

      fireEvent.dragOver(uploadZone);
      fireEvent.dragLeave(uploadZone);

      expect(
        screen.getByText("Click to upload or drag and drop"),
      ).toBeDefined();
    });

    it("handles file drop", async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: true, photos: [] }),
        } as Response),
      );

      renderDropzone();

      const uploadZone = screen.getByRole("button", { name: "Upload photos" });
      const file = createMockFile("dropped.jpg", "image/jpeg", 2048);

      fireEvent.drop(uploadZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(mockCreateObjectURL).toHaveBeenCalled();
      });
    });
  });

  describe("File selection", () => {
    it("triggers file input click when upload zone is clicked", async () => {
      const user = userEvent.setup();
      const { container } = renderDropzone();

      const uploadZone = screen.getByRole("button", { name: "Upload photos" });
      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const clickSpy = vi.spyOn(fileInput, "click");

      await user.click(uploadZone);

      expect(clickSpy).toHaveBeenCalled();
    });

    it("triggers file input on Enter key press", () => {
      const { container } = renderDropzone();

      const uploadZone = screen.getByRole("button", { name: "Upload photos" });
      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      const clickSpy = vi.spyOn(fileInput, "click");

      fireEvent.keyDown(uploadZone, { key: "Enter" });

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe("Upload progress", () => {
    it("shows file entries with uploading state", async () => {
      global.fetch = vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: async () => ({ success: true, photos: [] }),
              } as Response);
            }, 200);
          }),
      );

      const { container } = renderDropzone();

      const file = createMockFile("test.jpg", "image/jpeg", 1024);
      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText("test.jpg")).toBeDefined();
        const spinner = container.querySelector(".animate-spin");
        expect(spinner).not.toBeNull();
      });
    });

    it("shows file size in entry", async () => {
      global.fetch = vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: async () => ({ success: true, photos: [] }),
              } as Response);
            }, 200);
          }),
      );

      const { container } = renderDropzone();

      const file = createMockFile("test.jpg", "image/jpeg", 2048);
      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText("2.0 KB")).toBeDefined();
      });
    });

    it("shows error message on upload failure", async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: async () => ({
            error: { code: "UNKNOWN_ERROR", message: "Server error" },
          }),
        } as Response),
      );

      const { container } = renderDropzone();

      const file = createMockFile("test.jpg", "image/jpeg", 1024);
      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText("Server error")).toBeDefined();
      });
    });
  });

  describe("Multiple file selection", () => {
    it("accepts multiple valid files", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ success: true, photos: [] }),
        } as Response),
      );
      global.fetch = mockFetch;

      const { container } = renderDropzone();

      const file1 = createMockFile("photo1.jpg", "image/jpeg", 1024);
      const file2 = createMockFile("photo2.png", "image/png", 2048);
      const fileInput = container.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [file1, file2] } });

      await waitFor(() => {
        expect(screen.getByText("photo1.jpg")).toBeDefined();
        expect(screen.getByText("photo2.png")).toBeDefined();
      });

      // Should have called fetch with FormData containing both files
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/trips/trip-123/photos",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          body: expect.any(FormData),
        }),
      );
    });
  });

  describe("Accessibility", () => {
    it("has aria-label on file input", () => {
      const { container } = renderDropzone();

      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput?.getAttribute("aria-label")).toBe("Upload photo files");
    });

    it("has aria-label on upload zone", () => {
      renderDropzone();

      const uploadZone = screen.getByRole("button", { name: "Upload photos" });
      expect(uploadZone.getAttribute("aria-label")).toBe("Upload photos");
    });

    it("supports keyboard navigation on upload zone", () => {
      renderDropzone();

      const uploadZone = screen.getByRole("button", { name: "Upload photos" });
      expect(uploadZone.tabIndex).toBe(0);
    });
  });
});
