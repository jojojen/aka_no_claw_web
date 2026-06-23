import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

// jsdom doesn't implement scrollIntoView; stub it globally so component tests pass.
Element.prototype.scrollIntoView = vi.fn();

// jsdom here doesn't expose a working localStorage; provide a tiny in-memory one
// so session-id persistence (aka_no_claw#44) is testable.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => store.delete(k),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryStorage,
    configurable: true,
  });
}
