import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES } from '../constants/themes';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState('cosmos');

  useEffect(() => {
    AsyncStorage.getItem('app_theme').then(saved => {
      if (saved && THEMES[saved]) setThemeId(saved);
    });
  }, []);

  const setTheme = async (id) => {
    setThemeId(id);
    await AsyncStorage.setItem('app_theme', id);
  };

  return (
    <ThemeContext.Provider value={{ themeId, colors: THEMES[themeId], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
