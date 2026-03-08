import { db } from '../firebase/config';
import {
    doc,
    setDoc,
    getDocs,
    query,
    collection,
    where,
    orderBy,
    limit,
    serverTimestamp,
    deleteDoc
} from 'firebase/firestore';

export interface ReadingProgress {
    userId: string;
    novelId: string;
    novelTitle: string;
    novelCover?: string | null;
    chapterIndex: number;
    chapterTitle: string;
    updatedAt: any;
}

/**
 * Updates or creates reading progress for a user and a specific novel.
 */
export const updateReadingProgress = async (
    userId: string,
    novelId: string,
    novelTitle: string,
    novelCover: string | null | undefined,
    chapterIndex: number,
    chapterTitle: string
) => {
    if (!userId || !novelId) return;

    try {
        const progressRef = doc(db, 'readingProgress', `${userId}_${novelId}`);
        await setDoc(progressRef, {
            userId,
            novelId,
            novelTitle,
            novelCover: novelCover || null,
            chapterIndex,
            chapterTitle,
            updatedAt: serverTimestamp(),
        }, { merge: true });
    } catch (error) {
        console.error('Error updating reading progress:', error);
    }
};

/**
 * Fetches the most recent reading progress entries for a user.
 */
export const getReadingProgress = async (userId: string, maxItems: number = 10): Promise<ReadingProgress[]> => {
    if (!userId) return [];

    try {
        const progressRef = collection(db, 'readingProgress');
        const q = query(
            progressRef,
            where('userId', '==', userId),
            orderBy('updatedAt', 'desc'),
            limit(maxItems)
        );

        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            ...doc.data(),
        } as ReadingProgress));
    } catch (error) {
        console.error('Error fetching reading progress:', error);
        return [];
    }
};

/**
 * Deletes reading progress for a user and a specific novel.
 */
export const deleteReadingProgress = async (userId: string, novelId: string) => {
    if (!userId || !novelId) return;

    try {
        const progressRef = doc(db, 'readingProgress', `${userId}_${novelId}`);
        await deleteDoc(progressRef);
    } catch (error) {
        console.error('Error deleting reading progress:', error);
    }
};
