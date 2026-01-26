// src/screens/auth/SignupScreen.tsx
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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleAuthProvider, OAuthProvider, signInWithCredential } from 'firebase/auth';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../theme';
import { auth } from '../../firebase/config';
import { trackSignUp } from '../../utils/Analytics-utils';

export const SignupScreen = ({ navigation }: any) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register, loading } = useAuth();
  const { colors } = useTheme();
  const [isRegistering, setIsRegistering] = useState(false);
  const [isGoogleSignInAvailable, setIsGoogleSignInAvailable] = useState(false);

  const styles = getStyles(colors);

  // Configure Google Sign-In (only works in native builds, not Expo Go)
  React.useEffect(() => {
    const setupGoogleSignIn = async () => {
      try {
        // Check if we're in Expo Go (appOwnership === 'expo')
        const isExpoGo = Constants.appOwnership === 'expo';
        if (isExpoGo) {
          console.log('Running in Expo Go - Google Sign-In disabled');
          return;
        }

        // Dynamically import Google Sign-In (only available in native builds)
        const { GoogleSignin } = require('@react-native-google-signin/google-signin');

        await GoogleSignin.configure({
          webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
          offlineAccess: true,
        });
        setIsGoogleSignInAvailable(true);
        console.log('Google Sign-In configured successfully');
      } catch (error) {
        console.log('Google Sign-In not available:', error);
        setIsGoogleSignInAvailable(false);
      }
    };

    setupGoogleSignIn();
  }, []);

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Apple Sign-In failed: no identity token');
      }

      // ✅ Firebase Apple OAuth provider
      const provider = new OAuthProvider('apple.com');

      const firebaseCredential = provider.credential({
        idToken: credential.identityToken,
      });

      const userCredential = await signInWithCredential(
        auth,
        firebaseCredential
      );

      trackSignUp('apple', userCredential.user.uid);

    } catch (error: any) {
      if (error.code === 'ERR_CANCELED') {
        // User cancelled Apple login
        return;
      }

      console.error('Apple Sign-In Error:', error);
      Alert.alert(
        'Sign in failed',
        error.message || 'Unable to sign in with Apple'
      );
    }
  };


  const handleGoogleSignUp = async () => {
    try {
      // Dynamically import Google Sign-In
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');

      // Sign out first to show account picker
      await GoogleSignin.signOut();

      // Check if your device supports Google Play
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Get the users ID token
      const signInResult = await GoogleSignin.signIn();

      // Get ID token from the result
      let idToken = signInResult.data?.idToken;
      if (!idToken) {
        throw new Error('No ID token found');
      }

      // Create a Google credential with the token
      const googleCredential = GoogleAuthProvider.credential(idToken);

      // Sign-in the user with the credential
      const userCredential = await signInWithCredential(auth, googleCredential);

      // Track Google signup for analytics
      trackSignUp('google', userCredential.user.uid);

      // Navigation will happen automatically via auth state change
    } catch (error: any) {
      console.error('Google Sign-Up Error:', error);
      Alert.alert('Error', error.message || 'Failed to sign up with Google');
    }
  };

  const handleSignup = async () => {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setIsRegistering(true);
    try {
      await register(email, password, name);

      // Track email signup for analytics
      if (auth.currentUser) {
        trackSignUp('email', auth.currentUser.uid);
      }

      Alert.alert(
        'Account Created!',
        'Please check your email to verify your account.',
        [{ text: 'OK' }]
      );
      // Navigation will happen automatically via auth state listener
    } catch (error: any) {
      let errorMessage = 'Failed to create account';

      if (error.message === 'This display name is already taken. Try another one.') {
        errorMessage = error.message;
      } else if (error.message === 'Display name must be at least 2 characters long') {
        errorMessage = error.message;
      } else if (error.message === 'Display name must not exceed 50 characters') {
        errorMessage = error.message;
      } else if (error.message === 'Display name can only contain letters, numbers, spaces, hyphens, and apostrophes') {
        errorMessage = error.message;
      } else if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak';
      }

      Alert.alert('Signup Failed', errorMessage);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          {/* Logo/Header */}
          <View style={styles.header}>
            <Image
              source={require('../../../assets/images/app-icon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join NovlNest today</Text>
          </View>


          <View style={styles.socialAuthContainer}>
            {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={6}
              style={{ width: '100%', height: 44 }}
              onPress={handleAppleSignIn}
            />
            )}

            {isGoogleSignInAvailable && (
              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleSignUp}
              >
                <Ionicons name="logo-google" size={20} color="#fff" />
                <Text style={styles.googleButtonText}>Sign up with Google</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.orContainer}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.orLine} />
          </View>

          {/* Input Fields */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Display Name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                editable={!isRegistering}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!isRegistering}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={!isRegistering}
                placeholderTextColor={colors.textSecondary}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                editable={!isRegistering}
                placeholderTextColor={colors.textSecondary}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <Ionicons
                  name={showConfirmPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Signup Button */}
          <TouchableOpacity
            style={[styles.button, isRegistering && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={isRegistering}
          >
            {isRegistering ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          {/* Login Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              disabled={isRegistering}
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
  logo: {
    width: 80,
    height: 80,
  },
  title: {
    ...typography.h1,
    color: themeColors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: themeColors.textSecondary,
  },
  socialAuthContainer: {
    width: '100%',
    gap: spacing.md,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  orContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,

  },

  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB', // light gray
  },

  orText: {
    marginHorizontal: 12,
    fontSize: 14,
    color: '#6B7280', // muted gray
    fontWeight: '500',
  },

  inputContainer: {
    marginBottom: spacing.lg,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 10,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: themeColors.surface,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: themeColors.text,
  },
  button: {
    backgroundColor: themeColors.primary,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
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