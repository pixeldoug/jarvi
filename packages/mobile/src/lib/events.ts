/**
 * App-wide signals that cross provider boundaries (the API client raises
 * them; the auth and subscription providers react). Plays the role the web
 * app gives to `window` CustomEvents.
 */
type AppEvent = 'unauthorized' | 'subscription_required';
type Listener = () => void;

const listeners = new Map<AppEvent, Set<Listener>>();

export const appEvents = {
  emit(event: AppEvent): void {
    listeners.get(event)?.forEach((listener) => listener());
  },

  on(event: AppEvent, listener: Listener): () => void {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(event, set);
    return () => {
      set.delete(listener);
    };
  },
};
