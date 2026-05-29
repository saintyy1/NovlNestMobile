import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../theme';

interface ErrorRetryViewProps {
  onRetry: () => void | Promise<void>;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export const ErrorRetryView: React.FC<ErrorRetryViewProps> = ({
  onRetry,
  message = "Failed to connect. Please check your internet connection or try again.",
  icon = "wifi-outline",
}) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={64} color={colors.textSecondary} style={styles.icon} />
      <Text style={styles.messageText}>{message}</Text>
      <TouchableOpacity style={styles.button} onPress={onRetry} activeOpacity={0.7}>
        <Ionicons name="refresh-outline" size={18} color="#FFF" style={styles.buttonIcon} />
        <Text style={styles.buttonText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );
};

const getStyles = (themeColors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      backgroundColor: themeColors.background,
    },
    icon: {
      marginBottom: spacing.md,
      opacity: 0.8,
    },
    messageText: {
      ...typography.body,
      color: themeColors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.lg,
      lineHeight: 22,
      fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: themeColors.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: 30,
      shadowColor: themeColors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    },
    buttonIcon: {
      marginRight: 6,
    },
    buttonText: {
      ...typography.body,
      color: '#FFF',
      fontWeight: '600',
    },
  });
