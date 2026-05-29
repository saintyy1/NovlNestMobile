import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { startReadingSession, updateLocalHeartbeat, endReadingSession } from '../services/readingAnalyticsService';

/**
 * Hook to manage a reading session with inactivity tracking and local heartbeat.
 */
export const useReadingSession = (
  userId: string | undefined,
  bookId: string,
  bookTitle: string,
  chapterId: string,
  contentType: 'novel' | 'poem'
) => {
  const isFocused = useIsFocused();
  const isFocusedRef = useRef(isFocused);

  const [isActive, setIsActive] = useState(false);
  const isActiveRef = useRef(false);
  
  // Time tracking refs
  const accumulatedTimeRef = useRef(0);
  const currentIntervalStartRef = useRef(Date.now());
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isCompletedRef = useRef(false);

  const IDLE_THRESHOLD = 300000; // 5 minutes of inactivity
  const HEARTBEAT_INTERVAL = 10000; // Update local storage every 10s

  useEffect(() => {
    isFocusedRef.current = isFocused;
    
    // If we lose focus, pause the timer
    if (!isFocused && isActiveRef.current) {
      accumulatedTimeRef.current += (Date.now() - currentIntervalStartRef.current);
      setIsActive(false);
      isActiveRef.current = false;
      stopHeartbeat();
      const finalDuration = getCurrentDurationSeconds();
      updateLocalHeartbeat(bookId, chapterId, finalDuration);
      endReadingSession(bookId, chapterId, isCompletedRef.current, finalDuration);
    }
  }, [isFocused]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const getCurrentDurationSeconds = () => {
    let durationMs = accumulatedTimeRef.current;
    if (isActiveRef.current) {
      durationMs += (Date.now() - currentIntervalStartRef.current);
    }
    return durationMs / 1000;
  };

  // Start session on mount OR when focused
  useEffect(() => {
    if (!userId || !bookId || !isFocused) return;

    const initSession = async () => {
      // Reset refs for the new session
      accumulatedTimeRef.current = 0;
      isCompletedRef.current = false;
      currentIntervalStartRef.current = Date.now();
      
      await startReadingSession(userId, bookId, bookTitle, chapterId, contentType);
      setIsActive(true);
      startHeartbeat();
      startIdleTimer();
    };

    initSession();

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      appStateSubscription.remove();
      stopHeartbeat();
      stopIdleTimer();
      // Flush final duration before ending
      const finalDuration = getCurrentDurationSeconds();
      updateLocalHeartbeat(bookId, chapterId, finalDuration); // Run async
      endReadingSession(bookId, chapterId, isCompletedRef.current, finalDuration);
    };
  }, [userId, bookId, chapterId, contentType, bookTitle, isFocused]);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (!isFocusedRef.current) return; // Only handle app state changes for the FOCUSED screen

    if (nextAppState === 'background' || nextAppState === 'inactive') {
      const finalDuration = getCurrentDurationSeconds();
      await updateLocalHeartbeat(bookId, chapterId, finalDuration);
      await endReadingSession(bookId, chapterId, isCompletedRef.current, finalDuration);
      setIsActive(false);
      isActiveRef.current = false;
      stopHeartbeat();
      console.log('[Analytics] App backgrounded, session paused and saved');
    } else if (nextAppState === 'active') {
      // User returned to app. Restart session tracking.
      if (userId && bookId) {
        console.log('[Analytics] App foregrounded, restarting session');
        currentIntervalStartRef.current = Date.now();
        accumulatedTimeRef.current = 0;
        await startReadingSession(userId, bookId, bookTitle, chapterId, contentType);
        setIsActive(true);
        isActiveRef.current = true;
        startHeartbeat();
        startIdleTimer();
      }
    }
  };

  const startHeartbeat = () => {
    if (heartbeatTimerRef.current) return;
    
    heartbeatTimerRef.current = setInterval(async () => {
      const durationSeconds = getCurrentDurationSeconds();
      await updateLocalHeartbeat(bookId, chapterId, durationSeconds);
    }, HEARTBEAT_INTERVAL);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  };

  const startIdleTimer = () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    
    idleTimerRef.current = setTimeout(() => {
      // User went idle. Pause tracking.
      if (isActiveRef.current) {
        accumulatedTimeRef.current += (Date.now() - currentIntervalStartRef.current);
        setIsActive(false);
        stopHeartbeat();
        console.log('[Analytics] User idle, pausing session duration tracking');
      }
    }, IDLE_THRESHOLD);
  };

  const stopIdleTimer = () => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  const onUserActivity = async () => {
    if (!isActiveRef.current) {
      // User became active again (from idle or background return that didn't trigger app state yet)
      console.log('[Analytics] User activity detected, resuming session');
      
      // Reset local accumulated time because startReadingSession creates a fresh session in the backend
      if (userId && bookId) {
        accumulatedTimeRef.current = 0;
        currentIntervalStartRef.current = Date.now();
        await startReadingSession(userId, bookId, bookTitle, chapterId, contentType);
      } else {
        currentIntervalStartRef.current = Date.now();
      }
      
      setIsActive(true);
      isActiveRef.current = true;
      startHeartbeat();
    }
    startIdleTimer();
  };

  const markAsCompleted = () => {
    isCompletedRef.current = true;
  };

  return { onUserActivity, markAsCompleted };
};
