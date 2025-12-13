import { StyleSheet } from 'react-native';

/**
 * Helper function to create theme-aware styles
 * Pass a style object with color references and get back a version
 * that uses actual theme colors
 */
export const createThemeStyles = (
  stylesFn: (colors: any) => any,
  colors: any
) => {
  return StyleSheet.create(stylesFn(colors));
};

/**
 * Create a base styles object that uses placeholder colors
 * Call this with your theme colors to get the actual styles
 */
export const getThemeColor = (colorName: string, colors: any) => {
  const colorMap: Record<string, keyof typeof colors> = {
    primary: 'primary',
    secondary: 'secondary',
    background: 'background',
    backgroundSecondary: 'backgroundSecondary',
    text: 'text',
    textSecondary: 'textSecondary',
    border: 'border',
    error: 'error',
    success: 'success',
    warning: 'warning',
    surface: 'surface',
    surfaceSecondary: 'surfaceSecondary',
    card: 'card',
    cardBorder: 'cardBorder',
  };

  const key = colorMap[colorName];
  return key ? colors[key] : colorName;
};
