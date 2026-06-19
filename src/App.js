import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';
// ── Theme provider ─────────────────────────────────────────────────────────
// Inline fallback until a real ThemeProvider is wired up.
// Replace this with your actual provider when ready.
const ThemeProvider = ({ children }) => (_jsx(_Fragment, { children: children }));
// ── 404 fallback ───────────────────────────────────────────────────────────
// FIX: catch-all path="*" previously rendered AppLayout again, giving no
// indication to the user that the URL they typed was invalid.
// A minimal inline 404 is better than silently showing the dashboard.
function NotFound() {
    return (_jsxs("div", { className: "min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-center p-8", children: [_jsx("p", { className: "text-6xl font-black text-slate-200 dark:text-slate-800 select-none", children: "404" }), _jsx("h1", { className: "text-xl font-bold text-slate-900 dark:text-white mt-2", children: "Page not found" }), _jsx("p", { className: "text-sm text-slate-500 mt-1 mb-6", children: "The URL you entered doesn't exist in this application." }), _jsx("a", { href: "/", className: "text-sm font-semibold text-indigo-600 hover:text-indigo-500 transition-colors", children: "\u2190 Back to Dashboard" })] }));
}
// ── App ────────────────────────────────────────────────────────────────────
const App = () => (_jsx(ThemeProvider, { children: _jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(AppLayout, {}) }), _jsx(Route, { path: "*", element: _jsx(NotFound, {}) })] }) }) }));
export default App;
