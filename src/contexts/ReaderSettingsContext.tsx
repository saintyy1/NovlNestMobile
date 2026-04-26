import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type ReaderThemeType = 
  | 'light' 
  | 'dark' 
  | 'sepia' 
  | 'slate' 
  | 'oled' 
  | 'green' 
  | 'sky' 
  | 'lavender' 
  | 'rose' 
  | 'coffee';

export type FontFamilyType = 
  | 'System' 
  | 'Georgia' 
  | 'Gill Sans' 
  | 'Grantha Sangam MN' 
  | 'Helvetica Neue' 
  | 'Hiragino Maru Gothic ProN' 
  | 'Hiragino Sans' 
  | 'Noto Sans' 
  | 'Iowan Old Style' 
  | 'Palatino' 
  | 'Baskerville' 
  | 'Times New Roman' 
  | 'Courier' 
  | 'Avenir' 
  | 'Optima' 
  | 'Futura' 
  | 'Verdana' 
  | 'Trebuchet MS' 
  | 'Arial' 
  | 'Charter';

interface ReaderThemeColors {
  background: string;
  text: string;
  textSecondary: string;
  border: string;
  activeAccent: string;
}

export const ReaderThemes: Record<ReaderThemeType, ReaderThemeColors> = {
  light: {
    background: '#FFFFFF',
    text: '#000000',
    textSecondary: '#666666',
    border: '#E5E7EB',
    activeAccent: '#8B5CF6',
  },
  dark: {
    background: '#111827',
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    border: '#374151',
    activeAccent: '#A78BFA',
  },
  sepia: {
    background: '#F4ECD8',
    text: '#5B4636',
    textSecondary: '#8C7851',
    border: '#E0D5C1',
    activeAccent: '#92400E',
  },
  slate: {
    background: '#1E293B',
    text: '#F1F5F9',
    textSecondary: '#94A3B8',
    border: '#334155',
    activeAccent: '#38BDF8',
  },
  oled: {
    background: '#000000',
    text: '#FFFFFF',
    textSecondary: '#9CA3AF',
    border: '#1F2937',
    activeAccent: '#A78BFA',
  },
  green: {
    background: '#E6F4EA',
    text: '#064E3B',
    textSecondary: '#065F46',
    border: '#D1FAE5',
    activeAccent: '#059669',
  },
  sky: {
    background: '#F0F9FF',
    text: '#0C4A6E',
    textSecondary: '#0369A1',
    border: '#BAE6FD',
    activeAccent: '#0EA5E9',
  },
  lavender: {
    background: '#F5F3FF',
    text: '#4C1D95',
    textSecondary: '#6D28D9',
    border: '#DDD6FE',
    activeAccent: '#8B5CF6',
  },
  rose: {
    background: '#FFF1F2',
    text: '#881337',
    textSecondary: '#BE123C',
    border: '#FECDD3',
    activeAccent: '#F43F5E',
  },
  coffee: {
    background: '#3E2723',
    text: '#EFEBE9',
    textSecondary: '#BCAAA4',
    border: '#5D4037',
    activeAccent: '#D7CCC8',
  },
};

interface ReaderSettingsContextType {
  fontSize: number;
  setFontSize: (size: number) => void;
  fontFamily: FontFamilyType;
  setFontFamily: (family: FontFamilyType) => void;
  readerTheme: ReaderThemeType;
  setReaderTheme: (theme: ReaderThemeType) => void;
  isPagingEnabled: boolean;
  setIsPagingEnabled: (enabled: boolean) => void;
  readerColors: ReaderThemeColors;
}

const ReaderSettingsContext = createContext<ReaderSettingsContextType | undefined>(undefined);

export const ReaderSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fontSize, setFontSizeState] = useState(18);
  const [fontFamily, setFontFamilyState] = useState<FontFamilyType>('Georgia');
  const [readerTheme, setReaderThemeState] = useState<ReaderThemeType>('light');
  const [isPagingEnabled, setIsPagingEnabledState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load preferences from AsyncStorage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedFontSize = await AsyncStorage.getItem('reader_fontSize');
        const savedFontFamily = await AsyncStorage.getItem('reader_fontFamily');
        const savedTheme = await AsyncStorage.getItem('reader_theme');
        const savedPaging = await AsyncStorage.getItem('reader_paging');

        if (savedFontSize) setFontSizeState(parseInt(savedFontSize, 10));
        if (savedFontFamily) setFontFamilyState(savedFontFamily as FontFamilyType);
        if (savedTheme) setReaderThemeState(savedTheme as ReaderThemeType);
        if (savedPaging) setIsPagingEnabledState(savedPaging === 'true');
      } catch (error) {
        console.error('Error loading reader settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const setFontSize = async (size: number) => {
    setFontSizeState(size);
    await AsyncStorage.setItem('reader_fontSize', size.toString());
  };

  const setFontFamily = async (family: FontFamilyType) => {
    setFontFamilyState(family);
    await AsyncStorage.setItem('reader_fontFamily', family);
  };

  const setReaderTheme = async (theme: ReaderThemeType) => {
    setReaderThemeState(theme);
    await AsyncStorage.setItem('reader_theme', theme);
  };

  const setIsPagingEnabled = async (enabled: boolean) => {
    setIsPagingEnabledState(enabled);
    await AsyncStorage.setItem('reader_paging', enabled.toString());
  };

  const readerColors = ReaderThemes[readerTheme];

  if (isLoading) return null;

  return (
    <ReaderSettingsContext.Provider
      value={{
        fontSize,
        setFontSize,
        fontFamily,
        setFontFamily,
        readerTheme,
        setReaderTheme,
        isPagingEnabled,
        setIsPagingEnabled,
        readerColors,
      }}
    >
      {children}
    </ReaderSettingsContext.Provider>
  );
};

export const useReaderSettings = () => {
  const context = useContext(ReaderSettingsContext);
  if (context === undefined) {
    throw new Error('useReaderSettings must be used within a ReaderSettingsProvider');
  }
  return context;
};
