import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
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
  const [isActive, setIsActive] = useState(false);
  const isActiveRef = useRef(false);
  
  // New time tracking refs
  const accumulatedTimeRef = useRef(0);
  const currentIntervalStartRef = useRef(Date.now());
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isCompletedRef = useRef(false);

  const IDLE_THRESHOLD = 300000; // 5 minutes of inactivity (appropriate for reading)
  const HEARTBEAT_INTERVAL = 10000; // Update local storage every 10s

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

  // Start session on mount
  useEffect(() => {
    if (!userId || !bookId) return;

    const initSession = async () => {
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
      updateLocalHeartbeat(finalDuration); // Run async
      endReadingSession(isCompletedRef.current, finalDuration);
    };
  }, [userId, bookId, chapterId, contentType, bookTitle]);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'background' || nextAppState === 'inactive') {
      const finalDuration = getCurrentDurationSeconds();
      updateLocalHeartbeat(finalDuration); // Run async
      endReadingSession(isCompletedRef.current, finalDuration);
      setIsActive(false);
      stopHeartbeat();
    }
  };

  const startHeartbeat = () => {
    if (heartbeatTimerRef.current) return;
    
    heartbeatTimerRef.current = setInterval(async () => {
      const durationSeconds = getCurrentDurationSeconds();
      await updateLocalHeartbeat(durationSeconds);
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

  const onUserActivity = () => {
    if (!isActiveRef.current) {
      // User became active again
      currentIntervalStartRef.current = Date.now();
      setIsActive(true);
      startHeartbeat();
    }
    startIdleTimer();
  };

  const markAsCompleted = () => {
    isCompletedRef.current = true;
  };

  return { onUserActivity, markAsCompleted };
};
