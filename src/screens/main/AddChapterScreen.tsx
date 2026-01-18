// src/screens/main/AddChaptersScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  collection,
  query,
  where,
  getDocs,
  addDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Novel } from '../../types/novel';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing } from '../../theme';

interface Chapter {
  title: string;
  content: string;
}

const AddChaptersScreen = ({ route, navigation }: any) => {
  const { novelId } = route.params;
  const { currentUser } = useAuth();
  const { colors } = useTheme();

  const [novel, setNovel] = useState<Novel | null>(null);
  const [newChapters, setNewChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchNovel();
  }, [novelId, currentUser]);

  const fetchNovel = async () => {
    if (!novelId) {
      setError('Novel ID is required');
      setLoading(false);
      return;
    }
    if (!currentUser) {
      setError('You must be logged in to add chapters');
      setLoading(false);
      return;
    }

    try {
      const novelDoc = await getDoc(doc(db, 'novels', novelId));
      if (novelDoc.exists()) {
        const novelData = { id: novelDoc.id, ...novelDoc.data() } as Novel;
        
        // Check if current user is the author
        if (novelData.authorId !== currentUser.uid) {
          setError('You are not authorized to add chapters to this novel.');
          setLoading(false);
          return;
        }
        
        setNovel(novelData);
      } else {
        setError('Novel not found.');
      }
    } catch (err) {
      console.error('Error fetching novel:', err);
      setError('Failed to load novel.');
    } finally {
      setLoading(false);
    }
  };

  const getChapterNumber = (index: number) => {
    return (novel?.chapters?.length || 0) + index + 1;
  };

  const removeChapter = (index: number) => {
    Alert.alert(
      'Remove Chapter',
      'Are you sure you want to remove this chapter?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const updatedChapters = [...newChapters];
            updatedChapters.splice(index, 1);
            setNewChapters(updatedChapters);
          },
        },
      ]
    );
  };

  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
  };

  const handleSubmit = async () => {
    if (!novelId || !novel) return;

    // Validate chapters
    const validChapters = newChapters.filter(
      (chapter) => chapter.title.trim() && chapter.content.trim()
    );
    
    if (validChapters.length === 0) {
      Alert.alert('Error', 'Please add at least one chapter with both title and content.');
      return;
    }
    
    if (validChapters.length !== newChapters.length) {
      Alert.alert('Error', 'All chapters must have both title and content.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      // Update the novel with new chapters
      await updateDoc(doc(db, 'novels', novelId), {
        chapters: arrayUnion(...validChapters),
        updatedAt: new Date().toISOString(),
      });

      try {
        // Find all users who have this novel in their library
        const usersQuery = query(
          collection(db, 'users'),
          where('library', 'array-contains', novelId)
        );
        const usersSnapshot = await getDocs(usersQuery);

        // Create notifications for each user who has the novel in their library
        const notificationPromises = usersSnapshot.docs.map(async (userDoc) => {
          const userId = userDoc.id;
          // Don't notify the author themselves
          if (userId !== currentUser?.uid) {
            await addDoc(collection(db, 'notifications'), {
              toUserId: userId,
              fromUserId: currentUser?.uid,
              fromUserName: currentUser?.displayName || 'Author',
              type: 'new_chapter',
              novelId: novelId,
              novelTitle: novel.title,
              chapterCount: validChapters.length,
              chapterTitles: validChapters.map((chapter) => chapter.title),
              createdAt: new Date().toISOString(),
              read: false,
            });
          }
        });

        await Promise.all(notificationPromises);
        console.log(`Sent new chapter notifications to ${usersSnapshot.docs.length} users`);
      } catch (notificationError) {
        console.error('Error sending chapter notifications:', notificationError);
        // Don't fail the entire operation if notifications fail
      }

      Alert.alert(
        'Success',
        `Successfully added ${validChapters.length} new chapter(s)!`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );

      // Reset form
      setNewChapters([]);
    } catch (err) {
      console.error('Error adding chapters:', err);
      setError('Failed to add chapters. Please try again.');
      Alert.alert('Error', 'Failed to add chapters. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getFirebaseDownloadUrl = (url: string) => {
    if (!url || !url.includes('firebasestorage')) {
      return url;
    }

    try {
      const urlParts = url.split('/');
      const bucketName = urlParts[3];
      const filePath = urlParts.slice(4).join('/');
      return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media`;
    } catch (error) {
      console.log('Error converting Firebase URL:', error);
      return url;
    }
  };

  const styles = getStyles(colors);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading novel...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !novel) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={60} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Add Chapters</Text>
          <Text style={styles.headerSubtitle}>{novel?.title}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Novel Info Card */}
        <View style={styles.novelCard}>
          <View style={styles.novelInfo}>
            {novel?.coverImage && (
              <Image
                source={{ uri: getFirebaseDownloadUrl(novel.coverImage) }}
                style={styles.coverImage}
              />
            )}
            <View style={styles.novelDetails}>
              <Text style={styles.novelTitle} numberOfLines={2}>
                {novel?.title}
              </Text>
              <Text style={styles.novelAuthor}>By {novel?.authorName}</Text>
              <Text style={styles.novelChapters}>
                Current chapters: {novel?.chapters?.length || 0}
              </Text>
            </View>
          </View>
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorMessage}>
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
            <Text style={styles.errorMessageText}>{error}</Text>
          </View>
        )}

        {/* Chapters Section */}
        <View style={styles.section}>
          <View style={styles.chaptersHeader}>
            <Text style={styles.sectionTitle}>New Chapters</Text>
            <TouchableOpacity 
              style={styles.addButton} 
              onPress={() => {
                const chapterNumber = getChapterNumber(newChapters.length);
                navigation.navigate('ChapterEditor', {
                  chapterNumber,
                  initialTitle: '',
                  initialContent: '',
                  onSave: (newChapter: { title: string; content: string }) => {
                    setNewChapters([...newChapters, {
                      title: newChapter.title,
                      content: newChapter.content,
                    }]);
                  }
                });
              }}
            >
              <Ionicons name="add-circle" size={20} color={colors.primary} />
              <Text style={styles.addButtonText}>Add Chapter</Text>
            </TouchableOpacity>
          </View>

          {newChapters.length === 0 ? (
            <View style={styles.emptyChapters}>
              <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyChaptersText}>No chapters added yet</Text>
              <Text style={styles.emptyChaptersSubtext}>
                Tap "Add Chapter" to start writing your new chapter
              </Text>
            </View>
          ) : (
            newChapters.map((chapter, index) => (
              <TouchableOpacity
                key={index}
                style={styles.chapterCard}
                onPress={() => {
                  navigation.navigate('ChapterEditor', {
                    chapterNumber: getChapterNumber(index),
                    initialTitle: chapter.title,
                    initialContent: chapter.content,
                    onSave: (updatedChapter: { title: string; content: string }) => {
                      const updatedChapters = [...newChapters];
                      updatedChapters[index] = {
                        title: updatedChapter.title,
                        content: updatedChapter.content,
                      };
                      setNewChapters(updatedChapters);
                    }
                  });
                }}
                activeOpacity={0.7}
              >
                <View style={styles.chapterHeader}>
                  <View style={styles.chapterTitleRow}>
                    <Text style={styles.chapterNumber}>Chapter {getChapterNumber(index)}</Text>
                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                  </View>
                  <TouchableOpacity 
                    onPress={() => removeChapter(index)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
                
                <Text style={styles.chapterTitleText} numberOfLines={2}>
                  {chapter.title || `Chapter ${getChapterNumber(index)} (Untitled)`}
                </Text>
                
                <Text style={styles.chapterPreview} numberOfLines={3}>
                  {chapter.content || 'No content yet. Tap to edit.'}
                </Text>

                <View style={styles.chapterStats}>
                  <View style={styles.statItem}>
                    <Ionicons name="text-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.chapterStatText}>{chapter.content.length} chars</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="document-text-outline" size={12} color={colors.textSecondary} />
                    <Text style={styles.chapterStatText}>
                      {getWordCount(chapter.content)} words
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Floating Submit Button */}
      {newChapters.length > 0 && (
        <View style={styles.floatingButtonContainer}>
          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.8}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.submitButtonText}>Adding Chapters...</Text>
              </>
            ) : (
              <>
                <Ionicons name="cloud-upload" size={20} color="#fff" />
                <Text style={styles.submitButtonText}>
                  Add {newChapters.length} Chapter{newChapters.length > 1 ? 's' : ''}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: colors.text,
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  headerButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  novelCard: {
    backgroundColor: colors.card,
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  novelInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  coverImage: {
    width: 60,
    height: 84,
    borderRadius: 8,
  },
  novelDetails: {
    flex: 1,
  },
  novelTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  novelAuthor: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  novelChapters: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  errorMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: 8,
    gap: 8,
  },
  errorMessageText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  section: {
    marginHorizontal: spacing.lg,
  },
  chaptersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
  },
  addButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  emptyChapters: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.sm,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyChaptersText: {
    fontSize: 16,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  emptyChaptersSubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  chapterCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  chapterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  chapterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chapterNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chapterTitleText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  chapterPreview: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  chapterStats: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chapterStatText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  bottomSpacing: {
    height: spacing.xl,
  },
  floatingButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 17,
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

export default AddChaptersScreen;
