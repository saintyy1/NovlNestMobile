import { useState, useEffect, useRef, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { getDrafts, saveDraft, DraftData } from '../utils/draftStorage';
import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export type SaveStatus = 'Saving...' | 'Saved' | 'Offline — saving locally' | null;

interface UseDraftAutoSaveProps {
    draftId: string | null;
    setDraftId: (id: string) => void;
    submitType: 'novel' | 'poem' | null;
    currentUser: any;
    draftData: any;
}

export function useDraftAutoSave({
    draftId,
    setDraftId,
    submitType,
    currentUser,
    draftData,
}: UseDraftAutoSaveProps) {
    const [saveStatus, _setSaveStatus] = useState<SaveStatus>(null);

    const setSaveStatus = (status: SaveStatus) => {
        _setSaveStatus(status);
        DeviceEventEmitter.emit('draftSaveStatus', status);
    };

    const draftDataRef = useRef(draftData);
    const draftIdRef = useRef(draftId);
    const pendingSaveRef = useRef(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Deep comparison to avoid unnecessary saves
    const hasDataChanged = (oldData: any, newData: any) => {
        return JSON.stringify(oldData) !== JSON.stringify(newData);
    };

    useEffect(() => {
        const hasData = checkHasData(draftData, submitType);

        // Only init draft if we have some data
        if (!hasData && !draftIdRef.current) {
            return;
        }

        // Check if data actually changed
        if (hasDataChanged(draftDataRef.current, draftData) || !draftIdRef.current) {
            draftDataRef.current = draftData;

            if (hasData) {
                pendingSaveRef.current = true;
                setSaveStatus('Saving...');

                if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = setTimeout(() => {
                    performSave();
                }, 1500);
            }
        }
    }, [draftData, submitType]);

    useEffect(() => {
        draftIdRef.current = draftId;
    }, [draftId]);

    const performSave = useCallback(async () => {
        if (!submitType || !currentUser || !pendingSaveRef.current) return;

        try {
            const currentDraftId = draftIdRef.current;
            const newId = (currentDraftId && currentDraftId.startsWith(`${submitType}-`))
                ? currentDraftId
                : `${submitType}-${Date.now()}`;

            if (newId !== currentDraftId) {
                setDraftId(newId);
                draftIdRef.current = newId;
            }

            let wordCount = 0;
            if (submitType === 'novel') {
                wordCount = (draftDataRef.current.chapters || []).reduce((acc: number, ch: any) => acc + (ch.content || '').split(/\s+/).filter(Boolean).length, 0);
            } else {
                wordCount = (draftDataRef.current.content || '').split(/\s+/).filter(Boolean).length;
            }

            const now = new Date().toISOString();

            const existingDrafts = await getDrafts(currentUser.uid);
            const existing = existingDrafts.find(d => d.id === newId);
            const createdAt = existing?.createdAt || now;

            // 1. Save locally
            const draftToSave: DraftData = {
                id: newId,
                type: submitType,
                createdAt,
                updatedAt: now,
                data: {
                    ...draftDataRef.current,
                    wordCount,
                }
            };

            await saveDraft(draftToSave, currentUser.uid);

            // 2. Sync to Firestore
            try {
                const firestoreDraft: any = {
                    draftId: newId,
                    userId: currentUser.uid,
                    title: draftDataRef.current.title || '',
                    type: submitType,
                    status: 'draft',
                    wordCount,
                    createdAt,
                    lastEditedAt: now,
                    // Include full nested data so we can recover the form perfectly
                    draftData: draftDataRef.current,
                };

                if (submitType === 'novel') {
                    firestoreDraft.content = JSON.stringify(draftDataRef.current.chapters || []);
                } else {
                    firestoreDraft.content = draftDataRef.current.content || '';
                }

                const draftRef = doc(collection(db, 'drafts'), newId);
                await setDoc(draftRef, firestoreDraft);
                setSaveStatus('Saved');
            } catch (err) {
                console.log('Firestore sync failed, saved locally', err);
                setSaveStatus('Offline — saving locally');
            }

            pendingSaveRef.current = false;
        } catch (err) {
            console.error('Failed to save draft locally', err);
        }
    }, [submitType, currentUser, setDraftId]);

    // Periodic save
    useEffect(() => {
        const interval = setInterval(() => {
            if (pendingSaveRef.current) {
                performSave();
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [performSave]);

    return { saveStatus };
}

function checkHasData(data: any, type: 'novel' | 'poem' | null) {
    if (!type || !data) return false;
    if (data.title?.trim() || data.description?.trim() || data.genres?.length > 0 || data.coverImage) return true;

    if (type === 'novel') {
        if (data.summary?.trim() || data.authorsNote?.trim() || data.prologue?.trim() || (data.chapters && data.chapters.length > 0)) return true;
    } else if (type === 'poem') {
        if (data.content?.trim()) return true;
    }
    return false;
}
