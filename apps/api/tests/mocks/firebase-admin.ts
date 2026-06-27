/**
 * Standalone mock for firebase-admin.
 *
 * This IS the module — vitest's resolve.alias redirects all imports of
 * "firebase-admin" to this file. Because this bypasses vi.mock() entirely,
 * vi.restoreAllMocks() in other tests cannot undo this mock.
 *
 * All mock functions are created at module scope so callers can grab
 * references before tests run.
 */
import { vi } from "vitest";

export const mockSend = vi.fn().mockResolvedValue("message-id-123");
export const mockMessaging = vi.fn(() => ({ send: mockSend }));
export const mockInitializeApp = vi.fn(() => ({
  messaging: mockMessaging,
}));
export const mockCert = vi.fn(() => "mock-credential");

export const initializeApp = mockInitializeApp;
export const credential = {
  cert: mockCert,
};

const mockDefault = {
  initializeApp: mockInitializeApp,
  credential,
};

export default mockDefault;
