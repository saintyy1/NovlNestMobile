// import { analytics } from '../firebase/config';
// import { logEvent } from "firebase/analytics";
// import { getOrCreateSessionId } from './sessionUtils';

// // Track recent events to prevent duplicates
// const recentEvents = new Map<string, number>();
// const DEDUPLICATION_WINDOW = 5000; // 5 seconds

// // Helper function to create event deduplication key
// const createEventKey = (eventName: string, userId: string, additionalData: any) => {
//   const keyData = {
//     event: eventName,
//     user: userId,
//     path: window.location.pathname,
//     // Include relevant data for deduplication
//     novel_id: additionalData.novel_id,
//     chapter_number: additionalData.chapter_number
//   };
//   return JSON.stringify(keyData);
// };

// // Helper function to check if event should be tracked (deduplication)
// const shouldTrackEvent = (eventName: string, userId: string, additionalData: any): boolean => {
//   const eventKey = createEventKey(eventName, userId, additionalData);
//   const now = Date.now();
//   const lastTracked = recentEvents.get(eventKey);
  
//   if (lastTracked && (now - lastTracked) < DEDUPLICATION_WINDOW) {
//     return false; // Skip duplicate event
//   }
  
//   recentEvents.set(eventKey, now);
  
//   // Clean up old entries periodically
//   if (recentEvents.size > 100) {
//     const cutoff = now - DEDUPLICATION_WINDOW;
//     for (const [key, timestamp] of recentEvents.entries()) {
//       if (timestamp < cutoff) {
//         recentEvents.delete(key);
//       }
//     }
//   }
  
//   return true;
// };

// // Page Views
// export const trackPageView = (pageName: string, additionalData: any = {}) => {
//   if (!analytics) return;
  
//   // Get user identifier for deduplication
//   const userId = additionalData.reader_id || additionalData.user_id || getOrCreateSessionId();
  
//   // Check if we should track this event (deduplication)
//   if (!shouldTrackEvent('page_view', userId, additionalData)) {
//     return; // Skip duplicate event
//   }
  
//   logEvent(analytics, 'page_view', {
//     page_name: pageName,
//     page_path: window.location.pathname,
//     timestamp: new Date().toISOString(),
//     ...additionalData
//   });
// };

// // Novel Interactions
// export const trackNovelView = (novelId: string, novelData: any) => {
//   if (!analytics) return;
  
//   const additionalData = {
//     novel_id: novelId,
//     novel_title: novelData.title,
//     novel_author: novelData.authorName,
//     novel_genres: novelData.genres
//   };
  
//   const userId = getOrCreateSessionId();
  
//   if (!shouldTrackEvent('novel_view', userId, additionalData)) {
//     return;
//   }
  
//   logEvent(analytics, 'novel_view', {
//     ...additionalData,
//     timestamp: new Date().toISOString()
//   });
// };

// export const trackChapterRead = (novelId: string, chapterData: any) => {
//   if (!analytics) return;
  
//   const additionalData = {
//     novel_id: novelId,
//     chapter_title: chapterData.title,
//     chapter_number: chapterData.number
//   };
  
//   const userId = chapterData.reader_id || getOrCreateSessionId();
  
//   if (!shouldTrackEvent('chapter_read', userId, additionalData)) {
//     return;
//   }
  
//   logEvent(analytics, 'chapter_read', {
//     ...additionalData,
//     timestamp: new Date().toISOString()
//   });
// };

// // User Actions
// export const trackUserRegistration = (userId: string, method: string) => {
//   logEvent(analytics, "sign_up", {
//     method: method,
//     user_id: userId
//   });
// };

// export const trackNovelInteraction = (
//   type: 'like' | 'comment',
//   data: {
//     novelId: string;
//     userId: string;
//     novelTitle?: string;
//     authorId?: string;
//     commentId?: string;
//     commentText?: string;
//   }
// ) => {
//   if (!analytics) return;

//   logEvent(analytics, `novel_${type}`, {
//     ...data,
//     timestamp: new Date().toISOString()
//   });
// };

// // User Engagement
// export const trackEngagementTime = (pageType: string, timeInSeconds: number) => {
//   logEvent(analytics, 'user_engagement', {
//     page_type: pageType,
//     time_spent: timeInSeconds,
//     timestamp: new Date().toISOString()
//   });
// };

// export const trackNovelRead = (novelData: {
//   novelId: string;
//   chapterIndex: number;
//   title: string;
//   isAnonymous?: boolean;
// }) => {
//   if (!analytics) return;

//   const sessionId = getOrCreateSessionId();
  
//   logEvent(analytics, 'novel_read', {
//     ...novelData,
//     reader_type: novelData.isAnonymous ? 'anonymous' : 'registered',
//     session_id: sessionId,
//     timestamp: new Date().toISOString()
//   });
// };

// export const trackAnonymousPageView = (pageData: {
//   pageName: string;
//   novelId?: string;
//   chapterIndex?: number;
// }) => {
//   if (!analytics) return;

//   const sessionId = getOrCreateSessionId();
//   const additionalData = {
//     ...pageData,
//     novel_id: pageData.novelId,
//     chapter_number: pageData.chapterIndex
//   };

//   if (!shouldTrackEvent('anonymous_page_view', sessionId, additionalData)) {
//     return;
//   }

//   logEvent(analytics, 'anonymous_page_view', {
//     ...pageData,
//     session_id: sessionId,
//     timestamp: new Date().toISOString(),
//     referrer: document.referrer,
//     user_agent: navigator.userAgent
//   });
// };

// // Invitation tracking
// export const trackInvitationSent = (inviterId: string, inviteeEmail: string, hasMessage: boolean) => {
//   if (!analytics) return;

//   const additionalData = {
//     inviter_id: inviterId,
//     invitee_email: inviteeEmail,
//     has_personal_message: hasMessage
//   };

//   const userId = inviterId;

//   if (!shouldTrackEvent('invitation_sent', userId, additionalData)) {
//     return;
//   }

//   logEvent(analytics, 'invitation_sent', {
//     ...additionalData,
//     timestamp: new Date().toISOString()
//   });
// };

// export const trackInvitationAccepted = (inviterId: string, inviteeEmail: string) => {
//   if (!analytics) return;

//   const additionalData = {
//     inviter_id: inviterId,
//     invitee_email: inviteeEmail
//   };

//   const userId = inviterId;

//   if (!shouldTrackEvent('invitation_accepted', userId, additionalData)) {
//     return;
//   }

//   logEvent(analytics, 'invitation_accepted', {
//     ...additionalData,
//     timestamp: new Date().toISOString()
//   });
// };