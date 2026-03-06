/**
 * API client for communicating with the Tripful backend
 */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/**
 * Normalize an upload path for use in <Image> and <img> tags.
 * Returns the path as-is so Next.js rewrites proxy the request
 * to the API in every environment.
 *
 * Returns undefined for null/undefined input. Passes through absolute
 * URLs (http/https) and blob URLs unchanged.
 */
export function getUploadUrl(
  path: string | null | undefined,
): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http") || path.startsWith("blob:")) return path;
  return path;
}

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "APIError";
  }
}

/**
 * Generic API request wrapper with automatic error handling and credentials
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });

    // Handle 204 No Content responses (e.g. DELETE endpoints)
    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();

    if (!response.ok) {
      const errorCode = data?.error?.code || "UNKNOWN_ERROR";
      const errorMessage = data?.error?.message || "An error occurred";
      throw new APIError(errorCode, errorMessage);
    }

    return data;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("An unexpected error occurred", { cause: error });
  }
}

/**
 * Check the health status of the backend API
 */
export async function checkHealth(): Promise<{
  status: string;
  timestamp: string;
}> {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) {
    throw new Error("Health check failed");
  }
  return response.json();
}
