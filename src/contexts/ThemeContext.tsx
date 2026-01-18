import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type ThemeType = 'light' | 'dark';

interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  backgroundSecondary: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
  warning: string;
  surface: string;
  surfaceSecondary: string;
  card: string;
  cardBorder: string;
}

interface ThemeContextType {
  theme: ThemeType;
  colors: ThemeColors;
  toggleTheme: () => Promise<void>;
  setTheme: (theme: ThemeType) => Promise<void>;
}

const lightTheme: ThemeColors = {
  primary: '#6D28D9',
  secondary: '#5856D6',
  background: '#FFFFFF',
  backgroundSecondary: '#F2F2F7',
  text: '#000000',
  textSecondary: '#8E8E93',
  border: '#C7C7CC',
  error: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
  surface: '#FFFFFF',
  surfaceSecondary: '#F2F2F7',
  card: '#FFFFFF',
  cardBorder: '#E5E7EB',
};

const darkTheme: ThemeColors = {
  primary: '#6D28D9',
  secondary: '#7C3AED',
  background: '#111827',
  backgroundSecondary: '#1F2937',
  text: '#FFFFFF',
  textSecondary: '#D1D5DB',
  border: '#374151',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  surface: '#1F2937',
  surfaceSecondary: '#374151',
  card: '#1F2937',
  cardBorder: '#374151',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeType>('dark');
  const [isLoading, setIsLoading] = useState(true);

  // Load saved theme preference on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('appTheme');
        if (savedTheme === 'light' || savedTheme === 'dark') {
          setThemeState(savedTheme);
        }
      } catch (error) {
        console.error('Error loading theme preference:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTheme();
  }, []);

  const setTheme = async (newTheme: ThemeType) => {
    try {
      setThemeState(newTheme);
      await AsyncStorage.setItem('appTheme', newTheme);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const toggleTheme = async () => {
    await setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const colors = theme === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
      {!isLoading && children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
