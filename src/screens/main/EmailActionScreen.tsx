import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../firebase/config';
import { 
  applyActionCode, 
  checkActionCode, 
  verifyPasswordResetCode, 
  confirmPasswordReset 
} from 'firebase/auth';

interface EmailActionScreenProps {
  navigation: any;
  route: any;
}

type ActionMode = 'resetPassword' | 'verifyEmail' | 'recoverEmail';

const EmailActionScreen: React.FC<EmailActionScreenProps> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<ActionMode | null>(null);
  const [actionCode, setActionCode] = useState<string | null>(null);

  useEffect(() => {
    handleEmailAction();
  }, []);

  const handleEmailAction = async () => {
    try {
      // Extract parameters from the URL
      // URL format: https://novlnest.com/auth/action?mode=...&oobCode=...&apiKey=...
      const params = route.params;
      const actionMode = params?.mode;
      const oobCode = params?.oobCode;

      if (!actionMode || !oobCode) {
        setError('Invalid or expired link. Please request a new one.');
        setLoading(false);
        return;
      }

      setMode(actionMode);
      setActionCode(oobCode);

      // Verify the action code first
      const info = await checkActionCode(auth, oobCode);

      switch (actionMode) {
        case 'verifyEmail':
          await handleVerifyEmail(oobCode);
          break;
        case 'resetPassword':
          // For password reset, we need to show a screen to enter new password
          // For now, we'll just verify the code and show a message
          await handleResetPassword(oobCode);
          break;
        case 'recoverEmail':
          await handleRecoverEmail(oobCode);
          break;
        default:
          setError('Unknown action type. Please contact support.');
      }
    } catch (err: any) {
      console.error('Email action error:', err);
      
      if (err.code === 'auth/expired-action-code') {
        setError('This link has expired. Please request a new one.');
      } else if (err.code === 'auth/invalid-action-code') {
        setError('This link is invalid or has already been used.');
      } else if (err.code === 'auth/user-disabled') {
        setError('This account has been disabled.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else {
        setError(err.message || 'An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (oobCode: string) => {
    try {
      // Apply the action code to verify email
      await applyActionCode(auth, oobCode);
      
      // Reload the current user to get updated email verification status
      if (auth.currentUser) {
        await auth.currentUser.reload();
        await refreshUser();
      }
      
      setSuccess('Email verified successfully! Your account is now active.');
    } catch (err) {
      throw err;
    }
  };

  const handleResetPassword = async (oobCode: string) => {
    try {
      // Verify the password reset code
      const email = await verifyPasswordResetCode(auth, oobCode);
      
      // For security, we should show a form to enter new password
      // For now, we'll just show the email and a message
      setSuccess(`Password reset link verified for ${email}. Please use the website to complete the password reset, or use "Forgot Password" in the app.`);
    } catch (err) {
      throw err;
    }
  };

  const handleRecoverEmail = async (oobCode: string) => {
    try {
      // Apply the action code to recover email
      await applyActionCode(auth, oobCode);
      
      // Reload the current user
      if (auth.currentUser) {
        await auth.currentUser.reload();
        await refreshUser();
      }
      
      setSuccess('Email recovered successfully! Your account has been restored.');
    } catch (err) {
      throw err;
    }
  };

  const handleGoBack = () => {
    navigation.navigate('MainTabs');
  };

  const getIcon = () => {
    if (loading) return null;
    if (error) return <Ionicons name="close-circle" size={80} color="#EF4444" />;
    if (success) return <Ionicons name="checkmark-circle" size={80} color="#10B981" />;
    return null;
  };

  const getTitle = () => {
    if (loading) return 'Processing...';
    if (error) return 'Action Failed';
    if (success) {
      switch (mode) {
        case 'verifyEmail':
          return 'Email Verified!';
        case 'resetPassword':
          return 'Reset Password';
        case 'recoverEmail':
          return 'Email Recovered!';
        default:
          return 'Success!';
      }
    }
    return '';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {loading ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]}>Processing your request...</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              Please wait while we verify your email action.
            </Text>
          </>
        ) : (
          <>
            {getIcon()}
            <Text style={[styles.title, { color: colors.text }]}>{getTitle()}</Text>
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              {error || success}
            </Text>
            
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={handleGoBack}
            >
              <Text style={styles.buttonText}>
                {error ? 'Go Back' : 'Continue to App'}
              </Text>
            </TouchableOpacity>

            {error && mode === 'verifyEmail' && (
              <TouchableOpacity 
                style={[styles.secondaryButton, { borderColor: colors.primary }]}
                onPress={() => navigation.navigate('Settings')}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                  Request New Verification Email
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
    marginTop: 15,
    borderWidth: 2,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default EmailActionScreen;
