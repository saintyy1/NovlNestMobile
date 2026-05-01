import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  DeviceEventEmitter,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  withTiming,
  useSharedValue
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../contexts/AlertContext';
import { spacing } from '../../theme';
import ChapterBlockEditor from '../../components/ChapterBlockEditor';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase/config';
import { compressImage } from '../../utils/imageUtils';

interface ChapterEditorScreenProps {
  navigation: any;
  route: any;
}

export const ChapterEditorScreen: React.FC<ChapterEditorScreenProps> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { showToast } = useAlert();
  const insets = useSafeAreaInsets();
  const { chapterNumber, initialTitle = '', initialContent = '', onSave, onAutoSave } = route.params;

  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isDistractionFree, setIsDistractionFree] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Animation values for Zen Mode transition
  const zenProgress = useSharedValue(0);

  React.useEffect(() => {
    zenProgress.value = withTiming(isDistractionFree ? 1 : 0, { duration: 400 });
  }, [isDistractionFree]);

  React.useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('draftSaveStatus', (status) => {
      setSaveStatus(status);
    });
    return () => subscription.remove();
  }, []);

  const words = content.trim().split(/\s+/).filter((w: string) => w).length;
  const styles = getStyles(colors, insets);

  React.useEffect(() => {
    // Only auto-save if something has actually changed from initial load
    if (title !== initialTitle || content !== initialContent) {
      const timer = setTimeout(() => {
        if (onAutoSave) {
          onAutoSave({ title: title.trim(), content: content.trim() });
        }
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [title, content, initialTitle, initialContent, onAutoSave]);

  const handleSave = async () => {
    if (!title.trim()) {
      showToast({ message: 'Please enter a chapter title', type: 'error' });
      return;
    }
    if (!content.trim()) {
      showToast({ message: 'Please write some content for your chapter', type: 'error' });
      return;
    }

    try {
      setIsUploading(true);

      const { novelId, chapterIdx, novel } = route.params;

      if (novelId && novel && chapterIdx !== undefined) {
        const newChapterData = {
          title: title.trim(),
          content: content.trim(),
          updatedAt: new Date().toISOString(),
        };

        const { doc, updateDoc, setDoc } = require('firebase/firestore');
        const { db } = require('../../firebase/config');

        // Update main novel document (metadata only)
        await updateDoc(doc(db, 'novels', novelId), {
          updatedAt: new Date().toISOString(),
        });

        // 🚨 SYNC: Update sub-collection document (Reader)
        const chapterDocRef = doc(db, 'novels', novelId, 'chapters', chapterIdx.toString());
        await setDoc(chapterDocRef, newChapterData, { merge: true });

        const { invalidateCache } = require('../../utils/cache');
        await invalidateCache(`novel_${novelId}`);
        await invalidateCache(`chapter_${novelId}_${chapterIdx}`);
      }

      if (onSave) {
        await onSave({ title: title.trim(), content: content.trim() });
      }
      navigation.goBack();
    } catch (err) {
      console.error('Error saving in editor:', err);
      showToast({ message: 'Failed to save chapter to database.', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    // Pre-request permissions to avoid delay when clicking the image button
    ImagePicker.requestMediaLibraryPermissionsAsync();
  }, []);

  const handleUploadImage = async (): Promise<string | null> => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });

      if (result.canceled) return null;

      setIsUploading(true);
      const { uri } = result.assets[0];
      const compressedUri = await compressImage(uri, 1200, 0.7);

      const response = await fetch(compressedUri);
      const blob = await response.blob();

      const fileName = `manuscript_${Date.now()}.jpg`;
      const imageRef = ref(storage, `manuscript_images/${fileName}`);

      await uploadBytes(imageRef, blob);
      const url = await getDownloadURL(imageRef);
      setIsUploading(false);
      return url;
    } catch (error) {
      console.error('Error uploading image:', error);
      showToast({ message: 'Failed to upload image', type: 'error' });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false, // Using custom header for Zen Flow
    });
  }, [navigation]);

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isDistractionFree ? 0 : 1, { duration: 300 }),
    transform: [{ translateY: withTiming(isDistractionFree ? -100 : 0, { duration: 400 }) }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Custom Premium Header */}
      {!isDistractionFree && (
        <Animated.View style={[styles.customHeader, headerAnimatedStyle]}>
          <View style={[styles.headerInsets, { paddingTop: insets.top }]}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>

            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitleText}>Chapter {chapterNumber}</Text>
              {saveStatus && <Text style={styles.headerSaveStatus}>{saveStatus}</Text>}
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setIsDistractionFree(true)}
                style={styles.headerIcon}
              >
                <Ionicons name="expand-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={[styles.headerIcon, styles.saveButtonHeader]}
              >
                {isUploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="checkmark" size={24} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ChapterBlockEditor
          content={content}
          onChangeContent={setContent}
          onUploadImage={handleUploadImage}
          isDistractionFree={isDistractionFree}
          autoSaveStatus={saveStatus || undefined}
          wordCount={words}
          onExitDistractionFree={() => setIsDistractionFree(false)}
          header={!isDistractionFree ? (
            <>
              <View style={styles.manuscriptHeader}>
                <TextInput
                  style={styles.manuscriptTitleInput}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Untitled Chapter"
                  placeholderTextColor={colors.textSecondary + '60'}
                  multiline
                  keyboardAppearance="dark"
                  cursorColor={colors.primary}
                  selectionColor={colors.primary + '40'}
                />
                <View style={styles.titleUnderline} />
              </View>
            </>
          ) : null}
        />
      </KeyboardAvoidingView>
    </View>
  );
};

const getStyles = (colors: any, insets: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  customHeader: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '20',
    zIndex: 100,
  },
  headerInsets: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.md,
    height: 60 + insets.top,
    paddingBottom: 10,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center' as const,
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: colors.text,
    letterSpacing: -0.5,
  },
  headerSaveStatus: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '700' as const,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  saveButtonHeader: {
    backgroundColor: colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100 + insets.bottom,
  },
  manuscriptHeader: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  manuscriptTitleInput: {
    fontSize: 32,
    fontWeight: '800' as const,
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    padding: 0,
    letterSpacing: -1,
  },
  titleUnderline: {
    height: 4,
    width: 40,
    backgroundColor: colors.primary + '30',
    marginTop: spacing.sm,
    borderRadius: 2,
  },
  minimalToolbar: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface + '60',
    borderRadius: 15,
    padding: 4,
    marginBottom: spacing.lg,
  },
  blockContainer: {
    flex: 1,
  },
  fullScreenEditor: {
    flex: 1,
  },
});

export default ChapterEditorScreen;
