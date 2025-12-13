import { initializeApp } from 'firebase/app';
// @ts-ignore: getReactNativePersistence exists in the RN bundle 
// but is often missing from public TypeScript definitions.
import { initializeAuth, getReactNativePersistence, GoogleAuthProvider,  type ActionCodeSettings  } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import Constants from 'expo-constants';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// Get environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize Google Auth Provider
export const googleProvider = new GoogleAuthProvider();


// Action Code Settings for email verification and password reset
// This determines where users are redirected after clicking email links
export const actionCodeSettings: ActionCodeSettings = {
  // URL you want to redirect back to. This must be added to your Firebase Console
  // Go to: Firebase Console > Authentication > Settings > Authorized domains
  // Add your production domain and your custom URL scheme for mobile deep linking
  url: __DEV__ 
    ? 'http://localhost:8081' // Development - adjust port if needed
    : process.env.EXPO_PUBLIC_APP_URL, // Production URL
  
  // This must be true for mobile apps to handle the link in-app
  handleCodeInApp: true,
  
  // iOS Bundle ID - required for iOS deep linking
  // Get this from your app.json under "ios.bundleIdentifier"
  iOS: {
    bundleId: process.env.EXPO_PUBLIC_IOS_BUNDLE_ID,
  },
  
  // Android Package Name - required for Android deep linking
  // Get this from your app.json under "android.package"
  android: {
    packageName: process.env.EXPO_PUBLIC_ANDROID_PACKAGE,
    installApp: true, // Whether to install the app if not already installed
    minimumVersion: '1.0.0', // Minimum app version required
  },
  
  // Dynamic Link domain for Firebase Dynamic Links (optional but recommended)
  // You need to set this up in Firebase Console > Dynamic Links
  // dynamicLinkDomain: 'yourapp.page.link',
};

// Note: Firebase Analytics is not available in React Native the same way as web
// You would use @react-native-firebase/analytics instead if needed

// Configure auth settings
// Note: appVerificationDisabledForTesting is not available in Firebase Web SDK for React Native
// You'll need to handle this differently in mobile

export default app;