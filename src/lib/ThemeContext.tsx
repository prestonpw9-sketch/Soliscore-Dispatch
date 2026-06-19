import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;          // the user's chosen preference
  resolved: 'light' | 'dark'; // what's actually applied right now
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'soliscore-theme';

const ThemeContext = createContext<ThemeState>({
  mode: 'system',
  resolved: 'light',
  setMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function getSystemPref(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyClass(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  // Tailwind `dark:` utilities key off the `.dark` class…
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  // …while index.css custom properties key off [data-theme]. Set both so the
  // whole app (utilities + CSS variables) switches together.
  root.setAttribute('data-theme', resolved);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'system';
  });
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    mode === 'system' ? getSystemPref() : mode
  );

  // Apply the class whenever the resolved theme changes.
  useEffect(() => {
    applyClass(resolved);
  }, [resolved]);

  // Recompute resolved theme when mode changes.
  useEffect(() => {
    setResolved(mode === 'system' ? getSystemPref() : mode);
  }, [mode]);

  // If on "system", follow OS changes live.
  useEffect(() => {
    if (mode !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setResolved(getSystemPref());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};
