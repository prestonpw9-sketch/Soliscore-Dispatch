import { BrowserRouter, Routes, Route } from "react-router-dom"
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
  </ThemeProvider>
);

export default App;