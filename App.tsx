// App.tsx
import React, { useEffect } from 'react';
import { NavigationContainer, NavigationState } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from './src/types/navigation';
import { NotificationsScreen } from './src/screens/main/NotificationsScreen';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ChatProvider } from "./src/contexts/ChatContext"
import { NotificationProvider } from './src/contexts/NotificationContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { MainTabNavigator } from './src/components/navigation/MainTabNavigator';
import { AuthNavigator } from './src/components/navigation/AuthNavigator';
import ProfileScreen from './src/screens/main/ProfileScreen';
import SettingsScreen from './src/screens/main/SettingsScreen';
import NovelOverviewScreen from './src/screens/main/NovelOverviewScreen';
import ChaptersListScreen from './src/screens/main/ChaptersListScreen';
import AddChaptersScreen from './src/screens/main/AddChapterScreen';
import EditChapterScreen from './src/screens/main/EditChapterScreen';
import NovelReaderScreen from './src/screens/main/NovelReaderScreen';
import PoemReaderScreen from './src/screens/main/PoemReaderScreen';
import PoemOverviewScreen from './src/screens/main/PoemOverviewScreen';
import PrivacyPolicyScreen from './src/screens/main/PrivacyPolicyScreen';
import TermsOfServiceScreen from './src/screens/main/TermsOfServiceScreen';
import SupportScreen from './src/screens/main/SupportScreen';
import MyTicketsScreen from './src/screens/main/MyTicketsScreen';
import { MessagesScreen } from './src/screens/main/MessagesScreen';
import { PromoteScreen } from './src/screens/main/PromoteScreen';
import PaymentCallbackScreen from './src/screens/main/PaymentCallbackScreen';
import EmailActionScreen from './src/screens/main/EmailActionScreen';
import ChapterEditorScreen from './src/screens/main/ChapterEditorScreen';
import { initializeAnalytics, trackScreenView, setUserId, cleanupAnalytics } from './src/utils/Analytics-utils';

const Stack = createStackNavigator<RootStackParamList>();

// Get the active route name for analytics
const getActiveRouteName = (state: NavigationState | undefined): string => {
  if (!state) return '';
  const route = state.routes[state.index];
  if (route.state) {
    return getActiveRouteName(route.state as NavigationState);
  }
  return route.name;
};

// Create a separate component that uses the auth context and theme
function AppContent() {
  const { currentUser, loading } = useAuth();
  const { colors } = useTheme();
  const routeNameRef = React.useRef<string>('');

  // Initialize analytics when app loads
  useEffect(() => {
    initializeAnalytics(currentUser?.uid);
    
    return () => {
      cleanupAnalytics();
    };
  }, []);

  // Update user ID when auth state changes
  useEffect(() => {
    if (currentUser?.uid) {
      setUserId(currentUser.uid);
    } else {
      setUserId(null);
    }
  }, [currentUser?.uid]);

  // Handle navigation state change for screen tracking
  const onNavigationStateChange = (state: NavigationState | undefined) => {
    const previousRouteName = routeNameRef.current;
    const currentRouteName = getActiveRouteName(state);

    if (previousRouteName !== currentRouteName && currentRouteName) {
      // Track screen view
      trackScreenView(currentRouteName, currentRouteName);
    }

    routeNameRef.current = currentRouteName;
  };

  // Show loading screen while checking auth state
  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      {currentUser ? (
        // Wrap MainTabNavigator in a Stack Navigator to enable Profile navigation
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{
              title: 'Notifications',
              headerStyle: {
                backgroundColor: colors.primary,
              },
              headerTintColor: '#fff',
            }}
          />
          <Stack.Screen
            name="Messages"
            component={MessagesScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              headerShown: true,
              headerStyle: {
                backgroundColor: colors.primary,
              },
              headerTintColor: '#fff',
              headerTitle: 'Settings',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="PrivacyPolicy"
            component={PrivacyPolicyScreen}
            options={{
              headerShown: true,
              headerStyle: {
                backgroundColor: colors.primary,
              },
              headerTintColor: '#fff',
              headerTitle: 'Privacy Policy',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="TermsOfService"
            component={TermsOfServiceScreen}
            options={{
              headerShown: true,
              headerStyle: {
                backgroundColor: colors.primary,
              },
              headerTintColor: '#fff',
              headerTitle: 'Terms of Service',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="Support"
            component={SupportScreen}
            options={{
              headerShown: true,
              headerStyle: {
                backgroundColor: colors.primary,
              },
              headerTintColor: '#fff',
              headerTitle: 'Support',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="MyTickets"
            component={MyTicketsScreen}
            options={{
              headerShown: true,
              headerStyle: {
                backgroundColor: colors.primary,
              },
              headerTintColor: '#fff',
              headerTitle: 'My Tickets',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="NovelOverview"
            component={NovelOverviewScreen}
            options={{
              headerShown: false, // Custom header in component
            }}
          />
          <Stack.Screen
            name="ChaptersList"
            component={ChaptersListScreen}
            options={{
              headerShown: true,
              headerStyle: {
                backgroundColor: colors.primary,
              },
              headerTintColor: '#fff',
              headerTitle: 'All Chapters',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="PoemOverview"
            component={PoemOverviewScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="NovelReader"
            component={NovelReaderScreen}
            options={{
              headerShown: false,
              gestureEnabled: false,
              cardStyleInterpolator: ({ current: { progress } }) => ({
                cardStyle: {
                  opacity: progress,
                },
              }),
            }}
          />
          <Stack.Screen
            name="PoemReader"
            component={PoemReaderScreen}
            options={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="AddChapters"
            component={AddChaptersScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="EditChapter"
            component={EditChapterScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="PromoteScreen"
            component={PromoteScreen}
            options={{
              headerShown: true,
              headerStyle: {
                backgroundColor: colors.primary,
              },
              headerTintColor: '#fff',
              headerTitle: 'Promote Your Novel',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="PaymentCallback"
            component={PaymentCallbackScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="EmailAction"
            component={EmailActionScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="ChapterEditor"
            component={ChapterEditorScreen}
            options={{
              headerShown: true,
            }}
          />
        </Stack.Navigator>
      ) : (
        <AuthNavigator />
      )}
      <StatusBar
        style="light"
        backgroundColor={colors.primary}
        translucent={Platform.OS === 'android'}
      />
    </>
  );
}

export default function App() {
  const linking = {
    prefixes: ['novlnest://', 'https://novlnest.com', 'https://auth.expo.io'],
    config: {
      screens: {
        Auth: 'auth',
        PaymentCallback: 'payment-callback',
        EmailAction: {
          path: 'auth/action',
          parse: {
            mode: (mode: string) => mode,
            oobCode: (oobCode: string) => oobCode,
            apiKey: (apiKey: string) => apiKey,
          },
        },
      },
    },
  };

  return (
    <ThemeProvider>
      <AuthProvider>
        <ChatProvider>
          <NotificationProvider>
            <NavigationContainer 
              linking={linking}
              onStateChange={(state) => {
                const currentRouteName = getActiveRouteName(state);
                if (currentRouteName) {
                  trackScreenView(currentRouteName, currentRouteName);
                }
              }}
            >
              <AppContent />
            </NavigationContainer>
          </NotificationProvider>
        </ChatProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
