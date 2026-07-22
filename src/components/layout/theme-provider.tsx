'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

type ThemeProviderContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
};

const ThemeProviderContext = createContext<ThemeProviderContextType>({
  theme: 'system',
  setTheme: () => null,
  toggleTheme: () => null,
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [isDark, setIsDark] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = (localStorage.getItem('app-theme') as Theme) || 'light';
    setThemeState(savedTheme);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.remove('light', 'dark');

    let effectiveTheme = theme;
    if (theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
      setIsDark(true);
    } else {
      root.classList.add('light');
      setIsDark(false);
    }

    localStorage.setItem('app-theme', theme);
  }, [theme, mounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme, toggleTheme, isDark }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  return useContext(ThemeProviderContext);
};
