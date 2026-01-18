import AsyncStorage from '@react-native-async-storage/async-storage';

let cachedSessionId: string | null = null;

export const getOrCreateSessionId = async (): Promise<string> => {
  if (cachedSessionId) {
    return cachedSessionId;
  }

  try {
    let sessionId = await AsyncStorage.getItem('anonymous_session_id');
    if (!sessionId) {
      sessionId = 'anon_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      await AsyncStorage.setItem('anonymous_session_id', sessionId);
    }
    cachedSessionId = sessionId;
    return sessionId;
  } catch (error) {
    // Fallback to memory-only session
    const fallbackId = 'anon_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    cachedSessionId = fallbackId;
    return fallbackId;
  }
};

// Synchronous version for immediate use (uses cached value)
export const getSessionIdSync = (): string => {
  return cachedSessionId || 'anon_temp_' + Date.now().toString(36);
};

// Initialize session on app start
export const initializeSession = async (): Promise<void> => {
  await getOrCreateSessionId();
};