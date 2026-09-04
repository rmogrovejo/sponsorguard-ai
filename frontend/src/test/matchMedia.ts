const emptyMedia = {
  matches: false,
  media: "",
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
};

export function stubMatchMedia(initialDark = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = initialDark;
  const darkQuery = "(prefers-color-scheme: dark)";
  const darkList = {
    get matches() {
      return matches;
    },
    media: darkQuery,
    onchange: null as ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null,
    addEventListener: (_type: string, listener: EventListener) => {
      listeners.add(listener as (event: MediaQueryListEvent) => void);
    },
    removeEventListener: (_type: string, listener: EventListener) => {
      listeners.delete(listener as (event: MediaQueryListEvent) => void);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  };

  window.matchMedia = ((query: string) => {
    if (query.includes("prefers-color-scheme: dark")) {
      return darkList as MediaQueryList;
    }
    return { ...emptyMedia, media: query } as MediaQueryList;
  }) as typeof window.matchMedia;

  return {
    setDark(next: boolean) {
      matches = next;
      const event = { matches: next, media: darkQuery } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}
