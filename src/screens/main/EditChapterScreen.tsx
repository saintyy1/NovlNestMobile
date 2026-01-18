// src/screens/main/EditChapterScreen.tsx
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
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing } from '../../theme';

interface Novel {
  id: string;
  title: string;
  authorName: string;
  authorId: string;
  coverImage?: string;
  chapters: Chapter[];
}

interface Chapter {
  title: string;
  content: string;
}

const EditChapterScreen = ({ route, navigation }: any) => {
  const { novelId, chapterIndex } = route.params;
  const { currentUser } = useAuth();
  const { colors } = useTheme();

  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [originalChapter, setOriginalChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const chapterIdx = chapterIndex ? Number(chapterIndex) : 0;

  useEffect(() => {
    fetchNovelAndChapter();
  }, [novelId, chapterIndex, currentUser]);

  // Check for changes
  useEffect(() => {
    if (chapter && originalChapter) {
      const titleChanged = chapter.title !== originalChapter.title;
      const contentChanged = chapter.content !== originalChapter.content;
      setHasChanges(titleChanged || contentChanged);
    }
  }, [chapter, originalChapter]);

  const fetchNovelAndChapter = async () => {
    if (!novelId || chapterIndex === undefined) {
      setError('Novel ID and chapter index are required');
      setLoading(false);
      return;
    }

    if (!currentUser) {
      setError('You must be logged in to edit chapters');
      setLoading(false);
      return;
    }

    try {
      const novelDoc = await getDoc(doc(db, 'novels', novelId));
      if (novelDoc.exists()) {
        const novelData = { id: novelDoc.id, ...novelDoc.data() } as Novel;

        // Check if current user is the author
        if (novelData.authorId !== currentUser.uid) {
          setError('You are not authorized to edit chapters of this novel.');
          setLoading(false);
          return;
        }

        // Check if chapter index is valid
        if (chapterIdx < 0 || chapterIdx >= novelData.chapters.length) {
          setError('Chapter not found.');
          setLoading(false);
          return;
        }

        const chapterData = novelData.chapters[chapterIdx];
        setNovel(novelData);
        setChapter({ ...chapterData });
        setOriginalChapter({ ...chapterData });
      } else {
        setError('Novel not found.');
      }
    } catch (err) {
      console.error('Error fetching novel:', err);
      setError('Failed to load novel and chapter.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!novelId || !novel || !chapter) return;

    // Validate input
    if (!chapter.title.trim()) {
      Alert.alert('Error', 'Chapter title is required.');
      return;
    }

    if (!chapter.content.trim()) {
      Alert.alert('Error', 'Chapter content is required.');
      return;
    }

    if (!hasChanges) {
      Alert.alert('Info', 'No changes to save.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      // Create updated chapters array
      const updatedChapters = [...novel.chapters];
      updatedChapters[chapterIdx] = {
        title: chapter.title.trim(),
        content: chapter.content.trim(),
      };

      // Update the novel with modified chapter
      await updateDoc(doc(db, 'novels', novelId), {
        chapters: updatedChapters,
        updatedAt: new Date().toISOString(),
      });

      // Update local state
      setOriginalChapter({ ...chapter });
      setHasChanges(false);

      Alert.alert('Success', 'Chapter updated successfully!', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (err) {
      console.error('Error updating chapter:', err);
      Alert.alert('Error', 'Failed to update chapter. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Are you sure you want to leave without saving?',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
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
          <Text style={styles.loadingText}>Loading chapter...</Text>
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
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Edit Chapter</Text>
            <Text style={styles.headerSubtitle}>
              Chapter {chapterIdx + 1} of "{novel?.title}"
            </Text>
          </View>
        </View>
        {hasChanges && (
          <View style={styles.unsavedBadge}>
            <Ionicons name="alert-circle" size={16} color="#F59E0B" />
            <Text style={styles.unsavedText}>Unsaved</Text>
          </View>
        )}
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
                Total chapters: {novel?.chapters?.length || 0}
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

        {/* Chapter Card - Tap to Edit */}
        {chapter && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Chapter Content</Text>
            </View>

            <TouchableOpacity
              style={styles.chapterCard}
              onPress={() => {
                navigation.navigate('ChapterEditor', {
                  chapterNumber: chapterIdx + 1,
                  initialTitle: chapter.title,
                  initialContent: chapter.content,
                  onSave: (updatedChapter: { title: string; content: string }) => {
                    setChapter({
                      title: updatedChapter.title,
                      content: updatedChapter.content,
                    });
                  }
                });
              }}
              activeOpacity={0.7}
            >
              <View style={styles.chapterHeader}>
                <View style={styles.chapterTitleRow}>
                  <Text style={styles.chapterNumber}>Chapter {chapterIdx + 1}</Text>
                  <Ionicons name="create-outline" size={16} color={colors.primary} />
                </View>
              </View>
              
              <Text style={styles.chapterTitleText} numberOfLines={2}>
                {chapter.title || `Chapter ${chapterIdx + 1} (Untitled)`}
              </Text>
              
              <Text style={styles.chapterPreview} numberOfLines={5}>
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

              <View style={styles.tapToEditHint}>
                <Ionicons name="hand-left-outline" size={16} color={colors.primary} />
                <Text style={styles.tapToEditText}>Tap to edit in full-screen editor</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Floating Save Button */}
      <View style={styles.floatingButtonContainer}>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.saveButton,
              (saving || !hasChanges) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            activeOpacity={0.8}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.saveButtonText}>Saving...</Text>
              </>
            ) : (
              <>
                <Ionicons name="save" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  unsavedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  unsavedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
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
  sectionHeader: {
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
  chapterCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
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
  tapToEditHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tapToEditText: {
    fontSize: 13,
    color: colors.primary,
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
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
});

export default EditChapterScreen;
