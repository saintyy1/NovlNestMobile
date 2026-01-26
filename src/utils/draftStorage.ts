// src/utils/draftStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export async function getDrafts(userId?: string): Promise<DraftData[]> {
  const key = makeKey(userId);
  const json = await AsyncStorage.getItem(key);
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

export async function saveDraft(draft: DraftData, userId?: string): Promise<void> {
  const key = makeKey(userId);
  const drafts = await getDrafts(userId);
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
  const drafts = await getDrafts(userId);
  const filtered = drafts.filter(d => d.id !== id);
  await AsyncStorage.setItem(key, JSON.stringify(filtered));
}

export async function clearAllDrafts(userId?: string): Promise<void> {
  const key = makeKey(userId);
  await AsyncStorage.removeItem(key);
}
