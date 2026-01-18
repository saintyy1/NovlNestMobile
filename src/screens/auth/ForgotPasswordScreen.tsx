// src/screens/auth/ForgotPasswordScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../theme';

export const ForgotPasswordScreen = ({ navigation, route }: any) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { resetPassword } = useAuth();
  const { colors } = useTheme();

  const styles = getStyles(colors);

  const handleSendResetEmail = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      console.log('Attempting to send password reset email to:', email);
      await resetPassword(email);
      console.log('Password reset email sent successfully');
      Alert.alert(
        'Email Sent',
        'A password reset link has been sent to your email. Please check your inbox and spam folder.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error: any) {
      console.error('Password reset error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      let errorMessage = 'Failed to send reset email. Please try again.';
      
      if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many requests. Please try again later';
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address';
      } else if (error.code === 'auth/missing-email') {
        errorMessage = 'Email address is required';
      } else {
        // Show the actual error for debugging
        errorMessage = `Error: ${error.message || 'Unknown error occurred'}`;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="mail" size={64} color={colors.primary} />
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>
              Enter your email address and we'll send you a link to reset your password
            </Text>
          </View>

          {/* Email Input */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons 
                name="mail-outline" 
                size={20} 
                color={colors.textSecondary} 
                style={styles.inputIcon} 
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!isLoading}
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          {/* Send Reset Email Button */}
          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSendResetEmail}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>

          {/* Back to Login Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Remember your password? </Text>
            <TouchableOpacity 
              onPress={() => navigation.navigate('Login')}
              disabled={isLoading}
            >
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.h1,
    color: themeColors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: themeColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: themeColors.text,
    paddingVertical: spacing.md,
  },
  requirementsContainer: {
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  requirementsTitle: {
    ...typography.h3,
    fontWeight: '600',
    color: themeColors.text,
    marginBottom: spacing.sm,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  requirementText: {
    ...typography.h3,
    color: themeColors.textSecondary,
    marginLeft: spacing.sm,
  },
  button: {
    backgroundColor: themeColors.primary,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...typography.body,
    fontWeight: '600',
    color: '#fff',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  footerText: {
    ...typography.body,
    color: themeColors.textSecondary,
  },
  footerLink: {
    ...typography.body,
    color: themeColors.primary,
    fontWeight: '600',
  },
});
