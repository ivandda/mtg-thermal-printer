/** The browser's localStorage, or undefined where it is blocked, e.g. in some private windows. */
export function localStore() {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}
