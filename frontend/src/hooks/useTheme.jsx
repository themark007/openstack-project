import { useState, useEffect, createContext, useContext } from 'react';
const Ctx = createContext(null);
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('sns-theme') || 'dark');
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('sns-theme', theme); }, [theme]);
  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  return <Ctx.Provider value={{ theme, toggle, isDark: theme==='dark' }}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="theme-toggle" onClick={toggle} title={`Switch to ${theme==='dark'?'light':'dark'} mode`}>
      <div className="theme-toggle-knob">{theme==='dark'?'🌙':'☀️'}</div>
    </button>
  );
}