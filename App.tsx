// App.tsx
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, NavigationState, LinkingOptions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from './src/types/navigation';
import { NotificationsScreen } from './src/screens/main/NotificationsScreen';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Platform, Linking, AppState, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ChatProvider } from "./src/contexts/ChatContext"
import { NotificationProvider } from './src/contexts/NotificationContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { ReaderSettingsProvider } from './src/contexts/ReaderSettingsContext';
import { MainTabNavigator } from './src/components/navigation/MainTabNavigator';
import { AuthNavigator } from './src/components/navigation/AuthNavigator';
import ProfileScreen from './src/screens/main/ProfileScreen';
import SettingsScreen from './src/screens/main/SettingsScreen';
import SuperAdminScreen from './src/screens/admin/SuperAdminScreen';
import AssignmentDetailScreen from './src/screens/school/AssignmentDetailScreen';
import SubmissionReviewScreen from './src/screens/school/SubmissionReviewScreen';
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
import { ReadingInsightsScreen } from './src/screens/main/ReadingInsightsScreen';
import { BookReadingInsightsScreen } from './src/screens/main/BookReadingInsightsScreen';
import { ClassroomStreamScreen } from './src/screens/school/ClassroomStreamScreen';
import { initializeAnalytics, trackScreenView, setUserId, cleanupAnalytics } from './src/utils/Analytics-utils';
import { checkAppVersion, AppConfig } from './src/utils/VersionCheck-utils';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { navigationRef } from './src/utils/navigation';
import { ensureInitialized, checkVersionAndClearCache } from './src/utils/cache';
import { recoverCrashedSession } from './src/services/readingAnalyticsService';
import * as Notifications from 'expo-notifications';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { getUserReadingStats } from './src/services/readingAnalyticsService';
import { scheduleStreakReminder } from './src/services/localNotificationService';

import { AlertProvider, useAlert } from './src/contexts/AlertContext';
import CustomAlert from './src/components/common/CustomAlert';
import CustomToast from './src/components/common/CustomToast';

import CharacterManagerScreen from './src/screens/main/CharacterManagerScreen';

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
  const { showAlert, showToast } = useAlert();
  const routeNameRef = React.useRef<string>('');
  const [forceUpdateConfig, setForceUpdateConfig] = React.useState<AppConfig | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = React.useState(false);
  const [isCacheReady, setIsCacheReady] = React.useState(false);

  // Initialize push notifications
  usePushNotifications();

  // Initialize analytics, cache, and recover crashed reading sessions when app loads
  useEffect(() => {
    initializeAnalytics(currentUser?.uid);
    recoverCrashedSession();

    // Clear cache if version changed, then ensure initialization
    checkVersionAndClearCache().then(() => {
      ensureInitialized().then(() => setIsCacheReady(true));
    });

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

          if (hoursSinceLastPrompt < 48) {
            setIsCheckingUpdate(false);
            return;
          }
        }

        const title = `Version ${config.latestVersion} Available`;
        const message = `A new version of NovlNest is available!`;
        const updateUrl = Platform.OS === 'ios' ? config.iosUpdateUrl : config.androidUpdateUrl;

        showAlert({
          title: title,
          message: message,
          type: 'info',
          buttons: [
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
          ]
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

  // Check and schedule streak reminder when user is active
  useEffect(() => {
    if (currentUser?.uid && isCacheReady) {
      const checkStreakReminder = async () => {
        try {
          const stats = await getUserReadingStats(currentUser.uid);
          if (stats && stats.streak > 0 && stats.todayMinutes === 0) {
            await scheduleStreakReminder();
          }
        } catch (error) {
          console.error('[StreakReminder] Error checking streak status:', error);
        }
      };

      // Check reminder on initialization
      checkStreakReminder();

      // Also check on return to foreground
      const subscription = AppState.addEventListener('change', nextAppState => {
        if (nextAppState === 'active') {
          performVersionCheck(true);
          checkStreakReminder();
        }
      });

      return () => subscription.remove();
    }
  }, [currentUser?.uid, isCacheReady]);

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

  // Show loading screen while checking auth state or cache
  if (loading || !isCacheReady) {
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
            name="SuperAdmin"
            component={SuperAdminScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="AssignmentDetail"
            component={AssignmentDetailScreen}
            options={{
              headerShown: true,
              headerStyle: {
                backgroundColor: colors.primary,
              },
              headerTintColor: '#fff',
              headerTitle: 'Assignment',
            }}
          />
          <Stack.Screen
            name="SubmissionReview"
            component={SubmissionReviewScreen}
            options={{
              headerShown: true,
              headerStyle: {
                backgroundColor: colors.primary,
              },
              headerTintColor: '#fff',
              headerTitle: 'Review Submission',
            }}
          />
          <Stack.Screen
            name="ReadingInsights"
            component={ReadingInsightsScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="BookReadingInsights"
            component={BookReadingInsightsScreen}
            options={{
              headerShown: false,
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
              headerShown: false,
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
          <Stack.Screen
            name="CharacterManager"
            component={CharacterManagerScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="ClassroomStream"
            component={ClassroomStreamScreen}
            options={{
              headerShown: false,
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
      <CustomAlert />
      <CustomToast />
    </>
  );
}

export default function App() {
  const linking: LinkingOptions<RootStackParamList> = {
    prefixes: [
      'novlnest://',
      'https://novlnest.com',
      'https://www.novlnest.com',
      'https://auth.expo.io'
    ],
    async getInitialURL() {
      // 1. Check if the app was opened by a deep link
      const url = await Linking.getInitialURL();
      if (url != null) return url;

      // 2. Check if the app was opened by a push notification
      const response = await Notifications.getLastNotificationResponseAsync();
      const notificationUrl = response?.notification.request.content.data?.url;
      if (typeof notificationUrl === 'string') return notificationUrl;

      return null;
    },
    subscribe(listener) {
      const onReceiveURL = ({ url }: { url: string }) => listener(url);

      // Listen to deep link events
      const linkingSubscription = Linking.addEventListener('url', onReceiveURL);

      // Listen to push notification events
      const notificationSubscription = Notifications.addNotificationResponseReceivedListener(response => {
        const url = response.notification.request.content.data?.url;
        if (typeof url === 'string') {
          listener(url);
        }
      });

      return () => {
        linkingSubscription.remove();
        notificationSubscription.remove();
      };
    },
    config: {
      screens: {
        MainTabs: {
          screens: {
            Home: 'home',
            Browse: 'browse',
            Library: 'library',
            Submit: 'submit',
            Messages: 'messages/:userId?',
          }
        },
        NovelOverview: 'novel/:id',
        PoemOverview: 'poem/:id',
        NovelReader: 'novel/:novelId/read',
        PoemReader: 'poem/:id/read',
        Profile: 'profile/:userId',
        Notifications: 'notifications',
        Settings: 'settings',
        ReadingInsights: 'insights',
        PaymentCallback: 'PaymentCallback',
        PromoteScreen: 'promote',
      },
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ReaderSettingsProvider>
            <AlertProvider>
              <AuthProvider>
                <ChatProvider>
                  <NotificationProvider>
                    <NavigationContainer<RootStackParamList>
                      ref={navigationRef}
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
            </AlertProvider>
          </ReaderSettingsProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
