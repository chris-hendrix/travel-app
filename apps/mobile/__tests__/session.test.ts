import { beforeEach, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

import { clearToken, getToken, setToken } from "@/lib/session";

// Node has no localStorage; the stub below is the same string-keyed
// contract the web fallback uses, nothing more.
function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  stubLocalStorage();
});

it("round-trips a token through the web fallback store", async () => {
  expect(await getToken()).toBeNull();
  await setToken("mock-token-+15550000001");
  expect(await getToken()).toBe("mock-token-+15550000001");
  await clearToken();
  expect(await getToken()).toBeNull();
});
