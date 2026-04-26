import Constants from 'expo-constants';

const BACKEND_URL = (process.env.EXPO_PUBLIC_APP_URL || 'https://novlnest-pdf-parser.vercel.app').replace(/\/$/, '');

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000; // 1 second
const TIMEOUT_MS = 10000; // 10 seconds

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const sendPushNotification = async (toUserId: string, title: string, body: string, data?: any) => {
  const url = `${BACKEND_URL}/api/notify-user`;
  let currentRetry = 0;

  while (currentRetry <= MAX_RETRIES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      if (currentRetry > 0) {
        console.log(`Push notification retry attempt ${currentRetry} for ${toUserId}`);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': process.env.EXPO_PUBLIC_CRON_SECRET || '',
        },
        body: JSON.stringify({
          toUserId,
          title,
          body,
          data,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        console.warn('Push notification rate limited (429). Retrying in 3 seconds...');
        await wait(3000);
        // We don't increment currentRetry here because 429 is a temporary server state,
        // but we should still respect the MAX_RETRIES to prevent infinite loops in extreme cases.
        currentRetry++; 
        continue;
      }

      const text = await response.text();
      
      if (!response.ok) {
        console.warn(`Push notification backend failed (${response.status}):`, text);
        // Don't retry for 4xx client errors (e.g. invalid user ID), except 429 which we handled above
        if (response.status >= 400 && response.status < 500) {
          return { success: false, error: `Client error ${response.status}` };
        }
        // For 5xx server errors, we can retry
        throw new Error(`Server error ${response.status}`);
      }

      if (!text) {
        return { success: true, message: 'Push sent (no response body)' };
      }

      try {
        const result = JSON.parse(text);
        if (!result.success) {
          console.warn('Push notification backend error:', result.error);
        }
        return result;
      } catch (parseError) {
        console.warn('Push notification backend returned non-JSON:', text);
        return { success: true, message: 'Push sent (malformed response)' };
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      currentRetry++;

      if (currentRetry > MAX_RETRIES) {
        if (error.name === 'AbortError') {
          console.error('Push notification timed out after all retries');
          return { success: false, error: 'Timeout error' };
        }
        console.error('Failed to send push notification after all retries:', error);
        return { success: false, error: 'Network error or permanent failure' };
      }

      // Calculate exponential backoff: 1s, 2s, 4s...
      const backoffTime = INITIAL_BACKOFF * Math.pow(2, currentRetry - 1);
      console.log(`Push notification attempt ${currentRetry-1} failed. Retrying in ${backoffTime}ms...`);
      await wait(backoffTime);
    }
  }

  return { success: false, error: 'Maximum retries exceeded' };
};

export const broadcastNotification = async (
  recipientConfig: { type: 'library_users' | 'followers' | 'custom', id?: string, userIds?: string[] },
  notificationData: any,
  pushData: { title: string, body: string, data?: any }
) => {
  const url = `${BACKEND_URL}/api/broadcast-notification`;
  let currentRetry = 0;

  while (currentRetry <= MAX_RETRIES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': process.env.EXPO_PUBLIC_CRON_SECRET || '',
        },
        body: JSON.stringify({
          recipientConfig,
          notificationData,
          pushData,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const text = await response.text();
      
      if (!response.ok) {
        console.warn(`Broadcast notification backend failed (${response.status}):`, text);
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return { success: false, error: `Client error ${response.status}` };
        }
        throw new Error(`Server error ${response.status}`);
      }

      try {
        return JSON.parse(text);
      } catch (parseError) {
        return { success: true, message: 'Broadcast initiated' };
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      currentRetry++;

      if (currentRetry > MAX_RETRIES) {
        console.error('Failed to send broadcast notification after all retries:', error);
        return { success: false, error: 'Broadcast failed after retries' };
      }

      const backoffTime = INITIAL_BACKOFF * Math.pow(2, currentRetry - 1);
      await wait(backoffTime);
    }
  }

  return { success: false, error: 'Maximum retries exceeded' };
};
