import { db } from '../firebase/config';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
  getDoc,
  doc,
  documentId,
  limit,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelStreakReminder, sendMilestoneNotification } from './localNotificationService';
import { getFriendlyErrorMessage } from '../utils/errorHandlers';

const LOCAL_SESSION_KEY = '@reading_session_active';
const NOTIFIED_MILESTONES_KEY = '@notified_milestones_';

export interface ReadingSession {
  userId: string;
  bookId: string;
  bookTitle: string;
  chapterId: string;
  contentType: 'novel' | 'poem';
  startTime: Timestamp | any;
  endTime: Timestamp | any;
  durationSeconds: number;
  isCompleted: boolean;
}

export interface LocalSessionData {
  userId: string;
  bookId: string;
  bookTitle: string;
  chapterId: string;
  contentType: 'novel' | 'poem';
  startTime: number;
  lastActiveTime: number;
  accumulatedDuration: number;
}

const MIN_SESSION_DURATION = 10; // Ignore sessions shorter than 10s
const MIN_COMPLETION_DURATION = 30; // Min 30s to count as "completed"

let activeLocalSession: LocalSessionData | null = null;

// Performance Cache: bookId -> coverImage
const bookMetadataCache = new Map<string, string | null>();

/**
 * Start a new reading session
 */
export const startReadingSession = async (
  userId: string,
  bookId: string,
  bookTitle: string,
  chapterId: string,
  contentType: 'novel' | 'poem'
) => {
  if (!userId) return;

  // 1. Ensure only one active session exists
  if (activeLocalSession) {
    console.log('[Analytics] Existing active session found, ending it first...');
    await endReadingSession();
  } else {
    // Check if there's a forgotten session in AsyncStorage
    const forgottenSession = await AsyncStorage.getItem(LOCAL_SESSION_KEY);
    if (forgottenSession) {
      console.log('[Analytics] Forgotten session found in storage, processing...');
      await recoverCrashedSession();
    }
  }

  const now = Date.now();
  activeLocalSession = {
    userId,
    bookId,
    bookTitle,
    chapterId,
    contentType,
    startTime: now,
    lastActiveTime: now,
    accumulatedDuration: 0,
  };

  await AsyncStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(activeLocalSession));
  console.log('[Analytics] Reading session started locally:', bookTitle);
};

/**
 * Update local heartbeat (accumulate duration)
 */
export const updateLocalHeartbeat = async (currentDuration: number) => {
  if (!activeLocalSession) return;

  activeLocalSession.lastActiveTime = Date.now();
  activeLocalSession.accumulatedDuration = currentDuration;

  await AsyncStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(activeLocalSession));
};

/**
 * End session and save to Firestore
 */
export const endReadingSession = async (isCompleted: boolean = false, finalDurationMs?: number) => {
  if (!activeLocalSession) return;

  const sessionToSave = { ...activeLocalSession };
  activeLocalSession = null;
  await AsyncStorage.removeItem(LOCAL_SESSION_KEY);

  const duration = finalDurationMs !== undefined ? Math.round(finalDurationMs) : Math.round(sessionToSave.accumulatedDuration);
  
  // 2. Minimum session threshold
  if (duration < MIN_SESSION_DURATION) {
    console.log('[Analytics] Session too short (', duration, 's), skipping save');
    return;
  }

  // 3. Strengthened completion logic
  // Must reach end AND have minimal stay duration
  const validCompletion = isCompleted && duration >= MIN_COMPLETION_DURATION;

  try {
    await addDoc(collection(db, 'readingSessions'), {
      userId: sessionToSave.userId,
      bookId: sessionToSave.bookId,
      bookTitle: sessionToSave.bookTitle,
      chapterId: sessionToSave.chapterId,
      contentType: sessionToSave.contentType,
      startTime: Timestamp.fromMillis(sessionToSave.startTime),
      endTime: serverTimestamp(),
      durationSeconds: duration,
      isCompleted: validCompletion,
      createdAt: serverTimestamp(),
    });
    console.log('[Analytics] Reading session saved to Firestore (Completed:', validCompletion, ')');
    
    // 4. Cancel any pending streak reminder for today since we've read
    await cancelStreakReminder();

    // 5. Check for new milestones
    await checkAndNotifyMilestones(sessionToSave.userId);
  } catch (error) {
    console.error('[Analytics] Error saving session to Firestore:', error);
  }
};

/**
 * Check for new milestones and notify the user
 */
export const checkAndNotifyMilestones = async (userId: string) => {
  try {
    const stats = await getUserReadingStats(userId);
    if (!stats) return;

    const storageKey = `${NOTIFIED_MILESTONES_KEY}${userId}`;
    const notifiedData = await AsyncStorage.getItem(storageKey);
    let notifiedIds: string[] = notifiedData ? JSON.parse(notifiedData) : [];

    const ACHIEVEMENTS = [
      { id: 'spark', name: 'Spark Ignited', threshold: 2, type: 'streak', desc: 'You’ve reached a 2-day reading streak!' },
      { id: 'fire', name: 'On Fire', threshold: 7, type: 'streak', desc: 'Amazing! You’ve reached a 7-day reading streak!' },
      { id: 'unstoppable', name: 'Unstoppable', threshold: 30, type: 'streak', desc: 'Legendary! 30 days of consistent reading!' },
      { id: 'explorer', name: 'Explorer', threshold: 3, type: 'books', desc: 'You’ve explored 3 different books or poems!' },
    ];

    let updated = false;

    for (const ach of ACHIEVEMENTS) {
      const isEarned = ach.type === 'streak' ? stats.bestStreak >= ach.threshold : stats.uniqueBooksCount >= ach.threshold;
      
      if (isEarned && !notifiedIds.includes(ach.id)) {
        await sendMilestoneNotification(ach.name, ach.desc);
        notifiedIds.push(ach.id);
        updated = true;
      }
    }

    if (updated) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(notifiedIds));
    }
  } catch (error) {
    console.error('[Analytics] Error checking milestones:', error);
  }
};

/**
 * Recover crashed/unfinished sessions from local storage
 * This should be called on app startup (e.g., HomeScreen or Splash)
 */
export const recoverCrashedSession = async () => {
  try {
    const rawData = await AsyncStorage.getItem(LOCAL_SESSION_KEY);
    if (!rawData) return;

    const session: LocalSessionData = JSON.parse(rawData);
    
    // If the session was from more than 2 hours ago, it's definitely a crash/abandoned
    // If it's more recent, it might still be active (but this function should only be called on app start)
    if (session.accumulatedDuration >= 5) {
      console.log('[Analytics] Recovering unfinished session from crash/abandonment:', session.bookTitle);
      
      await addDoc(collection(db, 'readingSessions'), {
        userId: session.userId,
        bookId: session.bookId,
        bookTitle: session.bookTitle,
        chapterId: session.chapterId,
        contentType: session.contentType,
        startTime: Timestamp.fromMillis(session.startTime),
        endTime: Timestamp.fromMillis(session.lastActiveTime),
        durationSeconds: session.accumulatedDuration,
        isCompleted: false, // Assume not completed if it crashed
        recovered: true,
        createdAt: serverTimestamp(),
      });
      console.log('[Analytics] Recovered session saved to Firestore');

      // Check for milestones after recovery
      await checkAndNotifyMilestones(session.userId);
    }

    await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
  } catch (error) {
    console.error('[Analytics] Error recovering session:', error);
  }
};

/**
 * Get aggregated stats for the user
 */
export const getUserReadingStats = async (userId: string) => {
  if (!userId) return null;

  try {
    const sessionsRef = collection(db, 'readingSessions');
    const q = query(
      sessionsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(500)
    );

    const snapshot = await getDocs(q);
    const sessions = snapshot.docs.map(doc => doc.data() as ReadingSession);

    if (sessions.length === 0) {
      return {
        totalMinutes: 0,
        todayMinutes: 0,
        weeklyMinutes: 0,
        lastWeekMinutes: 0,
        avgMinutesPerSession: 0,
        dailyAverageMinutes: 0,
        totalSessions: 0,
        completedChapters: 0,
        uniqueBooksCount: 0,
        activeDays: 0,
        streak: 0,
        bestStreak: 0,
        message: "Start your reading journey today!",
        dailyHistory: calculateDailyHistory([]),
        longestSessionStats: null,
        mostActiveDay: "None",
        currentCalendarWeekMinutes: 0,
        currentWeekLabel: "This Week",
        historicalWeeks: [],
      };
    }

    // 1. Total Reading Time
    const totalSeconds = sessions.reduce((acc, s) => acc + s.durationSeconds, 0);

    // 2. Total Sessions
    const totalSessions = sessions.length;

    // 3. Average Minutes per Session
    const avgMinutesPerSession = (totalSeconds / 60) / totalSessions;

    // 4. Daily Reading Time (today)
    const today = new Date().toDateString();
    const todaySeconds = sessions
      .filter(s => {
        const date = s.startTime instanceof Timestamp ? s.startTime.toDate() : new Date(s.startTime);
        return date.toDateString() === today;
      })
      .reduce((acc, s) => acc + s.durationSeconds, 0);

    // 5. Active Days
    const activeDaysSet = new Set(
      sessions.map(s => {
        const date = s.startTime instanceof Timestamp ? s.startTime.toDate() : new Date(s.startTime);
        return date.toDateString();
      })
    );
    const activeDays = activeDaysSet.size;

    // 6. Estimated Daily Average
    const dailyAverageMinutes = (totalSeconds / 60) / Math.max(1, activeDays);

    // 7. Completed Chapters & Unique Books
    const completedChapters = sessions.filter(s => s.isCompleted).length;
    const uniqueBooksCount = new Set(sessions.map(s => s.bookId)).size;

    // 8. Weekly Minutes (last 7 days rolling)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const weeklySeconds = sessions
      .filter(s => {
        const date = s.startTime instanceof Timestamp ? s.startTime.toDate() : new Date(s.startTime);
        return date >= sevenDaysAgo;
      })
      .reduce((acc, s) => acc + s.durationSeconds, 0);

    // 8b. Last Week's Minutes (the 7 days prior to rolling weekly)
    const lastWeekSeconds = sessions
      .filter(s => {
        const date = s.startTime instanceof Timestamp ? s.startTime.toDate() : new Date(s.startTime);
        return date >= fourteenDaysAgo && date < sevenDaysAgo;
      })
      .reduce((acc, s) => acc + s.durationSeconds, 0);

    // 9. Streak Calculation
    const { current: streak, best: bestStreak } = calculateStreak(sessions);

    // 10. Motivational Message
    const message = getMotivation(todaySeconds / 60);

    // 11. Historical Core Weeks
    const weeklyData = calculateHistoricalWeeks(sessions);

    // 12. Book Breakdown
    const bookStats = await calculateBookBreakdown(sessions);

    return {
      totalMinutes: Math.ceil(totalSeconds / 60),
      todayMinutes: Math.ceil(todaySeconds / 60),
      weeklyMinutes: Math.ceil(weeklySeconds / 60),
      lastWeekMinutes: Math.ceil(lastWeekSeconds / 60),
      avgMinutesPerSession: Math.round(avgMinutesPerSession * 10) / 10,
      dailyAverageMinutes: Math.ceil(dailyAverageMinutes),
      totalSessions,
      completedChapters,
      uniqueBooksCount,
      activeDays,
      streak,
      bestStreak,
      message,
      dailyHistory: calculateDailyHistory(sessions),
      longestSessionStats: calculateLongestMacroSession(sessions),
      mostActiveDay: calculateMostActiveDay(sessions),
      currentCalendarWeekMinutes: weeklyData.currentCalendarWeekMinutes,
      currentWeekLabel: weeklyData.currentWeekLabel,
      historicalWeeks: weeklyData.historicalWeeks,
      bookStats,
    };
  } catch (error) {
    const friendlyError = getFriendlyErrorMessage(error, 'get_stats');
    console.error('[Analytics] Error calculating stats:', friendlyError, error);
    return {
      totalMinutes: 0,
      todayMinutes: 0,
      weeklyMinutes: 0,
      lastWeekMinutes: 0,
      avgMinutesPerSession: 0,
      dailyAverageMinutes: 0,
      totalSessions: 0,
      completedChapters: 0,
      uniqueBooksCount: 0,
      activeDays: 0,
      streak: 0,
      bestStreak: 0,
      message: "Unable to load stats",
      dailyHistory: calculateDailyHistory([]),
      longestSessionStats: null,
      mostActiveDay: "None",
      currentCalendarWeekMinutes: 0,
      currentWeekLabel: "This Week",
      historicalWeeks: [],
    };
  }
};

/**
 * Helper to calculate daily reading history for the last 7 days
 */
const calculateDailyHistory = (sessions: ReadingSession[]) => {
  const history = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const mostRecentSunday = new Date(today);
  mostRecentSunday.setDate(mostRecentSunday.getDate() - mostRecentSunday.getDay());

  for (let i = 0; i < 7; i++) {
    const targetDate = new Date(mostRecentSunday);
    targetDate.setDate(targetDate.getDate() + i);
    const targetDateString = targetDate.toDateString();

    const daySeconds = sessions
      .filter(s => {
        const d = s.startTime instanceof Timestamp ? s.startTime.toDate() : new Date(s.startTime);
        return d.toDateString() === targetDateString;
      })
      .reduce((acc, s) => acc + s.durationSeconds, 0);

    history.push({
      date: targetDateString,
      shortDate: `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][targetDate.getMonth()]} ${targetDate.getDate()}`,
      dayName: targetDate.toLocaleDateString(undefined, { weekday: 'short' }),
      minutes: Math.ceil(daySeconds / 60),
      isToday: targetDate.getTime() === today.getTime(),
      isFuture: targetDate.getTime() > today.getTime()
    });
  }
  return history;
};

/**
 * Helper to find the day with the most reading time
 */
const calculateMostActiveDay = (sessions: ReadingSession[]) => {
  if (sessions.length === 0) return null;

  const dailyTotals: { [key: string]: number } = {};
  sessions.forEach(s => {
    const d = s.startTime instanceof Timestamp ? s.startTime.toDate() : new Date(s.startTime);
    const dateStr = d.toLocaleDateString(undefined, { weekday: 'long' });
    dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + s.durationSeconds;
  });

  let maxDay = "";
  let maxSeconds = 0;
  Object.entries(dailyTotals).forEach(([day, seconds]) => {
    if (seconds > maxSeconds) {
      maxSeconds = seconds;
      maxDay = day;
    }
  });

  return maxDay;
};

/**
 * Calculate the longest continuous reading period.
 * Consecutive chapter sessions are merged if they occur within 5 minutes of each other.
 */
const calculateLongestMacroSession = (sessions: ReadingSession[]) => {
  if (sessions.length === 0) return { minutes: 0, date: "" };
  
  // Sort from oldest to newest
  const sortedSessions = [...sessions].sort((a, b) => {
    const timeA = a.startTime instanceof Timestamp ? a.startTime.toMillis() : new Date(a.startTime).getTime();
    const timeB = b.startTime instanceof Timestamp ? b.startTime.toMillis() : new Date(b.startTime).getTime();
    return timeA - timeB;
  });

  let maxMacroDuration = 0;
  let maxMacroDate = "";
  let currentMacroDuration = 0;
  let currentMacroDate = "";
  let previousEndTime = 0;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 0; i < sortedSessions.length; i++) {
    const session = sortedSessions[i];
    const startTime = session.startTime instanceof Timestamp ? session.startTime.toMillis() : new Date(session.startTime).getTime();
    const dt = new Date(startTime);
    const formattedDate = `${months[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
    
    // If it's the first session or gap is > 5 mins (300,000 ms)
    if (i === 0 || (startTime - previousEndTime) > 5 * 60 * 1000) {
      if (currentMacroDuration > maxMacroDuration) {
        maxMacroDuration = currentMacroDuration;
        maxMacroDate = currentMacroDate;
      }
      currentMacroDuration = session.durationSeconds;
      currentMacroDate = formattedDate;
    } else {
      // Gap is < 5 mins, merge them
      currentMacroDuration += session.durationSeconds;
    }
    
    // Calculate end time of this session
    previousEndTime = startTime + (session.durationSeconds * 1000);
  }

  if (currentMacroDuration > maxMacroDuration) {
    maxMacroDuration = currentMacroDuration;
    maxMacroDate = currentMacroDate;
  }

  return { minutes: Math.ceil(maxMacroDuration / 60), date: maxMacroDate };
};

/**
 * Helper to calculate current reading streak
 */
const calculateStreak = (sessions: ReadingSession[]) => {
  if (sessions.length === 0) return { current: 0, best: 0 };

  // 1. Get unique sorted dates (descending)
  const uniqueDates = Array.from(new Set(
    sessions.map(s => {
      const d = s.startTime instanceof Timestamp ? s.startTime.toDate() : new Date(s.startTime);
      return d.toDateString();
    })
  )).map(d => new Date(d));
  
  uniqueDates.sort((a, b) => b.getTime() - a.getTime());

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // --- Calculate Current Streak ---
  let currentStreak = 0;
  // If the latest session isn't today or yesterday, the current streak is broken
  if (uniqueDates[0].getTime() >= yesterday.getTime()) {
    for (let i = 0; i < uniqueDates.length; i++) {
      const d = uniqueDates[i];
      const expectedDate = new Date(uniqueDates[0]);
      expectedDate.setDate(expectedDate.getDate() - i);

      if (d.getTime() === expectedDate.getTime()) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // --- Calculate Best Streak ---
  // Re-sort ascending to find all-time gaps
  const sortedDates = [...uniqueDates].sort((a, b) => a.getTime() - b.getTime());
  let bestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const date of sortedDates) {
    if (!prevDate) {
      tempStreak = 1;
    } else {
      const expectedNext = new Date(prevDate);
      expectedNext.setDate(expectedNext.getDate() + 1);

      if (date.getTime() === expectedNext.getTime()) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    
    if (tempStreak > bestStreak) {
      bestStreak = tempStreak;
    }
    prevDate = date;
  }

  return { current: currentStreak, best: bestStreak };
};

/**
 * Helper to get a motivational message based on today's progress
 */
const getMotivation = (minutesToday: number): string => {
  if (minutesToday === 0) return "Ready to dive into a new story?";
  if (minutesToday < 5) return "Off to a great start!";
  if (minutesToday < 15) return "You're on a roll!";
  if (minutesToday < 30) return "Excellent reading session today!";
  if (minutesToday < 60) return "You're a reading machine!";
  return "Incredible! You're really into it today!";
};

export interface HistoricalWeek {
  id: string;
  startDate: Date;
  endDate: Date;
  minutes: number;
}

const getMostRecentSunday = (d: Date) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date;
};

const formatDateShort = (d: Date) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
};

const calculateHistoricalWeeks = (sessions: ReadingSession[]) => {
  if (sessions.length === 0) return { currentCalendarWeekMinutes: 0, historicalWeeks: [] as HistoricalWeek[] };

  const today = new Date();
  const currentSunday = getMostRecentSunday(today);

  let currentCalendarWeekSeconds = 0;
  const historyMap = new Map<string, HistoricalWeek>();

  sessions.forEach(s => {
    const d = s.startTime instanceof Timestamp ? s.startTime.toDate() : new Date(s.startTime);
    
    if (d.getTime() >= currentSunday.getTime()) {
      // It's this active calendar week (Sunday -> Present)
      currentCalendarWeekSeconds += s.durationSeconds;
    } else {
      // It's a historical week
      const sessionSunday = getMostRecentSunday(d);
      const sessionSaturday = new Date(sessionSunday);
      sessionSaturday.setDate(sessionSaturday.getDate() + 6);
      
      const label = `${formatDateShort(sessionSunday)} - ${formatDateShort(sessionSaturday)}`;
      
      if (!historyMap.has(sessionSunday.getTime().toString())) {
        historyMap.set(sessionSunday.getTime().toString(), {
          id: label,
          startDate: sessionSunday,
          endDate: sessionSaturday,
          minutes: 0, // Used as temporary accumulator for seconds
        });
      }
      
      const chunk = historyMap.get(sessionSunday.getTime().toString())!;
      chunk.minutes += s.durationSeconds;
      historyMap.set(sessionSunday.getTime().toString(), chunk);
    }
  });

  const historicalWeeks = Array.from(historyMap.values())
    .map(w => ({ ...w, minutes: Math.ceil(w.minutes / 60) }))
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

  return {
    currentCalendarWeekMinutes: Math.ceil(currentCalendarWeekSeconds / 60),
    currentWeekLabel: `${formatDateShort(currentSunday)} - ${formatDateShort(new Date(currentSunday.getTime() + 6 * 24 * 60 * 60 * 1000))}`,
    historicalWeeks
  };
};

/**
 * Helper to calculate per-book reading statistics
 */
const calculateBookBreakdown = async (sessions: ReadingSession[]) => {
  if (sessions.length === 0) return [];

  const bookMap = new Map<string, any>();
  
  sessions.forEach(s => {
    if (!bookMap.has(s.bookId)) {
      bookMap.set(s.bookId, {
        bookId: s.bookId,
        bookTitle: s.bookTitle,
        seconds: 0,
        lastRead: s.startTime instanceof Timestamp ? s.startTime.toDate() : new Date(s.startTime),
        contentType: s.contentType
      });
    }
    
    const stat = bookMap.get(s.bookId);
    stat.seconds += s.durationSeconds;
    
    const sessionDate = s.startTime instanceof Timestamp ? s.startTime.toDate() : new Date(s.startTime);
    if (sessionDate > stat.lastRead) {
      stat.lastRead = sessionDate;
    }
  });

  const bookIds = Array.from(bookMap.keys());
  const missingIds = bookIds.filter(id => !bookMetadataCache.has(id));

  if (missingIds.length > 0) {
    // Fetch missing covers in batches of 10
    const fetchPromises = [];
    for (let i = 0; i < missingIds.length; i += 10) {
      const batchIds = missingIds.slice(i, i + 10);
      
      const fetchBatch = async (ids: string[]) => {
        const [novelSnap, poemSnap] = await Promise.all([
          getDocs(query(collection(db, 'novels'), where(documentId(), 'in', ids))),
          getDocs(query(collection(db, 'poems'), where(documentId(), 'in', ids)))
        ]);

        novelSnap.forEach(doc => {
          const { chapters, ...rest } = doc.data() as any;
          bookMetadataCache.set(doc.id, rest.coverImage || '');
        });
        poemSnap.forEach(doc => {
          if (!bookMetadataCache.has(doc.id)) {
            bookMetadataCache.set(doc.id, doc.data().coverImage || '');
          }
        });

        // Mark any still missing as null to avoid re-fetching
        ids.forEach(id => {
          if (!bookMetadataCache.has(id)) {
            bookMetadataCache.set(id, null);
          }
        });
      };

      fetchPromises.push(fetchBatch(batchIds));
    }
    
    await Promise.all(fetchPromises);
  }

  return Array.from(bookMap.values())
    .map(b => ({
      ...b,
      minutes: Math.ceil(b.seconds / 60),
      coverImage: bookMetadataCache.get(b.bookId) || null
    }))
    .sort((a, b) => b.minutes - a.minutes);
};
