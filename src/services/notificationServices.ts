import { collection, addDoc } from "firebase/firestore"
import { db } from "../firebase/config"
import * as Notifications from 'expo-notifications'

interface SendNotificationParams {
  type: string
  toUserId: string
  fromUserId?: string
  fromUserName?: string
  novelId?: string
  novelTitle?: string
  poemId?: string
  poemTitle?: string
  commentContent?: string
  commentId?: string
  parentId?: string
  announcementContent?: string
  chapterCount?: number
  chapterTitles?: string[]
  chapterNumber?: number
  chapterTitle?: string
  promotionPlan?: string
  promotionDuration?: string
  fromUserPhotoURL?: string
}

export const sendNotification = async (params: SendNotificationParams) => {
  try {
    await addDoc(collection(db, "notifications"), {
      ...params,
      createdAt: new Date().toISOString(),
      read: false,
    })
    console.log("Notification sent successfully")
  } catch (error) {
    console.error("Error sending notification:", error)
    throw error
  }
}


const _internalDismiss = async (userId: string) => {
  try {
    const presentedNotifications = await Notifications.getPresentedNotificationsAsync();
    if (presentedNotifications.length === 0) return;

    const dismissalPromises: Promise<void>[] = [];

    for (const notification of presentedNotifications) {
      const data = notification.request.content.data as any;
      const identifier = notification.request.identifier;
      const dataString = JSON.stringify(data || {});
      
      // Identify DM notifications by senderId/type (new), URL (legacy), or broad string search
      // This precision is designed specifically for standalone (AAB/IPA) builds.
      const isMatch = (data && data.type === 'dm' && data.senderId === userId) ||
                     (data && data.url && data.url.includes(userId)) ||
                     (dataString.includes(userId));

      if (isMatch) {
        dismissalPromises.push(Notifications.dismissNotificationAsync(identifier));
      }
    }

    if (dismissalPromises.length > 0) {
      await Promise.all(dismissalPromises);
      
      // Sync badge count to reflect the cleared notifications
      const currentBadge = await Notifications.getBadgeCountAsync();
      await Notifications.setBadgeCountAsync(Math.max(0, currentBadge - dismissalPromises.length));
    }
  } catch (error) {
    console.error("Error dismissing notifications:", error);
  }
};

/**
 * Automatically clears push notifications for a specific user.
 * Designed for perfect precision in production (AAB/IPA) standalone builds.
 */
export const dismissNotificationsForUser = async (userId: string) => {
  // Pass 1: Immediate cleanup
  await _internalDismiss(userId);
  
  // Pass 2: Delayed fallback to ensure grouped notifications are caught after OS re-indexing
  setTimeout(() => _internalDismiss(userId), 1500);
}

export const sendPromotionApprovedNotification = async (
  userId: string,
  novelId: string,
  novelTitle: string,
  promotionPlan: string,
  promotionDuration: string
) => {
  await sendNotification({
    type: "promotion_approved",
    toUserId: userId,
    novelId,
    novelTitle,
    promotionPlan,
    promotionDuration,
  })
}

export const sendPromotionEndedNotification = async (
  userId: string,
  novelId: string,
  novelTitle: string
) => {
  await sendNotification({
    type: "promotion_ended",
    toUserId: userId,
    novelId,
    novelTitle,
  })
}

