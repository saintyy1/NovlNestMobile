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

      const text = await response.text();
      
      if (!response.ok) {
        console.warn(`Push notification backend failed (${response.status}):`, text);
        // Don't retry for 4xx client errors (e.g. invalid user ID)
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
