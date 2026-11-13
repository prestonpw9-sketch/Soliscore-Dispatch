/**
 * Back-button stack: topmost layer closes first, then the screen fallback,
 * then exit. Native listener uses the shell's App plugin.
 * Run: npm run test:back
 */
import assert from 'node:assert/strict';
import { appPluginFromBridge, handleBack, installNativeBack, setScreenBackHandler } from '../src/lib/nav/backStack.ts';

// No layers, no screen handler: nothing handles back (app may exit).
assert.equal(handleBack(), false);

// Screen fallback: first back returns to the board, second lets the app exit.
let view = 'payroll';
setScreenBackHandler(() => { if (view !== 'dashboard') { view = 'dashboard'; return true; } return false; });
assert.equal(handleBack(), true);
assert.equal(view, 'dashboard');
assert.equal(handleBack(), false);

// Bridge lookup only inside the native shell and only when registered.
assert.equal(appPluginFromBridge({ isNativePlatform: () => false, Plugins: { App: { addListener: () => ({ remove: async () => {} }) } } }), null);
assert.equal(appPluginFromBridge({ isNativePlatform: () => true, isPluginAvailable: () => false, Plugins: { App: { addListener: () => ({ remove: async () => {} }) } } }), null);

// Native listener: back closes via handleBack, exits only when nothing handled it.
let listener: (() => void) | null = null;
let exits = 0;
const shell = {
  isNativePlatform: () => true,
  isPluginAvailable: (n: string) => n === 'App',
  Plugins: { App: {
    addListener: (_e: 'backButton', cb: () => void) => { listener = cb; return { remove: async () => { listener = null; } }; },
    exitApp: async () => { exits++; },
  } },
};
const uninstall = installNativeBack(shell);
await new Promise(r => setTimeout(r, 0));
view = 'schedule';
listener!();
assert.equal(view, 'dashboard', 'back from another screen returns to the board');
assert.equal(exits, 0);
listener!();
assert.equal(exits, 1, 'back on the board exits');
uninstall();
await new Promise(r => setTimeout(r, 0));
assert.equal(listener, null);

console.log('back-button checks passed');
