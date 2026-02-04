import { collection, addDoc } from "firebase/firestore"
import { db } from "../firebase/config"

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

