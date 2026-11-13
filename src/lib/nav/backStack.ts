/**
 * One place that decides what "back" means. Every open dialog, sheet, or
 * full-screen view registers a close handler; Android's hardware back /
 * back gesture (and Escape on desktop) closes the topmost one. With nothing
 * open, the app falls back to the screen handler (e.g. return to the
 * Dispatch Board) and only exits from the main screen.
 *
 * The native back listener uses the App plugin object the Capacitor shell
 * injects (`window.Capacitor.Plugins.App`), not a second bundled
 * @capacitor/core (see lib/geofence/nativeClient.ts for why).
 */
import { useEffect, useRef } from 'react';

type Handler = () => void;

interface Entry { id: number; handler: { current: Handler } }

const stack: Entry[] = [];
let nextId = 1;
let screenHandler: (() => boolean) | null = null;

/** Close the topmost open layer. Returns true when something handled it. */
export function handleBack(): boolean {
  const top = stack[stack.length - 1];
  if (top) {
    top.handler.current();
    return true;
  }
  return screenHandler ? screenHandler() : false;
}

export function openLayerCount(): number {
  return stack.length;
}

/** Register `onBack` while `active` is true. Later registrations sit on top. */
export function useBackHandler(active: boolean, onBack: Handler): void {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    const entry: Entry = { id: nextId++, handler: ref };
    stack.push(entry);
    return () => {
      const i = stack.findIndex(e => e.id === entry.id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

/**
 * Screen-level fallback when no layer is open: return true if it navigated
 * (e.g. switched to the Dispatch Board), false to let the app exit.
 */
export function setScreenBackHandler(handler: (() => boolean) | null): void {
  screenHandler = handler;
}

interface BridgeApp {
  addListener?: (event: 'backButton', cb: (e: { canGoBack?: boolean }) => void) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
  exitApp?: () => Promise<void>;
}

interface BridgeShell {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  Plugins?: { App?: BridgeApp };
}

export function appPluginFromBridge(cap: BridgeShell | null | undefined): BridgeApp | null {
  if (!cap?.isNativePlatform?.()) return null;
  if (cap.isPluginAvailable && !cap.isPluginAvailable('App')) return null;
  const app = cap.Plugins?.App;
  return app?.addListener ? app : null;
}

/**
 * Install the Android back listener once. Registering any backButton
 * listener turns off Capacitor's default (which exits when the WebView has
 * no history, the bug Preston hit).
 */
export function installNativeBack(cap?: BridgeShell | null): () => void {
  const shell = cap ?? (typeof window !== 'undefined' ? (window as Window & { Capacitor?: BridgeShell }).Capacitor : undefined);
  const app = appPluginFromBridge(shell);
  if (!app?.addListener) return () => {};
  let handle: { remove: () => Promise<void> } | null = null;
  let removed = false;
  void Promise.resolve(app.addListener('backButton', () => {
    if (handleBack()) return;
    void app.exitApp?.();
  })).then(h => {
    handle = h;
    if (removed) void h.remove();
  });
  return () => { removed = true; void handle?.remove(); };
}
