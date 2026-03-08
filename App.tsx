// App.tsx
import React, { useEffect } from 'react';
import { NavigationContainer, NavigationState } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from './src/types/navigation';
import { NotificationsScreen } from './src/screens/main/NotificationsScreen';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Platform, Alert, Linking, AppState, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { checkAppVersion, AppConfig } from './src/utils/VersionCheck-utils';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

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
  const [forceUpdateConfig, setForceUpdateConfig] = React.useState<AppConfig | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = React.useState(false);

  // Initialize analytics when app loads
  useEffect(() => {
    initializeAnalytics(currentUser?.uid);

    return () => {
      cleanupAnalytics();
    };
  }, []);

  const performVersionCheck = async (isBackground = false) => {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);

    try {
      const { status, config } = await checkAppVersion();

      if (status === 'force_update' && config) {
        setForceUpdateConfig(config);
        setIsCheckingUpdate(false);
        return;
      } else {
        setForceUpdateConfig(null);
      }

      if (status === 'optional_update' && config) {
        const lastPromptKey = `last_update_prompt_${config.latestVersion}`;
        const lastPromptString = await AsyncStorage.getItem(lastPromptKey);

        if (lastPromptString) {
          const lastPromptDate = new Date(parseInt(lastPromptString, 10));
          const now = new Date();
          const hoursSinceLastPrompt = (now.getTime() - lastPromptDate.getTime()) / (1000 * 60 * 60);

          if (hoursSinceLastPrompt < 24) {
            setIsCheckingUpdate(false);
            return;
          }
        }

        const title = `Version ${config.latestVersion} Available`;
        const message = `A new version of NovlNest is available!`;
        const updateUrl = Platform.OS === 'ios' ? config.iosUpdateUrl : config.androidUpdateUrl;

        Alert.alert(title, message, [
          {
            text: 'Later',
            style: 'cancel',
            onPress: async () => {
              await AsyncStorage.setItem(lastPromptKey, Date.now().toString());
            }
          },
          {
            text: 'Update Now',
            onPress: () => Linking.openURL(updateUrl),
          }
        ], {
          cancelable: true,
          onDismiss: async () => {
            await AsyncStorage.setItem(lastPromptKey, Date.now().toString());
          }
        });
      }
    } catch (error) {
      console.error('[VersionCheck] Error in performVersionCheck:', error);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  // Initial check
  useEffect(() => {
    const timer = setTimeout(() => performVersionCheck(), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Re-check when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        performVersionCheck(true);
      }
    });

    return () => {
      subscription.remove();
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

  // Show persistent force update screen
  if (forceUpdateConfig) {
    const updateUrl = Platform.OS === 'ios' ? forceUpdateConfig.iosUpdateUrl : forceUpdateConfig.androidUpdateUrl;

    return (
      <SafeAreaView style={[styles.updateScreen, { backgroundColor: colors.background }]}>
        <View style={styles.updateContent}>
          <View style={[styles.updateIconContainer, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="cloud-download-outline" size={60} color={colors.primary} />
          </View>

          <Text style={[styles.updateTitle, { color: colors.text }]}>Update Required</Text>
          <Text style={[styles.updateSubtitle, { color: colors.textSecondary }]}>
            A new version of NovlNest is required to continue. Please update now to access the latest features and improved experience.
          </Text>

          <TouchableOpacity
            style={[styles.updateButton, { backgroundColor: colors.primary }]}
            onPress={() => Linking.openURL(updateUrl)}
          >
            <Text style={styles.updateButtonText}>Update Now</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkAgainButton}
            onPress={() => performVersionCheck()}
            disabled={isCheckingUpdate}
          >
            {isCheckingUpdate ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.checkAgainText, { color: colors.primary }]}>Check Again</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.updateFooter}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Current Version: {Constants.expoConfig?.version} → {forceUpdateConfig.latestVersion}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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
              headerBackTitle: '',
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
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Update Screen Styles
  updateScreen: {
    flex: 1,
    justifyContent: 'center',
  },
  updateContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  updateIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  updateTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    marginBottom: 16,
    textAlign: 'center',
  },
  updateSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 40,
  },
  updateButton: {
    flexDirection: 'row' as const,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700' as const,
  },
  checkAgainButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  checkAgainText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  updateFooter: {
    paddingBottom: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    opacity: 0.7,
  },
});
