import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';

// Configure how notifications should be handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const usePushNotifications = () => {
  const { currentUser } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  useEffect(() => {
    if (currentUser) {
      registerForPushNotificationsAsync().then((result) => {
        const { token, status } = result || { token: undefined, status: 'undetermined' };
        
        if (token && token !== currentUser.pushToken) {
          setExpoPushToken(token);
          saveTokenToFirestore(currentUser.uid, token);
        } else if (status === 'denied' && currentUser.pushNotificationsEnabled !== false) {
          // Sync database if OS permission was denied but DB still says enabled
          updatePushPreferenceInFirestore(currentUser.uid, false);
        } else if (status === 'granted' && currentUser.pushNotificationsEnabled === false) {
          // Optional: If they granted it but DB says disabled, re-enable it
          updatePushPreferenceInFirestore(currentUser.uid, true);
        }
      });
    }

    // This listener is fired whenever a notification is received while the app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      setNotification(notification);
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [currentUser?.uid]); // Only run on login/logout

  const saveTokenToFirestore = async (userId: string, token: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        pushToken: token,
        pushNotificationsEnabled: true, // Ensure enabled if we have a token
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error saving push token to Firestore:', error);
    }
  };

  const updatePushPreferenceInFirestore = async (userId: string, enabled: boolean) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        pushNotificationsEnabled: enabled,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error updating push preference in Firestore:', error);
    }
  };

  return {
    expoPushToken,
    notification,
  };
};

async function registerForPushNotificationsAsync() {
  let token;
  let finalStatus = 'undetermined';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return { token, status: finalStatus };
    }
    
    try {
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
        if (!projectId) {
            throw new Error('Project ID not found in expo config');
        }
        token = (await Notifications.getExpoPushTokenAsync({
            projectId,
        })).data;
    } catch (e) {
        console.error('Error getting Expo push token:', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return { token, status: finalStatus };
}
