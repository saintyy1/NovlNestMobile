import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { withCache, CACHE_TTL } from './cache';

/**
 * Hydrates a list of comments (and their nested replies) with the most up-to-date 
 * user profile information (displayName and photoURL).
 * 
 * This mitigates the issue with NoSQL denormalized data where comments display
 * old names and avatars if a user subsequently updates their profile.
 * 
 * @param comments - Array of comment-like objects containing a userId
 * @returns A fully updated structure identical to the input with fresh profile identifiers
 */
export const hydrateComments = async <
  T extends { userId: string; userName: string; userPhoto?: string | null; replies?: T[] }
>(
  comments: T[]
): Promise<T[]> => {
  if (!comments || comments.length === 0) return comments;

  const uniqueUserIds = new Set<string>();

  // Extract all User IDs, traversing any nested trees if they've already been built
  const extractIds = (items: T[]) => {
    for (const item of items) {
      if (item.userId) uniqueUserIds.add(item.userId);
      if (item.replies && Array.isArray(item.replies)) {
        extractIds(item.replies);
      }
    }
  };

  extractIds(comments);

  const usersMap = new Map<string, { displayName: string; photoURL?: string }>();

  // Simultaneously fetch all unique users from Firestore (with caching)
  const userPromises = Array.from(uniqueUserIds).map(async (uid) => {
    try {
      const userData = await withCache(`user_preview_${uid}`, async () => {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          return {
            displayName: data.displayName || 'Anonymous',
            photoURL: data.photoURL,
          };
        }
        return { displayName: 'Deleted User' };
      }, CACHE_TTL.USER_PREVIEW);

      if (userData) {
        usersMap.set(uid, userData);
      }
    } catch (e) {
      console.error(`Failed to fetch user ${uid} for comment hydration`, e);
    }
  });

  await Promise.all(userPromises);

  // Recursively reconstruct the arrays with the hydrated User Details
  const hydrateArray = (items: T[]): T[] => {
    return items.map((item) => {
      const userData = usersMap.get(item.userId);
      const hydratedItem = { ...item };

      if (userData) {
        hydratedItem.userName = userData.displayName;
        hydratedItem.userPhoto = userData.photoURL || undefined;
      }

      if (hydratedItem.replies && Array.isArray(hydratedItem.replies)) {
        hydratedItem.replies = hydrateArray(hydratedItem.replies);
      }

      return hydratedItem;
    });
  };

  return hydrateArray(comments);
};
