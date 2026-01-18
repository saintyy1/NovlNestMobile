// src/screens/main/ChaptersListScreen.tsx
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../../firebase/config';
import { Ionicons } from '@expo/vector-icons';
import type { Novel } from '../../types/novel';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
    doc,
    getDoc,
    updateDoc,
} from 'firebase/firestore';
import { get } from 'react-native/Libraries/TurboModule/TurboModuleRegistry';

interface Chapter {
    title: string;
    content: string;
}

const ChaptersListScreen = ({ route, navigation }: any) => {
    const { novel } = route.params;
    const { currentUser } = useAuth();
    const { colors } = useTheme();

    const styles = getStyles(colors);

    const getTotalParts = () => {
        return (
            (novel.authorsNote ? 1 : 0) +
            (novel.prologue ? 1 : 0) +
            (novel.chapters?.length || 0) +
            (novel.epilogue ? 1 : 0)
        );
    };

    const getChapterNumber = (type: string, index?: number) => {
        let chapterNum = 0;

        if (type === 'authorsNote') return 0;

        if (type === 'prologue') {
            return (novel.authorsNote ? 1 : 0);
        }

        if (type === 'chapter' && index !== undefined) {
            return (novel.authorsNote ? 1 : 0) + (novel.prologue ? 1 : 0) + index;
        }

        if (type === 'epilogue') {
            return (novel.authorsNote ? 1 : 0) +
                (novel.prologue ? 1 : 0) +
                (novel.chapters?.length || 0);
        }

        return chapterNum;
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
            <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <Text style={styles.title}>Table of Contents</Text>
                    <Text style={styles.subtitle}>{getTotalParts()} parts</Text>
                </View>

                <View style={styles.chaptersList}>
                    {/* Author's Note */}
                    {novel.authorsNote && (
                        <TouchableOpacity
                            style={styles.chapterItem}
                            onPress={() => {
                                navigation.goBack();
                                navigation.navigate('NovelReader', {
                                    novelId: novel.id,
                                    chapterNumber: getChapterNumber('authorsNote'),
                                });
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
                                navigation.goBack();
                                navigation.navigate('NovelReader', {
                                    novelId: novel.id,
                                    chapterNumber: getChapterNumber('prologue'),
                                });
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

                    {/* Regular Chapters */}
                    {novel.chapters?.map((chapter: Chapter, index: number) => (
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
                                    Alert.alert(
                                        chapter.title,
                                        'Choose an action',
                                        [
                                            {
                                                text: 'Edit Chapter',
                                                onPress: () =>
                                                    navigation.navigate('EditChapter', {
                                                        novelId: novel.id,
                                                        chapterIndex: index,
                                                    }),
                                            },
                                            {
                                                text: 'Delete Chapter',
                                                style: 'destructive',
                                                onPress: () => {
                                                    Alert.alert(
                                                        'Confirm Deletion',
                                                        'Are you sure you want to delete this chapter? This action cannot be undone.',
                                                        [
                                                            {
                                                                text: 'Delete',
                                                                style: 'destructive',
                                                                onPress: async () => {
                                                                    try {
                                                                        const novelRef = doc(db, 'novels', novel.id);
                                                                        const novelDoc = await getDoc(novelRef);
                                                                        if (novelDoc.exists()) {
                                                                            const novelData = novelDoc.data() as Novel;
                                                                            const updatedChapters = [...(novelData.chapters || [])];
                                                                            updatedChapters.splice(index, 1);
                                                                            await updateDoc(novelRef, { chapters: updatedChapters });
                                                                            Alert.alert('Success', 'Chapter deleted successfully!');
                                                                        }
                                                                    } catch (error) {
                                                                        console.error('Error deleting chapter:', error);
                                                                        Alert.alert('Error', 'Failed to delete chapter. Please try again.');
                                                                    }
                                                                },
                                                            },
                                                            { text: 'Cancel', style: 'cancel' },
                                                        ]
                                                    );
                                                },
                                            },
                                            { text: 'Cancel', style: 'cancel' },
                                        ]
                                    );
                                }
                            }}
                        >
                            <View style={styles.chapterInfo}>
                                <View style={styles.chapterNumberContainer}>
                                    <Text style={styles.chapterNumber}>{index + 1}</Text>
                                </View>
                                <View style={styles.chapterTextContainer}>
                                    <Text style={styles.chapterTitle}>{chapter.title}</Text>
                                    <Text style={styles.chapterSubtitle}>Chapter {index + 1}</Text>
                                </View>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                        </TouchableOpacity>
                    ))}

                    {/* Epilogue */}
                    {novel.epilogue && (
                        <TouchableOpacity
                            style={styles.chapterItem}
                            onPress={() => {
                                navigation.goBack();
                                navigation.navigate('NovelReader', {
                                    novelId: novel.id,
                                    chapterNumber: getChapterNumber('epilogue'),
                                });
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
});

export default ChaptersListScreen;