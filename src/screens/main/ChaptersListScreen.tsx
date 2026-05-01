// src/screens/main/ChaptersListScreen.tsx
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../firebase/config';
import { Ionicons } from '@expo/vector-icons';
import type { Novel } from '../../types/novel';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAlert } from '../../contexts/AlertContext';
import { withCache, invalidateCache, invalidateByPrefix } from '../../utils/cache';
import {
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    deleteField,
    increment,
    writeBatch,
    setDoc,
} from 'firebase/firestore';
import { broadcastNotification } from '../../services/PushNotificationService';
import { get } from 'react-native/Libraries/TurboModule/TurboModuleRegistry';

interface Chapter {
    title: string;
    content: string;
}

const ChaptersListScreen = ({ route, navigation }: any) => {
    const { novel: initialNovel } = route.params;
    const { currentUser } = useAuth();
    const { colors } = useTheme();
    const { showAlert, showToast } = useAlert();
    const insets = useSafeAreaInsets();

    const [novel, setNovel] = React.useState<Novel>(initialNovel);
    const [loading, setLoading] = React.useState(!initialNovel?.chapterTitles && initialNovel?.id);

    const styles = getStyles(colors);

    React.useEffect(() => {
        const fetchFullNovel = async () => {
            if (!initialNovel?.id) return;

            // Check if we already have the chapter titles
            if (initialNovel.chapterTitles && initialNovel.chapterTitles.length > 0) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const novelRef = doc(db, 'novels', initialNovel.id);
                const novelDoc = await getDoc(novelRef);
                if (novelDoc.exists()) {
                    setNovel({ id: novelDoc.id, ...novelDoc.data() } as Novel);
                }
            } catch (error) {
                console.error('Error fetching full novel for chapters list:', error);
                showToast({ message: 'Failed to load full chapter list.', type: 'error' });
            } finally {
                setLoading(false);
            }
        };

        fetchFullNovel();
    }, [initialNovel?.id]);

    const getTotalParts = () => {
        if (!novel) return 0;
        const chaptersCount = novel.chapterCount ?? 0;
        return (
            (novel.authorsNote ? 1 : 0) +
            (novel.prologue ? 1 : 0) +
            chaptersCount +
            (novel.epilogue ? 1 : 0)
        );
    };

    const getChapterNumber = (type: string, index?: number) => {
        if (!novel) return 0;

        const hasNote = novel.authorsNote ? 1 : 0;
        const hasPrologue = novel.prologue ? 1 : 0;
        const hasCharacters = (novel.characters && novel.characters.length > 0) ? 1 : 0;

        if (type === 'authorsNote') return 0;

        if (type === 'prologue') {
            return hasNote;
        }

        if (type === 'characters') {
            return hasNote + hasPrologue;
        }

        if (type === 'chapter' && index !== undefined) {
            return hasNote + hasPrologue + hasCharacters + index;
        }

        if (type === 'epilogue') {
            const chaptersCount = novel.chapterCount ?? 0;
            return hasNote + hasPrologue + hasCharacters + chaptersCount;
        }

        return 0;
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
            <ScrollView
                style={styles.container}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) }}
            >
                <View style={styles.header}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View>
                            <Text style={styles.title}>Table of Contents</Text>
                            <Text style={styles.subtitle}>{getTotalParts()} parts</Text>
                        </View>
                        {currentUser && novel?.authorId === currentUser.uid && (
                            <TouchableOpacity
                                style={styles.manageCharactersButton}
                                onPress={() => navigation.navigate('CharacterManager', {
                                    novelId: novel.id,
                                    initialCharacters: novel.characters || []
                                })}
                            >
                                <Ionicons name="people-outline" size={18} color={colors.primary} />
                                <Text style={styles.manageCharactersButtonText}>Characters</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Long press hint for authors */}
                    {!loading && currentUser && novel?.authorId === currentUser.uid && (
                        <View style={styles.longPressHint}>
                            <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                            <Text style={styles.longPressHintText}>
                                Long press any part below to edit or delete it
                            </Text>
                        </View>
                    )}
                </View>

                {loading ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={{ marginTop: 12, color: colors.textSecondary }}>Refreshing chapters...</Text>
                    </View>
                ) : (
                    <View style={styles.chaptersList}>
                        {/* Author's Note */}
                        {novel.authorsNote && (
                            <TouchableOpacity
                                style={styles.chapterItem}
                                onPress={() => {
                                    navigation.navigate('NovelReader', {
                                        novelId: novel.id,
                                        chapterNumber: getChapterNumber('authorsNote'),
                                    });
                                }}
                                onLongPress={() => {
                                    const isAuthor = currentUser && novel.authorId === currentUser.uid;
                                    if (isAuthor) {
                                        showAlert({
                                            title: "Author's Note",
                                            message: 'Choose an action',
                                            type: 'info',
                                            buttons: [
                                                {
                                                    text: "Edit Author's Note",
                                                    onPress: () => {
                                                        navigation.navigate('ChapterEditor', {
                                                            chapterNumber: "Author's Note",
                                                            initialTitle: "Author's Note",
                                                            initialContent: novel.authorsNote || '',
                                                            onSave: async (noteData: { title: string; content: string }) => {
                                                                try {
                                                                    await updateDoc(doc(db, 'novels', novel.id), {
                                                                        authorsNote: noteData.content,
                                                                        updatedAt: new Date().toISOString(),
                                                                    });
                                                                    // Update local state
                                                                    setNovel(prev => ({ ...prev, authorsNote: noteData.content }));
                                                                    await invalidateCache(`novel_${novel.id}`);
                                                                    await invalidateByPrefix("home_");
                                                                    await invalidateByPrefix("browse_");
                                                                    await invalidateByPrefix("profile_");
                                                                    showToast({ message: "Author's Note updated!", type: 'success' });
                                                                } catch (error) {
                                                                    console.error("Error updating author's note:", error);
                                                                    showToast({ message: "Failed to update author's note", type: 'error' });
                                                                }
                                                            }
                                                        });
                                                    },
                                                },
                                                {
                                                    text: "Delete Author's Note",
                                                    style: 'destructive',
                                                    onPress: () => {
                                                        showAlert({
                                                            title: "Delete Author's Note",
                                                            message: 'Are you sure you want to delete this note?',
                                                            type: 'warning',
                                                            buttons: [
                                                                {
                                                                    text: 'Delete',
                                                                    style: 'destructive',
                                                                    onPress: async () => {
                                                                        try {
                                                                            await updateDoc(doc(db, 'novels', novel.id), {
                                                                                authorsNote: deleteField(),
                                                                            });
                                                                            // Update local state
                                                                            setNovel(prev => {
                                                                                const next = { ...prev };
                                                                                delete next.authorsNote;
                                                                                return next;
                                                                            });
                                                                            await invalidateCache(`novel_${novel.id}`);
                                                                            await invalidateByPrefix("home_");
                                                                            await invalidateByPrefix("browse_");
                                                                            await invalidateByPrefix("profile_");
                                                                            showToast({ message: "Author's Note deleted!", type: 'success' });
                                                                        } catch (error) {
                                                                            console.error("Error deleting note:", error);
                                                                            showToast({ message: 'Failed to delete note', type: 'error' });
                                                                        }
                                                                    },
                                                                },
                                                                { text: 'Cancel', style: 'cancel' },
                                                            ]
                                                        });
                                                    },
                                                },
                                                { text: 'Cancel', style: 'cancel' },
                                            ]
                                        });
                                    }
                                }}
                            >
                                <View style={styles.chapterInfo}>
                                    <View style={styles.chapterIconContainer}>
                                        <Text style={styles.chapterIcon}>📝</Text>
                                    </View>
                                    <View style={styles.chapterTextContainer}>
                                        <Text style={styles.chapterTitle}>Author's Note</Text>
                                        <Text style={styles.chapterSubtitle}>Special message from the author</Text>
                                    </View>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                            </TouchableOpacity>
                        )}

                        {/* Prologue */}
                        {novel.prologue && (
                            <TouchableOpacity
                                style={styles.chapterItem}
                                onPress={() => {
                                    navigation.navigate('NovelReader', {
                                        novelId: novel.id,
                                        chapterNumber: getChapterNumber('prologue'),
                                    });
                                }}
                                onLongPress={() => {
                                    const isAuthor = currentUser && novel.authorId === currentUser.uid;
                                    if (isAuthor) {
                                        showAlert({
                                            title: 'Prologue',
                                            message: 'Choose an action',
                                            type: 'info',
                                            buttons: [
                                                {
                                                    text: 'Edit Prologue',
                                                    onPress: () => {
                                                        navigation.navigate('ChapterEditor', {
                                                            chapterNumber: 'Prologue',
                                                            initialTitle: 'Prologue',
                                                            initialContent: novel.prologue || '',
                                                            onSave: async (prologueData: { title: string; content: string }) => {
                                                                try {
                                                                    await updateDoc(doc(db, 'novels', novel.id), {
                                                                        prologue: prologueData.content,
                                                                        updatedAt: new Date().toISOString(),
                                                                    });
                                                                    // Update local state
                                                                    setNovel(prev => ({ ...prev, prologue: prologueData.content }));
                                                                    await invalidateCache(`novel_${novel.id}`);
                                                                    await invalidateByPrefix("home_");
                                                                    await invalidateByPrefix("browse_");
                                                                    await invalidateByPrefix("profile_");
                                                                    showToast({ message: 'Prologue updated!', type: 'success' });
                                                                } catch (error) {
                                                                    console.error('Error updating prologue:', error);
                                                                    showToast({ message: 'Failed to update prologue', type: 'error' });
                                                                }
                                                            }
                                                        });
                                                    },
                                                },
                                                {
                                                    text: 'Delete Prologue',
                                                    style: 'destructive',
                                                    onPress: () => {
                                                        showAlert({
                                                            title: 'Delete Prologue',
                                                            message: 'Are you sure you want to delete the prologue?',
                                                            type: 'warning',
                                                            buttons: [
                                                                {
                                                                    text: 'Delete',
                                                                    style: 'destructive',
                                                                    onPress: async () => {
                                                                        try {
                                                                            await updateDoc(doc(db, 'novels', novel.id), {
                                                                                prologue: deleteField(),
                                                                            });
                                                                            // Update local state
                                                                            setNovel(prev => {
                                                                                const next = { ...prev };
                                                                                delete next.prologue;
                                                                                return next;
                                                                            });
                                                                            await invalidateCache(`novel_${novel.id}`);
                                                                            await invalidateByPrefix("home_");
                                                                            await invalidateByPrefix("browse_");
                                                                            await invalidateByPrefix("profile_");
                                                                            showToast({ message: 'Prologue deleted!', type: 'success' });
                                                                        } catch (error) {
                                                                            console.error('Error deleting prologue:', error);
                                                                            showToast({ message: 'Failed to delete prologue', type: 'error' });
                                                                        }
                                                                    },
                                                                },
                                                                { text: 'Cancel', style: 'cancel' },
                                                            ]
                                                        });
                                                    },
                                                },
                                                { text: 'Cancel', style: 'cancel' },
                                            ]
                                        });
                                    }
                                }}
                            >
                                <View style={styles.chapterInfo}>
                                    <View style={styles.chapterIconContainer}>
                                        <Text style={styles.chapterIcon}>🌅</Text>
                                    </View>
                                    <View style={styles.chapterTextContainer}>
                                        <Text style={styles.chapterTitle}>Prologue</Text>
                                        <Text style={styles.chapterSubtitle}>The beginning</Text>
                                    </View>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                            </TouchableOpacity>
                        )}

                        {/* Cast of Characters */}
                        {novel.characters && novel.characters.length > 0 ? (
                            <TouchableOpacity
                                style={styles.chapterItem}
                                onPress={() => {
                                    navigation.navigate('NovelReader', {
                                        novelId: novel.id,
                                        chapterNumber: getChapterNumber('characters'),
                                    });
                                }}
                            >
                                <View style={styles.chapterInfo}>
                                    <View style={styles.chapterIconContainer}>
                                        <Text style={styles.chapterIcon}>👥</Text>
                                    </View>
                                    <View style={styles.chapterTextContainer}>
                                        <Text style={styles.chapterTitle}>Cast of Characters</Text>
                                    </View>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                            </TouchableOpacity>
                        ) : null}

                        {/* Regular Chapters */}
                        {(() => {
                            const chaptersCount = novel.chapterCount ?? 0;
                            const titles = novel.chapterTitles || [];

                            return Array.from({ length: chaptersCount }).map((_, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.chapterItem}
                                    onPress={() =>
                                        navigation.navigate('NovelReader', {
                                            novelId: novel.id,
                                            chapterNumber: getChapterNumber('chapter', index),
                                        })
                                    }
                                    onLongPress={() => {
                                        const isAuthor = novel.authorId === currentUser?.uid;
                                        if (isAuthor) {
                                            showAlert({
                                                title: titles[index] || `Chapter ${index + 1}`,
                                                message: 'Choose an action',
                                                type: 'info',
                                                buttons: [
                                                    {
                                                        text: 'Edit',
                                                        onPress: () =>
                                                            navigation.navigate('EditChapter', {
                                                                novelId: novel.id,
                                                                chapterIndex: index,
                                                            }),
                                                    },
                                                    {
                                                        text: 'Delete',
                                                        style: 'destructive',
                                                        onPress: () => {
                                                            showAlert({
                                                                title: 'Confirm Deletion',
                                                                message: 'Are you sure you want to delete this chapter? This action cannot be undone.',
                                                                type: 'warning',
                                                                buttons: [
                                                                    {
                                                                        text: 'Delete',
                                                                        style: 'destructive',
                                                                        onPress: async () => {
                                                                            try {
                                                                                const novelRef = doc(db, 'novels', novel.id);
                                                                                const novelDoc = await getDoc(novelRef);
                                                                                if (novelDoc.exists()) {
                                                                                    const novelData = novelDoc.data() as Novel;

                                                                                    // 1. Update Novel Metadata
                                                                                    if (novelData.chapterTitles) {
                                                                                        const updatedTitles = [...novelData.chapterTitles];
                                                                                        updatedTitles.splice(index, 1);
                                                                                        await updateDoc(novelRef, {
                                                                                            chapterTitles: updatedTitles,
                                                                                            chapterCount: increment(-1),
                                                                                            updatedAt: new Date().toISOString()
                                                                                        });
                                                                                    }

                                                                                    // 2. Re-index Subcollection Documents
                                                                                    // We need to move chapters [index+1...count-1] down to [index...count-2]
                                                                                    const batch = writeBatch(db);
                                                                                    const count = novelData.chapterCount || 0;

                                                                                    // Sequential move to avoid conflicts if we were using a single batch,
                                                                                    // but Firestore doc IDs are distinct, so we can just read then write.
                                                                                    for (let i = index + 1; i < count; i++) {
                                                                                        const oldRef = doc(db, 'novels', novel.id, 'chapters', i.toString());
                                                                                        const newRef = doc(db, 'novels', novel.id, 'chapters', (i - 1).toString());
                                                                                        const oldDoc = await getDoc(oldRef);
                                                                                        if (oldDoc.exists()) {
                                                                                            batch.set(newRef, { ...oldDoc.data(), order: i - 1 });
                                                                                        }
                                                                                    }

                                                                                    // Delete the last document (which is now a duplicate of the second-to-last, or the one we deleted)
                                                                                    const lastRef = doc(db, 'novels', novel.id, 'chapters', (count - 1).toString());
                                                                                    batch.delete(lastRef);

                                                                                    await batch.commit();

                                                                                    setNovel(prev => {
                                                                                        const next = { ...prev };
                                                                                        if (next.chapterTitles) next.chapterTitles.splice(index, 1);
                                                                                        if (next.chapterCount) next.chapterCount -= 1;
                                                                                        return next;
                                                                                    });

                                                                                    await invalidateCache(`novel_${novel.id}`);
                                                                                    await invalidateByPrefix(`chapter_${novel.id}`);
                                                                                    showToast({ message: 'Chapter deleted!', type: 'success' });
                                                                                }
                                                                            } catch (error) {
                                                                                console.error('Error deleting chapter:', error);
                                                                                showToast({ message: 'Failed to delete chapter.', type: 'error' });
                                                                            }
                                                                        },
                                                                    },
                                                                    { text: 'Cancel', style: 'cancel' },
                                                                ]
                                                            });
                                                        },
                                                    },
                                                    { text: 'Cancel', style: 'cancel' },
                                                ]
                                            });
                                        }
                                    }}
                                >
                                    <View style={styles.chapterInfo}>
                                        <View style={styles.chapterNumberContainer}>
                                            <Text style={styles.chapterNumber}>{index + 1}</Text>
                                        </View>
                                        <View style={styles.chapterTextContainer}>
                                            <Text style={styles.chapterTitle}>{titles[index] || `Chapter ${index + 1}`}</Text>
                                            <Text style={styles.chapterSubtitle}>Chapter {index + 1}</Text>
                                        </View>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                                </TouchableOpacity>
                            ));
                        })()}

                        {/* Epilogue */}
                        {novel.epilogue && (
                            <TouchableOpacity
                                style={styles.chapterItem}
                                onPress={() => {
                                    navigation.navigate('NovelReader', {
                                        novelId: novel.id,
                                        chapterNumber: getChapterNumber('epilogue'),
                                    });
                                }}
                                onLongPress={() => {
                                    const isAuthor = currentUser && novel.authorId === currentUser.uid;
                                    if (isAuthor) {
                                        showAlert({
                                            title: 'Manage Epilogue',
                                            message: 'Choose an action for the epilogue',
                                            type: 'info',
                                            buttons: [
                                                {
                                                    text: 'Edit',
                                                    onPress: () => {
                                                        navigation.navigate('ChapterEditor', {
                                                            chapterNumber: 'Epilogue',
                                                            initialTitle: novel.epilogue?.title || 'Epilogue',
                                                            initialContent: novel.epilogue?.content || '',
                                                            onSave: async (epilogueData: { title: string; content: string }) => {
                                                                try {
                                                                    const isNewEpilogue = !novel.epilogue;
                                                                    const wasAlreadyCompleted = novel.status === 'completed';

                                                                    const updateData: any = {
                                                                        epilogue: epilogueData,
                                                                        updatedAt: new Date().toISOString(),
                                                                    };

                                                                    if (!wasAlreadyCompleted) {
                                                                        updateData.status = 'completed';
                                                                    }

                                                                    await updateDoc(doc(db, 'novels', novel.id), updateData);

                                                                    // Update local state
                                                                    setNovel(prev => ({
                                                                        ...prev,
                                                                        epilogue: epilogueData,
                                                                        status: updateData.status || prev.status
                                                                    }));

                                                                    // Invalidate novel and epilogue cache
                                                                    await invalidateCache(`novel_${novel.id}`);
                                                                    await invalidateCache(`chapter_${novel.id}_epilogue`);
                                                                    await invalidateByPrefix("home_");
                                                                    await invalidateByPrefix("browse_");
                                                                    await invalidateByPrefix("profile_");

                                                                    showToast({ message: isNewEpilogue ? 'Epilogue added and novel completed!' : 'Epilogue updated!', type: 'success' });

                                                                    // Send Notifications
                                                                    if (isNewEpilogue) {
                                                                        const authorName = currentUser?.displayName || 'The author';

                                                                        // 1. Epilogue Notification
                                                                        await broadcastNotification(
                                                                            { type: 'library_users', id: novel.id },
                                                                            {
                                                                                fromUserId: currentUser?.uid,
                                                                                fromUserName: authorName,
                                                                                type: 'new_chapter',
                                                                                novelId: novel.id,
                                                                                novelTitle: novel.title,
                                                                                chapterTitle: epilogueData.title || 'Epilogue',
                                                                            },
                                                                            {
                                                                                title: "The Grand Finale 🎭",
                                                                                body: `${authorName} just added an epilogue to '${novel.title}'. The journey is finally complete!`,
                                                                                data: { url: `novlnest://novel/${novel.id}/read?chapter=${novel.chapterCount || 0}` }
                                                                            }
                                                                        );

                                                                        // 2. Completion Notification
                                                                        if (!wasAlreadyCompleted) {
                                                                            await broadcastNotification(
                                                                                { type: 'library_users', id: novel.id },
                                                                                {
                                                                                    fromUserId: currentUser?.uid,
                                                                                    fromUserName: authorName,
                                                                                    type: 'novel_finished',
                                                                                    novelId: novel.id,
                                                                                    novelTitle: novel.title,
                                                                                },
                                                                                {
                                                                                    title: "Mission Accomplished! 🏆",
                                                                                    body: `'${novel.title}' is now officially finished. Congratulations to ${authorName} on this incredible story!`,
                                                                                    data: { url: `novlnest://novel/${novel.id}` }
                                                                                }
                                                                            );
                                                                        }
                                                                    }
                                                                } catch (error) {
                                                                    console.error('Error updating epilogue:', error);
                                                                    showToast({ message: 'Failed to update epilogue', type: 'error' });
                                                                }
                                                            }
                                                        });
                                                    },
                                                },
                                                {
                                                    text: 'Delete',
                                                    style: 'destructive',
                                                    onPress: () => {
                                                        showAlert({
                                                            title: 'Delete Epilogue',
                                                            message: 'Are you sure you want to delete the epilogue?',
                                                            type: 'warning',
                                                            buttons: [
                                                                {
                                                                    text: 'Delete',
                                                                    style: 'destructive',
                                                                    onPress: async () => {
                                                                        try {
                                                                            await updateDoc(doc(db, 'novels', novel.id), {
                                                                                epilogue: deleteField(),
                                                                                status: 'ongoing',
                                                                            });

                                                                            // Update local state
                                                                            setNovel(prev => {
                                                                                const next = { ...prev };
                                                                                delete next.epilogue;
                                                                                next.status = 'ongoing';
                                                                                return next;
                                                                            });

                                                                            // Invalidate novel and epilogue cache
                                                                            await invalidateCache(`novel_${novel.id}`);
                                                                            await invalidateCache(`chapter_${novel.id}_epilogue`);
                                                                            await invalidateByPrefix("home_");
                                                                            await invalidateByPrefix("browse_");
                                                                            await invalidateByPrefix("profile_");

                                                                            showToast({ message: 'Epilogue deleted!', type: 'success' });
                                                                        } catch (error) {
                                                                            console.error('Error deleting epilogue:', error);
                                                                            showToast({ message: 'Failed to delete epilogue', type: 'error' });
                                                                        }
                                                                    },
                                                                },
                                                                { text: 'Cancel', style: 'cancel' },
                                                            ]
                                                        });
                                                    },
                                                },
                                                { text: 'Cancel', style: 'cancel' },
                                            ]
                                        });
                                    }
                                }}
                            >
                                <View style={styles.chapterInfo}>
                                    <View style={styles.chapterIconContainer}>
                                        <Text style={styles.chapterIcon}>🌇</Text>
                                    </View>
                                    <View style={styles.chapterTextContainer}>
                                        <Text style={styles.chapterTitle}>Epilogue</Text>
                                        <Text style={styles.chapterSubtitle}>The conclusion</Text>
                                    </View>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const getStyles = (themeColors: any) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: themeColors.background,
    },
    container: {
        flex: 1,
    },
    header: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: themeColors.border,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold' as const,
        color: themeColors.text,
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: themeColors.textSecondary,
    },
    longPressHint: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        marginTop: 12,
        padding: 8,
        backgroundColor: themeColors.primary + '10',
        borderRadius: 8,
        gap: 6,
    },
    longPressHintText: {
        fontSize: 12,
        color: themeColors.textSecondary,
        fontWeight: '500' as const,
    },
    chaptersList: {
        padding: 16,
    },
    chapterItem: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: themeColors.surface,
        borderRadius: 12,
        marginBottom: 12,
    },
    chapterInfo: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        flex: 1,
        gap: 12,
    },
    chapterIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: themeColors.card,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    chapterIcon: {
        fontSize: 24,
    },
    chapterNumberContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: themeColors.primary,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    chapterNumber: {
        fontSize: 18,
        fontWeight: 'bold' as const,
        color: '#fff',
    },
    chapterTextContainer: {
        flex: 1,
    },
    chapterTitle: {
        fontSize: 16,
        fontWeight: '600' as const,
        color: themeColors.text,
        marginBottom: 4,
    },
    chapterSubtitle: {
        fontSize: 13,
        color: themeColors.textSecondary,
    },
    manageCharactersButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: themeColors.primary + '15',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    manageCharactersButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: themeColors.primary,
    },
});

export default ChaptersListScreen;