import { BrowserRouter, Routes, Route } from "react-router-dom"
import { SpeedInsights } from "@vercel/speed-insights/react"
import AppLayout from "./components/AppLayout";

// Inline ThemeProvider Fallback
const ThemeProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

const App = () => (
  <ThemeProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />} />
        <Route path="*" element={<AppLayout />} />
      </Routes>
    </BrowserRouter>
    <SpeedInsights />
  </ThemeProvider>
);

export default App;