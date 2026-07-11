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

/**
 * firebase-admin v14 exports `cert` as a top-level named export in addition
 * to `credential.cert`. The push.service.ts uses `admin.cert(...)` directly.
 */
export const cert = mockCert;

/**
 * firebase-admin/messaging v14 API.
 * getMessaging(app) returns app.messaging() — in tests this is the mock
 * messaging instance with { send: mockSend }.
 */
export const getMessaging = vi
  .fn()
  .mockImplementation((app: { messaging: () => { send: typeof mockSend } }) =>
    app.messaging(),
  );

const mockDefault = {
  initializeApp: mockInitializeApp,
  credential,
  cert: mockCert,
};

export default mockDefault;
