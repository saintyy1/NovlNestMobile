// src/utils/draftStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../src/firebase/config';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';

export type DraftType = 'novel' | 'poem';

export interface DraftData {
  id: string;
  type: DraftType;
  createdAt: string;
  updatedAt: string;
  data: any;
}

const DRAFTS_KEY = 'novlnest_drafts';

const makeKey = (userId?: string) => userId ? `${DRAFTS_KEY}_${userId}` : DRAFTS_KEY;

/** Read drafts from local AsyncStorage only (used as offline cache). */
async function getLocalDrafts(userId?: string): Promise<DraftData[]> {
  const key = makeKey(userId);
  const json = await AsyncStorage.getItem(key);
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

/**
 * Fetch drafts from Firestore, merge with local drafts,
 * and return the combined list (most-recently-updated wins).
 * Falls back to local-only if Firestore is unreachable.
 */
export async function getDrafts(userId?: string): Promise<DraftData[]> {
  const localDrafts = await getLocalDrafts(userId);

  if (!userId) return localDrafts;

  try {
    const draftsQuery = query(
      collection(db, 'drafts'),
      where('userId', '==', userId),
    );
    const snapshot = await getDocs(draftsQuery);

    const firestoreDrafts: DraftData[] = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: d.draftId || docSnap.id,
        type: d.type as DraftType,
        createdAt: d.createdAt || '',
        updatedAt: d.lastEditedAt || d.createdAt || '',
        data: d.draftData || {},
      };
    });

    // Merge: Firestore is the source of truth.
    // Start with a map keyed by draft id.
    const merged = new Map<string, DraftData>();

    // Add all Firestore drafts first
    for (const draft of firestoreDrafts) {
      merged.set(draft.id, draft);
    }

    // Add any local-only drafts (not yet synced to Firestore)
    for (const draft of localDrafts) {
      if (!merged.has(draft.id)) {
        merged.set(draft.id, draft);
      }
    }

    const result = Array.from(merged.values());

    // Update local cache with the merged result
    const key = makeKey(userId);
    await AsyncStorage.setItem(key, JSON.stringify(result));

    return result;
  } catch (error) {
    console.log('Firestore fetch failed, using local drafts:', error);
    return localDrafts;
  }
}

export async function saveDraft(draft: DraftData, userId?: string): Promise<void> {
  const key = makeKey(userId);
  const drafts = await getLocalDrafts(userId);
  const idx = drafts.findIndex(d => d.id === draft.id);
  if (idx !== -1) {
    drafts[idx] = draft;
  } else {
    drafts.push(draft);
  }
  await AsyncStorage.setItem(key, JSON.stringify(drafts));
}

export async function deleteDraft(id: string, userId?: string): Promise<void> {
  const key = makeKey(userId);
  const drafts = await getLocalDrafts(userId);
  const filtered = drafts.filter(d => d.id !== id);
  await AsyncStorage.setItem(key, JSON.stringify(filtered));

  try {
    const docRef = doc(db, 'drafts', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Failed to delete draft from Firestore:', error);
  }
}

export async function clearAllDrafts(userId?: string): Promise<void> {
  const key = makeKey(userId);
  await AsyncStorage.removeItem(key);
}
