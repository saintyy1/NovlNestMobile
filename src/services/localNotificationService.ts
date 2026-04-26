import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const STREAK_REMINDER_ID = 'reading_streak_reminder';

/**
 * Schedules a local notification for 6:00 PM today.
 * Only if the notification isn't already scheduled for today.
 */
export const scheduleStreakReminder = async () => {
  try {
    // 1. Check if we already have a notification scheduled
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const isAlreadyScheduled = scheduledNotifications.some(
      (n) => n.identifier === STREAK_REMINDER_ID
    );

    if (isAlreadyScheduled) {
      // console.log('[LocalNotification] Streak reminder already scheduled.');
      return;
    }

    // 2. Calculate 6:00 PM today
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(18, 0, 0, 0); // 6:00 PM

    // If it's already past 6:00 PM, don't schedule for today
    if (now >= scheduledTime) {
      // console.log('[LocalNotification] Past 6:00 PM, skipping reminder for today.');
      return;
    }

    // 3. Schedule the notification
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_REMINDER_ID,
      content: {
        title: 'Keep the streak alive! 🔥',
        body: "You're doing great! Don't forget to read a bit today to maintain your reading streak.",
        data: { url: 'novlnest://library' },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: scheduledTime,
      },
    });

    console.log('[LocalNotification] Streak reminder scheduled for 6:00 PM today.');
  } catch (error) {
    console.error('[LocalNotification] Error scheduling streak reminder:', error);
  }
};

/**
 * Cancels any pending streak reminders.
 */
export const cancelStreakReminder = async () => {
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID);
    // console.log('[LocalNotification] Streak reminder cancelled.');
  } catch (error) {
    console.error('[LocalNotification] Error cancelling streak reminder:', error);
  }
};
