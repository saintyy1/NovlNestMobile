import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { getSessionIdSync, getOrCreateSessionId } from './sessionUtils';

// ============================================
// FIREBASE ANALYTICS - SAFE IMPORT
// ============================================

// Try to import Firebase Analytics, but gracefully handle when it's not available (Expo Go)
let analytics: any = null;
let isAnalyticsAvailable = false;

try {
  // Dynamic require to avoid crash in Expo Go
  const firebaseAnalytics = require('@react-native-firebase/analytics');
  analytics = firebaseAnalytics.default;
  isAnalyticsAvailable = true;
} catch (error) {
  console.log('[Analytics] Firebase Analytics not available (running in Expo Go?)');
  isAnalyticsAvailable = false;
}

// ============================================
// CONFIGURATION & CONSTANTS
// ============================================

const DEBUG_MODE = __DEV__;
const DEDUPLICATION_WINDOW = 5000; // 5 seconds
const READING_SESSION_TIMEOUT = 30000; // 30 seconds of inactivity ends session

// Track recent events to prevent duplicates
const recentEvents = new Map<string, number>();

// Reading time tracking
interface ReadingSession {
  novelId: string;
  chapterNumber: number;
  startTime: number;
  lastActiveTime: number;
  totalPausedTime: number;
  isPaused: boolean;
}

let currentReadingSession: ReadingSession | null = null;
let appStateSubscription: any = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================

const log = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[Analytics] ${message}`, data || '');
  }
};

const createEventKey = (eventName: string, additionalData: any): string => {
  const keyData = {
    event: eventName,
    novel_id: additionalData?.novel_id,
    chapter_number: additionalData?.chapter_number,
    poem_id: additionalData?.poem_id,
    screen: additionalData?.screen_name,
  };
  return JSON.stringify(keyData);
};

const shouldTrackEvent = (eventName: string, additionalData: any = {}): boolean => {
  const eventKey = createEventKey(eventName, additionalData);
  const now = Date.now();
  const lastTracked = recentEvents.get(eventKey);

  if (lastTracked && (now - lastTracked) < DEDUPLICATION_WINDOW) {
    log(`Skipping duplicate event: ${eventName}`);
    return false;
  }

  recentEvents.set(eventKey, now);

  // Clean up old entries
  if (recentEvents.size > 100) {
    const cutoff = now - DEDUPLICATION_WINDOW;
    for (const [key, timestamp] of recentEvents.entries()) {
      if (timestamp < cutoff) {
        recentEvents.delete(key);
      }
    }
  }

  return true;
};

const sanitizeParams = (params: Record<string, any>): Record<string, any> => {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      // Firebase Analytics has limits: parameter names max 40 chars, values max 100 chars
      const sanitizedKey = String(key).substring(0, 40);
      if (typeof value === 'string') {
        sanitized[sanitizedKey] = value.substring(0, 100);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[sanitizedKey] = value;
      } else if (Array.isArray(value)) {
        sanitized[sanitizedKey] = value.join(',').substring(0, 100);
      } else {
        sanitized[sanitizedKey] = String(value).substring(0, 100);
      }
    }
  }
  return sanitized;
};

// ============================================
// CORE ANALYTICS FUNCTIONS
// ============================================

/**
 * Initialize analytics - call this on app startup
 */
export const initializeAnalytics = async (userId?: string): Promise<void> => {
  if (!isAnalyticsAvailable) {
    log('Analytics not available - skipping initialization');
    return;
  }

  try {
    // Set analytics collection enabled
    await analytics().setAnalyticsCollectionEnabled(true);
    
    // Initialize session
    await getOrCreateSessionId();

    // Set user ID if available
    if (userId) {
      await setUserId(userId);
    }

    // Set default user properties
    await analytics().setUserProperties({
      platform: Platform.OS,
      app_version: '1.0.0', // Update this from app.json
    });

    // Setup app state listener for reading time tracking
    setupAppStateListener();

    log('Analytics initialized');
  } catch (error) {
    log('Failed to initialize analytics', error);
  }
};

/**
 * Set user ID for analytics
 */
export const setUserId = async (userId: string | null): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    await analytics().setUserId(userId);
    log('User ID set', userId);
  } catch (error) {
    log('Failed to set user ID', error);
  }
};

/**
 * Set user properties
 */
export const setUserProperties = async (properties: Record<string, string | null>): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    await analytics().setUserProperties(properties);
    log('User properties set', properties);
  } catch (error) {
    log('Failed to set user properties', error);
  }
};

// ============================================
// SCREEN / PAGE VIEW TRACKING
// ============================================

/**
 * Track screen view (page view)
 */
export const trackScreenView = async (
  screenName: string,
  screenClass?: string,
  additionalParams?: Record<string, any>
): Promise<void> => {
  if (!isAnalyticsAvailable) {
    log('Screen view (skipped - no analytics)', screenName);
    return;
  }

  try {
    const params = {
      screen_name: screenName,
      screen_class: screenClass || screenName,
      ...additionalParams,
    };

    if (!shouldTrackEvent('screen_view', params)) return;

    await analytics().logScreenView({
      screen_name: screenName,
      screen_class: screenClass || screenName,
    });

    // Also log as custom event with additional params
    if (additionalParams && Object.keys(additionalParams).length > 0) {
      await analytics().logEvent('page_view', sanitizeParams({
        screen_name: screenName,
        timestamp: new Date().toISOString(),
        session_id: getSessionIdSync(),
        ...additionalParams,
      }));
    }

    log('Screen view tracked', screenName);
  } catch (error) {
    log('Failed to track screen view', error);
  }
};

// ============================================
// NOVEL & CHAPTER TRACKING
// ============================================

/**
 * Track when user views a novel overview page
 */
export const trackNovelView = async (data: {
  novelId: string;
  title: string;
  authorId?: string;
  authorName?: string;
  genres?: string[];
  status?: string;
}): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    const params = {
      novel_id: data.novelId,
      novel_title: data.title,
      author_id: data.authorId,
      author_name: data.authorName,
      genres: data.genres,
      status: data.status,
      timestamp: new Date().toISOString(),
      session_id: getSessionIdSync(),
    };

    if (!shouldTrackEvent('novel_view', params)) return;

    await analytics().logEvent('novel_view', sanitizeParams(params));
    
    // Also log view_item for e-commerce style tracking
    await analytics().logViewItem({
      items: [{
        item_id: data.novelId,
        item_name: data.title,
        item_category: data.genres?.[0] || 'novel',
      }],
    });

    log('Novel view tracked', data.novelId);
  } catch (error) {
    log('Failed to track novel view', error);
  }
};

/**
 * Track when user starts reading a chapter
 */
export const trackChapterStart = async (data: {
  novelId: string;
  novelTitle: string;
  chapterNumber: number;
  chapterTitle?: string;
  userId?: string;
}): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    const params = {
      novel_id: data.novelId,
      novel_title: data.novelTitle,
      chapter_number: data.chapterNumber,
      chapter_title: data.chapterTitle,
      user_id: data.userId,
      reader_type: data.userId ? 'registered' : 'anonymous',
      timestamp: new Date().toISOString(),
      session_id: getSessionIdSync(),
    };

    if (!shouldTrackEvent('chapter_start', params)) return;

    await analytics().logEvent('chapter_start', sanitizeParams(params));

    // Start reading time tracking
    startReadingSession(data.novelId, data.chapterNumber);

    log('Chapter start tracked', `${data.novelId} - Chapter ${data.chapterNumber}`);
  } catch (error) {
    log('Failed to track chapter start', error);
  }
};

/**
 * Track when user completes a chapter
 */
export const trackChapterComplete = async (data: {
  novelId: string;
  novelTitle: string;
  chapterNumber: number;
  chapterTitle?: string;
  readingTimeSeconds?: number;
  userId?: string;
}): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    const readingTime = data.readingTimeSeconds || endReadingSession();

    const params = {
      novel_id: data.novelId,
      novel_title: data.novelTitle,
      chapter_number: data.chapterNumber,
      chapter_title: data.chapterTitle,
      reading_time_seconds: readingTime,
      user_id: data.userId,
      reader_type: data.userId ? 'registered' : 'anonymous',
      timestamp: new Date().toISOString(),
      session_id: getSessionIdSync(),
    };

    await analytics().logEvent('chapter_complete', sanitizeParams(params));
    log('Chapter complete tracked', params);
  } catch (error) {
    log('Failed to track chapter complete', error);
  }
};

/**
 * Track novel read event (general reading activity)
 */
export const trackNovelRead = async (data: {
  novelId: string;
  novelTitle: string;
  chapterNumber: number;
  userId?: string;
  isAnonymous?: boolean;
}): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    const params = {
      novel_id: data.novelId,
      novel_title: data.novelTitle,
      chapter_number: data.chapterNumber,
      user_id: data.userId,
      reader_type: data.isAnonymous ? 'anonymous' : 'registered',
      timestamp: new Date().toISOString(),
      session_id: getSessionIdSync(),
    };

    if (!shouldTrackEvent('novel_read', params)) return;

    await analytics().logEvent('novel_read', sanitizeParams(params));
    log('Novel read tracked', data.novelId);
  } catch (error) {
    log('Failed to track novel read', error);
  }
};

// ============================================
// POEM TRACKING
// ============================================

/**
 * Track poem view
 */
export const trackPoemView = async (data: {
  poemId: string;
  title: string;
  authorId?: string;
  authorName?: string;
  genres?: string[];
}): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    const params = {
      poem_id: data.poemId,
      poem_title: data.title,
      author_id: data.authorId,
      author_name: data.authorName,
      genres: data.genres,
      timestamp: new Date().toISOString(),
      session_id: getSessionIdSync(),
    };

    if (!shouldTrackEvent('poem_view', params)) return;

    await analytics().logEvent('poem_view', sanitizeParams(params));
    log('Poem view tracked', data.poemId);
  } catch (error) {
    log('Failed to track poem view', error);
  }
};

/**
 * Track poem read
 */
export const trackPoemRead = async (data: {
  poemId: string;
  title: string;
  authorId?: string;
  userId?: string;
  readingTimeSeconds?: number;
}): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    const params = {
      poem_id: data.poemId,
      poem_title: data.title,
      author_id: data.authorId,
      user_id: data.userId,
      reading_time_seconds: data.readingTimeSeconds,
      timestamp: new Date().toISOString(),
      session_id: getSessionIdSync(),
    };

    await analytics().logEvent('poem_read', sanitizeParams(params));
    log('Poem read tracked', data.poemId);
  } catch (error) {
    log('Failed to track poem read', error);
  }
};

// ============================================
// USER ENGAGEMENT TRACKING
// ============================================

/**
 * Track user engagement (time spent)
 */
export const trackEngagement = async (data: {
  engagementType: 'reading' | 'browsing' | 'writing' | 'messaging';
  durationSeconds: number;
  screenName?: string;
  contentId?: string;
}): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    const params = {
      engagement_type: data.engagementType,
      engagement_time_msec: data.durationSeconds * 1000,
      duration_seconds: data.durationSeconds,
      screen_name: data.screenName,
      content_id: data.contentId,
      timestamp: new Date().toISOString(),
      session_id: getSessionIdSync(),
    };

    await analytics().logEvent('user_engagement', sanitizeParams(params));
    log('Engagement tracked', params);
  } catch (error) {
    log('Failed to track engagement', error);
  }
};

// ============================================
// USER ACTIONS TRACKING
// ============================================

/**
 * Track user sign up
 */
export const trackSignUp = async (method: string, userId?: string): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    await analytics().logSignUp({ method });
    
    if (userId) {
      await analytics().logEvent('user_registration', sanitizeParams({
        method,
        user_id: userId,
        timestamp: new Date().toISOString(),
      }));
    }

    log('Sign up tracked', method);
  } catch (error) {
    log('Failed to track sign up', error);
  }
};

/**
 * Track user login
 */
export const trackLogin = async (method: string, userId?: string): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    await analytics().logLogin({ method });

    if (userId) {
      await setUserId(userId);
    }

    log('Login tracked', method);
  } catch (error) {
    log('Failed to track login', error);
  }
};

/**
 * Track content interaction (like, comment, share, bookmark)
 */
export const trackContentInteraction = async (data: {
  action: 'like' | 'unlike' | 'comment' | 'reply' | 'share' | 'bookmark' | 'unbookmark' | 'report';
  contentType: 'novel' | 'poem' | 'chapter' | 'comment';
  contentId: string;
  contentTitle?: string;
  authorId?: string;
  userId?: string;
}): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    const params = {
      action: data.action,
      content_type: data.contentType,
      content_id: data.contentId,
      content_title: data.contentTitle,
      author_id: data.authorId,
      user_id: data.userId,
      timestamp: new Date().toISOString(),
      session_id: getSessionIdSync(),
    };

    if (!shouldTrackEvent(`content_${data.action}`, params)) return;

    await analytics().logEvent(`content_${data.action}`, sanitizeParams(params));

    // Also log generic interaction event
    await analytics().logEvent('content_interaction', sanitizeParams(params));

    log('Content interaction tracked', params);
  } catch (error) {
    log('Failed to track content interaction', error);
  }
};

/**
 * Track search
 */
export const trackSearch = async (data: {
  searchTerm: string;
  category?: string;
  resultsCount?: number;
}): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    await analytics().logSearch({
      search_term: data.searchTerm,
    });

    await analytics().logEvent('search_performed', sanitizeParams({
      search_term: data.searchTerm,
      category: data.category,
      results_count: data.resultsCount,
      timestamp: new Date().toISOString(),
      session_id: getSessionIdSync(),
    }));

    log('Search tracked', data.searchTerm);
  } catch (error) {
    log('Failed to track search', error);
  }
};

/**
 * Track content creation (novel/poem submission)
 */
export const trackContentCreate = async (data: {
  contentType: 'novel' | 'poem' | 'chapter';
  contentId: string;
  title: string;
  genres?: string[];
  wordCount?: number;
  userId: string;
}): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    const params = {
      content_type: data.contentType,
      content_id: data.contentId,
      title: data.title,
      genres: data.genres,
      word_count: data.wordCount,
      user_id: data.userId,
      timestamp: new Date().toISOString(),
    };

    await analytics().logEvent('content_create', sanitizeParams(params));
    log('Content creation tracked', params);
  } catch (error) {
    log('Failed to track content creation', error);
  }
};

/**
 * Track share event
 */
export const trackShare = async (data: {
  contentType: 'novel' | 'poem' | 'chapter' | 'profile';
  contentId: string;
  method?: string;
}): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    await analytics().logShare({
      content_type: data.contentType,
      item_id: data.contentId,
      method: data.method || 'unknown',
    });

    log('Share tracked', data);
  } catch (error) {
    log('Failed to track share', error);
  }
};

// ============================================
// NAVIGATION TRACKING
// ============================================

/**
 * Track tab navigation
 */
export const trackTabNavigation = async (tabName: string, previousTab?: string): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    const params = {
      tab_name: tabName,
      previous_tab: previousTab,
      timestamp: new Date().toISOString(),
      session_id: getSessionIdSync(),
    };

    if (!shouldTrackEvent('tab_navigation', params)) return;

    await analytics().logEvent('tab_navigation', sanitizeParams(params));
    log('Tab navigation tracked', tabName);
  } catch (error) {
    log('Failed to track tab navigation', error);
  }
};

// ============================================
// READING TIME TRACKING
// ============================================

const setupAppStateListener = (): void => {
  if (appStateSubscription) return;

  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
};

const handleAppStateChange = (nextAppState: AppStateStatus): void => {
  if (!currentReadingSession) return;

  if (nextAppState === 'active') {
    // App came to foreground - resume reading
    resumeReadingSession();
  } else if (nextAppState === 'background' || nextAppState === 'inactive') {
    // App went to background - pause reading
    pauseReadingSession();
  }
};

const startReadingSession = (novelId: string, chapterNumber: number): void => {
  // End previous session if exists
  if (currentReadingSession) {
    endReadingSession();
  }

  currentReadingSession = {
    novelId,
    chapterNumber,
    startTime: Date.now(),
    lastActiveTime: Date.now(),
    totalPausedTime: 0,
    isPaused: false,
  };

  log('Reading session started', { novelId, chapterNumber });
};

const pauseReadingSession = (): void => {
  if (!currentReadingSession || currentReadingSession.isPaused) return;

  currentReadingSession.isPaused = true;
  currentReadingSession.lastActiveTime = Date.now();

  log('Reading session paused');
};

const resumeReadingSession = (): void => {
  if (!currentReadingSession || !currentReadingSession.isPaused) return;

  const pauseDuration = Date.now() - currentReadingSession.lastActiveTime;
  currentReadingSession.totalPausedTime += pauseDuration;
  currentReadingSession.isPaused = false;
  currentReadingSession.lastActiveTime = Date.now();

  log('Reading session resumed', { pauseDuration });
};

const endReadingSession = (): number => {
  if (!currentReadingSession) return 0;

  const now = Date.now();
  let totalTime = now - currentReadingSession.startTime - currentReadingSession.totalPausedTime;

  // If currently paused, don't count time since pause
  if (currentReadingSession.isPaused) {
    totalTime = currentReadingSession.lastActiveTime - currentReadingSession.startTime - currentReadingSession.totalPausedTime;
  }

  const seconds = Math.round(totalTime / 1000);

  log('Reading session ended', { seconds, session: currentReadingSession });

  currentReadingSession = null;
  return seconds;
};

/**
 * Get current reading time in seconds (without ending session)
 */
export const getCurrentReadingTime = (): number => {
  if (!currentReadingSession) return 0;

  const now = Date.now();
  let totalTime = now - currentReadingSession.startTime - currentReadingSession.totalPausedTime;

  if (currentReadingSession.isPaused) {
    totalTime = currentReadingSession.lastActiveTime - currentReadingSession.startTime - currentReadingSession.totalPausedTime;
  }

  return Math.round(totalTime / 1000);
};

/**
 * Track reading progress manually
 */
export const trackReadingProgress = async (data: {
  novelId: string;
  chapterNumber: number;
  progressPercent: number;
  readingTimeSeconds?: number;
}): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    const params = {
      novel_id: data.novelId,
      chapter_number: data.chapterNumber,
      progress_percent: data.progressPercent,
      reading_time_seconds: data.readingTimeSeconds || getCurrentReadingTime(),
      timestamp: new Date().toISOString(),
      session_id: getSessionIdSync(),
    };

    // Only track significant progress milestones (25%, 50%, 75%, 100%)
    const milestone = Math.floor(data.progressPercent / 25) * 25;
    if (milestone > 0 && shouldTrackEvent(`reading_progress_${milestone}`, { novel_id: data.novelId, chapter_number: data.chapterNumber })) {
      await analytics().logEvent('reading_progress', sanitizeParams({
        ...params,
        milestone,
      }));
      log('Reading progress tracked', { milestone, ...params });
    }
  } catch (error) {
    log('Failed to track reading progress', error);
  }
};

// ============================================
// ERROR & PERFORMANCE TRACKING
// ============================================

/**
 * Track errors
 */
export const trackError = async (data: {
  errorType: string;
  errorMessage: string;
  screenName?: string;
  additionalInfo?: Record<string, any>;
}): Promise<void> => {
  if (!isAnalyticsAvailable) return;

  try {
    const params = {
      error_type: data.errorType,
      error_message: data.errorMessage.substring(0, 100),
      screen_name: data.screenName,
      timestamp: new Date().toISOString(),
      ...data.additionalInfo,
    };

    await analytics().logEvent('app_error', sanitizeParams(params));
    log('Error tracked', params);
  } catch (error) {
    log('Failed to track error', error);
  }
};

// ============================================
// CLEANUP
// ============================================

/**
 * Clean up analytics (call on app unmount)
 */
export const cleanupAnalytics = (): void => {
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  // End any active reading session
  if (currentReadingSession) {
    endReadingSession();
  }

  log('Analytics cleaned up');
};

// ============================================
// EXPORT DEFAULT ANALYTICS INSTANCE
// ============================================

export default {
  initialize: initializeAnalytics,
  setUserId,
  setUserProperties,
  trackScreenView,
  trackNovelView,
  trackNovelRead,
  trackChapterStart,
  trackChapterComplete,
  trackPoemView,
  trackPoemRead,
  trackEngagement,
  trackSignUp,
  trackLogin,
  trackContentInteraction,
  trackSearch,
  trackContentCreate,
  trackShare,
  trackTabNavigation,
  trackReadingProgress,
  trackError,
  getCurrentReadingTime,
  cleanup: cleanupAnalytics,
};