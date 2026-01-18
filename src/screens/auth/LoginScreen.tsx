// src/screens/auth/LoginScreen.tsx
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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../theme';
import { auth } from '../../firebase/config';
import { trackLogin } from '../../utils/Analytics-utils';

export const LoginScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, loading } = useAuth();
  const { colors } = useTheme();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
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
  const handleGoogleSignIn = async () => {
    try {
      // Dynamically import Google Sign-In
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      
      // Sign out first to show account picker
      await GoogleSignin.signOut();
      
      // Check if your device supports Google Play
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      
      // Get the users ID token
      const signInResult = await GoogleSignin.signIn();

      // Try the new style of google-sign in result, from v13+ of that module
      let idToken = signInResult.data?.idToken;
      if (!idToken) {
        throw new Error('No ID token found');
      }

      // Create a Google credential with the token
      const googleCredential = GoogleAuthProvider.credential(idToken);

      // Sign-in the user with the credential
      const userCredential = await signInWithCredential(auth, googleCredential);
      
      // Track Google login for analytics
      trackLogin('google', userCredential.user.uid);
      
      // Navigation will happen automatically via auth state change
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      Alert.alert('Error', error.message || 'Failed to sign in with Google');
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoggingIn(true);
    try {
      await login(email, password);
      
      // Track email login for analytics
      if (auth.currentUser) {
        trackLogin('email', auth.currentUser.uid);
      }
      
      // Navigation will happen automatically via auth state listener
    } catch (error: any) {
      let errorMessage = 'Failed to login';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many attempts. Please try again later';
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password';
      }
      
      Alert.alert('Login Failed', errorMessage);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Logo/Header */}
        <View style={styles.header}>
          <Image 
            source={require('../../../assets/images/logo.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Welcome to NovlNest</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        {isGoogleSignInAvailable && (
          <TouchableOpacity 
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
          >
            <Ionicons name="logo-google" size={20} color="#fff" />
            <Text style={styles.googleButtonText}>Sign in with Google</Text>
          </TouchableOpacity>
        )}

        {/* Input Fields */}
        <View style={styles.inputContainer}>
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
              editable={!isLoggingIn}
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
              autoComplete="password"
              editable={!isLoggingIn}
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
        </View>

        {/* Forgot Password */}
        <TouchableOpacity 
          style={styles.forgotPassword}
          disabled={isLoggingIn}
          onPress={() => navigation.navigate('ForgotPassword')}
        >
          <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
        </TouchableOpacity>

        {/* Login Button */}
        <TouchableOpacity
          style={[styles.button, isLoggingIn && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isLoggingIn}
        >
          {isLoggingIn ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        {/* Sign Up Link */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity 
            onPress={() => navigation.navigate('Signup')}
            disabled={isLoggingIn}
          >
            <Text style={styles.footerLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl * 2,
  },
  logo: {
    width: 80,
    height: 80,
  },
  title: {
    ...typography.h1,
    color: themeColors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: themeColors.textSecondary,
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
    marginBottom: spacing.lg,
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: spacing.md,
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
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: spacing.lg,
  },
  forgotPasswordText: {
    ...typography.bodySmall,
    color: themeColors.primary,
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