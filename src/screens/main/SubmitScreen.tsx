import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  KeyboardAvoidingView,
  Animated,
  Easing,
  DeviceEventEmitter,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import CachedImage from '../../components/CachedImage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { db, storage } from '../../firebase/config';
import { collection, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressForCover, generateSmallCover } from '../../utils/imageUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../contexts/AlertContext';
import { spacing } from '../../theme';
import { invalidateByPrefix } from '../../utils/cache';
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDrafts, saveDraft, deleteDraft, DraftData } from '../../utils/draftStorage';
import { useDraftAutoSave } from '../../hooks/useDraftAutoSave';
import { InlineChatEditor, type ChatMessage } from '../../components/InlineChatEditor';
import { trackContentCreate } from '../../utils/Analytics-utils';


type SubmitType = null | 'novel' | 'poem';

const NOVEL_GENRES = [
  'Fantasy', 'Sci-Fi', 'Romance', 'Mystery', 'Horror', 'Adventure',
  'Thriller', 'Historical Fiction', 'Comedy', 'Drama', 'Fiction', 'Dystopian', 'Dark Romance'
];

const POEM_GENRES = [
  'Romantic', 'Nature', 'Free Verse', 'Haiku', 'Sonnet', 'Epic',
  'Lyric', 'Narrative', 'Limerick', 'Ballad', 'Elegy', 'Ode'
];

interface Chapter {
  title: string;
  content: string;
  chatMessages?: ChatMessage[];
}

interface Character {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
}

export const SubmitScreen = () => {
  // Draft state
  const [draftId, setDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftData[]>([]);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const novelDraftsCount = drafts.filter(d => d.type === 'novel').length;
  const poemDraftsCount = drafts.filter(d => d.type === 'poem').length;
  const MAX_DRAFTS = 5;

  // Save is handled automatically
  const [showDraftsModal, setShowDraftsModal] = useState(false);
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const { showAlert, showToast } = useAlert();

  // Load drafts when current user changes
  useEffect(() => {
    getDrafts(currentUser?.uid).then(setDrafts);
  }, [currentUser?.uid]);

  const [submitType, setSubmitType] = useState<SubmitType>(null);

  // Common fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverAspectRatio, setCoverAspectRatio] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Novel-specific fields
  const [summary, setSummary] = useState('');
  const [authorsNote, setAuthorsNote] = useState('');
  const [prologue, setPrologue] = useState('');
  const [hasGraphicContent, setHasGraphicContent] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [chapterSelections, setChapterSelections] = useState<{ [key: number]: { start: number, end: number } }>({});
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfProcessing, setPdfProcessing] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);

  // Poem-specific fields
  const [content, setContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Wizard state for Novel
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5;

  // Animation states for step transitions
  const stepAnim = useRef(new Animated.Value(0)).current;
  const stepSlideVal = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Reset and trigger animation whenever step changes
    stepAnim.setValue(0);
    stepSlideVal.setValue(20);

    Animated.parallel([
      Animated.timing(stepAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(stepSlideVal, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      })
    ]).start();
  }, [currentStep]);

  const novelSteps = [
    { id: 1, title: 'Identity', icon: 'finger-print-outline' },
    { id: 2, title: 'Hook', icon: 'sparkles-outline' },
    { id: 3, title: 'Cast', icon: 'people-outline' },
    { id: 4, title: 'Manuscript', icon: 'book-outline' },
    { id: 5, title: 'Finalize', icon: 'checkmark-done-outline' },
  ];

  const canGoNext = () => {
    if (submitType === 'novel') {
      if (currentStep === 1) {
        return title.trim() !== '' && description.trim() !== '' && genres.length > 0;
      }
      if (currentStep === 2) {
        return summary.trim() !== '';
      }
      if (currentStep === 4) {
        // Allow moving past manuscript even if empty (validation is handled on submit)
        return true;
      }
    }
    return true;
  };

  const goToNextStep = () => {
    if (canGoNext()) {
      if (currentStep < totalSteps) {
        setCurrentStep(currentStep + 1);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    } else {
      showAlert({
        title: 'Incomplete',
        message: 'Please fill in all required fields to continue.',
        type: 'warning'
      });
    }
  };

  const goToPrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      setSubmitType(null);
    }
  };


  const renderStepIndicator = () => {
    if (submitType !== 'novel') return null;

    return (
      <View style={styles.stepIndicatorContainer}>
        {novelSteps.map((step, index) => (
          <React.Fragment key={step.id}>
            <TouchableOpacity
              style={styles.stepItem}
              onPress={() => {
                setCurrentStep(step.id);
                scrollRef.current?.scrollTo({ y: 0, animated: true });
              }}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.stepDot,
                  currentStep >= step.id && styles.stepDotActive,
                  currentStep > step.id && styles.stepDotCompleted,
                ]}
              >
                {currentStep > step.id ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : (
                  <Ionicons
                    name={step.icon as any}
                    size={14}
                    color={currentStep >= step.id ? '#fff' : colors.textSecondary}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  currentStep >= step.id && styles.stepLabelActive,
                ]}
              >
                {step.title}
              </Text>
            </TouchableOpacity>
            {index < novelSteps.length - 1 && (
              <View
                style={[
                  styles.stepLine,
                  currentStep > step.id && styles.stepLineActive,
                ]}
              />
            )}
          </React.Fragment>
        ))}
      </View>
    );
  };

  const draftData = submitType === 'novel' ? {
    title, description, summary, authorsNote, prologue, genres, coverImage, hasGraphicContent, chapters, characters
  } : {
    title, description, content, genres, coverImage
  };

  const { saveStatus } = useDraftAutoSave({
    draftId,
    setDraftId,
    submitType,
    currentUser,
    draftData
  });

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (saveStatus !== 'Saving...') {
        return;
      }

      e.preventDefault();

      showAlert({
        title: 'Saving in Progress',
        message: 'You have unsaved changes. Leave anyway?',
        type: 'warning',
        buttons: [
          { text: "Don't leave", style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ]
      });
    });

    return unsubscribe;
  }, [navigation, saveStatus, currentStep]);

  const styles = getStyles(colors);

  // Poem stats
  const lineCount = content.split('\n').length;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const stanzaCount = content.trim() ? content.split(/\n\s*\n/).filter(s => s.trim()).length : 0;

  const availableGenres = submitType === 'novel' ? NOVEL_GENRES : POEM_GENRES;

  const countSentences = (text: string): number => {
    const sentences = text.match(/[^.!?]+[.!?](?:\s|$)/g) || [];
    return sentences.length;
  };

  const handleDescriptionChange = (text: string) => {
    const sentences = countSentences(text);
    if (sentences > 1) {
      setError('Description must not exceed one sentence');
      return;
    }
    setError('');
    setDescription(text);
  };

  // Listen for reset param from back button
  useEffect(() => {
    const params = route.params as any;
    if (params?.resetSubmitType) {
      setSubmitType(null);
      setTimeout(() => {
        navigation.setParams({ resetSubmitType: undefined } as any);
      }, 100);
    }
  }, [route.params]);

  // Refetch drafts whenever the selection screen is shown (submitType is null)
  useEffect(() => {
    if (submitType === null && currentUser?.uid) {
      getDrafts(currentUser.uid).then(setDrafts);
    }
  }, [submitType, currentUser?.uid]);

  // Update header based on submit type
  useEffect(() => {
    const headerTitleStyle = {
      fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    };

    if (submitType === 'novel') {
      navigation.setOptions({ title: 'Write Novel', headerTitleStyle });
      navigation.setParams({ showBackButton: true } as any);
    } else if (submitType === 'poem') {
      navigation.setOptions({ title: 'Write Poem', headerTitleStyle });
      navigation.setParams({ showBackButton: true } as any);
    } else {
      navigation.setOptions({ title: 'Write', headerTitleStyle });
      navigation.setParams({ showBackButton: false } as any);
    }
  }, [submitType, navigation]);

  const handleGenreToggle = (genre: string) => {
    if (genres.includes(genre)) {
      setGenres(genres.filter(g => g !== genre));
    } else {
      setGenres([...genres, genre]);
    }
  };

  const handleImagePick = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      showAlert({
        title: 'Permission Required',
        message: 'Permission to access camera roll is required!',
        type: 'warning'
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false, // No cropping
      quality: 0.8,
    });

    if (!result.canceled) {
      const { uri, width, height } = result.assets[0];
      setCoverImage(uri);
      setCoverAspectRatio(width / height);
    }
  };

  const removeChapter = (index: number) => {
    const newChapters = [...chapters];
    newChapters.splice(index, 1);
    setChapters(newChapters);
  };

  const handlePdfImport = async () => {
    try {
      setUploadingPdf(true);
      setParseError('');

      // Pick PDF file
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setUploadingPdf(false);
        return;
      }

      const file = result.assets[0];
      setPdfFileName(file.name);

      setPdfProcessing(true);
      setUploadingPdf(false);

      // Send PDF to backend for processing
      const formData = new FormData();

      // React Native requires this specific format for file uploads
      const fileToUpload: any = {
        uri: Platform.OS === 'android' ? file.uri : file.uri.replace('file://', ''),
        type: 'application/pdf',
        name: file.name,
      };

      formData.append('pdf', fileToUpload);

      const BACKEND_URL = 'https://novlnest-pdf-parser.vercel.app';

      console.log('Uploading to:', `${BACKEND_URL}/api/process-pdf`);

      const response = await fetch(`${BACKEND_URL}/api/process-pdf`, {
        method: 'POST',
        headers: {
          'X-API-KEY': process.env.EXPO_PUBLIC_CRON_SECRET || '',
        },
        body: formData,
        // Don't set Content-Type - let the browser/RN set it automatically with boundary
      });

      // Log response for debugging
      const responseText = await response.text();
      console.log('Raw response:', responseText.substring(0, 200));

      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          throw new Error(`Server error: ${response.status} - ${responseText.substring(0, 100)}`);
        }
        throw new Error(errorData.error || 'Failed to process PDF');
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error. Response:', responseText);
        throw new Error('Invalid response from server. Please check backend logs.');
      }

      if (data.success && data.chapters) {
        // Map the returned chapters to our format
        const importedChapters: Chapter[] = data.chapters.map((ch: any) => ({
          title: ch.title || 'Untitled Chapter',
          content: ch.content || '',
          chatMessages: [],
        }));

        setChapters(importedChapters);
        setPdfProcessing(false);
        setPdfFileName(file.name);
        showToast({
          message: `Imported ${importedChapters.length} chapter(s) from PDF`,
          type: 'success'
        });
      } else {
        throw new Error(data.error || 'Failed to process PDF');
      }
    } catch (error: any) {
      console.error('PDF import error:', error);
      setUploadingPdf(false);
      setPdfProcessing(false);

      let errorMessage = 'Failed to import PDF. ';

      if (error.message?.includes('Network request failed')) {
        errorMessage += 'Cannot connect to backend server. Make sure it is running.';
      } else if (error.message?.includes('timeout')) {
        errorMessage += 'Processing took too long. Try a smaller PDF.';
      } else {
        errorMessage += error.message || 'Please try again or add chapters manually.';
      }

      setParseError(errorMessage);
      showAlert({
        title: 'Import Failed',
        message: errorMessage,
        type: 'error'
      });
    }
  };

  const startNewWork = (type: Exclude<SubmitType, null>) => {
    // clear any draft selection and reset form fields for a fresh start
    setDraftId(null);
    setTitle('');
    setDescription('');
    setGenres([]);
    setCoverImage(null);
    setSummary('');
    setAuthorsNote('');
    setPrologue('');
    setHasGraphicContent(false);
    setChapters([]);
    setCharacters([]);
    setContent('');
    setShowDraftsModal(false);
    setSubmitType(type);
    setCurrentStep(1);
  };

  const handleSubmit = async () => {
    if (genres.length === 0) {
      setError('Please select at least one genre');
      return;
    }

    if (submitType === 'novel') {
      const hasChapters = chapters.length > 0 && chapters.some(ch => ch.content.trim());
      const hasAuthorsNote = authorsNote.trim().length > 0;
      const hasPrologue = prologue.trim().length > 0;

      if (!hasChapters && !hasAuthorsNote && !hasPrologue) {
        setError('Please add at least one chapter, author\'s note, or prologue');
        return;
      }

      if (chapters.some(ch => ch.title.trim() === '' || ch.content.trim() === '')) {
        setError('All chapters must have a title and content');
        return;
      }
    } else if (submitType === 'poem') {
      if (!content.trim()) {
        setError('Please write your poem content');
        return;
      }
    }

    try {
      setLoading(true);
      setError('');

      let coverUrl = null;
      let coverSmallUrl = null;

      const collectionName = submitType === 'novel' ? 'novels' : 'poems';
      const docRef = doc(collection(db, collectionName));

      // Handle image upload if exists
      if (coverImage) {
        try {
          const storageFolder = submitType === 'novel' ? 'covers-large' : 'poem-covers-large';
          const storageSmallFolder = submitType === 'novel' ? 'covers-small' : 'poem-covers-small';

          const coverRef = ref(storage, `${storageFolder}/${docRef.id}.jpg`);
          const coverSmallRef = ref(storage, `${storageSmallFolder}/${docRef.id}.jpg`);

          // Use the new intelligent compression utilities to generate separate blobs
          const [{ blob: largeBlob }, { blob: smallBlob }] = await Promise.all([
            compressForCover(coverImage),
            generateSmallCover(coverImage)
          ]);

          await uploadBytes(coverRef, largeBlob);
          await uploadBytes(coverSmallRef, smallBlob);

          coverUrl = `https://storage.googleapis.com/novelnest-50ab1.firebasestorage.app/${storageFolder}/${docRef.id}.jpg`;
          coverSmallUrl = `https://storage.googleapis.com/novelnest-50ab1.firebasestorage.app/${storageSmallFolder}/${docRef.id}.jpg`;
        } catch (err) {
          console.error('Image upload failed:', err);
          setError('Failed to upload image');
          setLoading(false);
          return;
        }
      }
      let finalCharacters = characters;
      if (submitType === 'novel' && characters.length > 0) {
        try {
          finalCharacters = await Promise.all(
            characters.map(async (char) => {
              // If the image is already a network URL or doesn't exist, skip upload
              if (!char.imageUrl || char.imageUrl.startsWith('http')) {
                return char;
              }

              // Upload local image
              const response = await fetch(char.imageUrl);
              const blob = await response.blob();
              const charImageRef = ref(storage, `characters/${docRef.id}/${char.id}.jpg`);
              await uploadBytes(charImageRef, blob);
              const downloadUrl = await getDownloadURL(charImageRef);

              return { ...char, imageUrl: downloadUrl };
            })
          );
        } catch (charErr) {
          console.error('Error uploading character images:', charErr);
          // We continue with local URIs if upload fails, though they won't show for others
        }
      }

      if (submitType === 'novel') {
        await setDoc(docRef, {
          title,
          description,
          summary,
          authorsNote: authorsNote || null,
          prologue: prologue || null,
          genres,
          hasGraphicContent,
          chapters,
          characters: finalCharacters,
          authorId: currentUser?.uid,
          authorName: currentUser?.displayName,
          isPromoted: false,
          published: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          coverImage: coverUrl || null,
          coverSmallImage: coverSmallUrl || null,
          status: "ongoing",
          likes: 0,
          views: 0,
          publicDomain: false,
        });

        // Track novel creation for analytics
        trackContentCreate({
          contentType: 'novel',
          contentId: docRef.id,
          title,
          genres,
          wordCount: chapters.reduce((acc, ch) => acc + ch.content.split(/\s+/).length, 0),
          userId: currentUser?.uid || '',
        });
      } else {
        await setDoc(docRef, {
          title,
          description,
          content,
          genres,
          poetId: currentUser?.uid,
          poetName: currentUser?.displayName,
          isPromoted: false,
          published: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          coverImage: coverUrl || null,
          coverSmallImage: coverSmallUrl || null,
          likes: 0,
          views: 0,
          publicDomain: false,
        });

        // Track poem creation for analytics
        trackContentCreate({
          contentType: 'poem',
          contentId: docRef.id,
          title,
          genres,
          wordCount: content.split(/\s+/).length,
          userId: currentUser?.uid || '',
        });
      }

      // Invalidate relevant prefixes to show the new content
      await invalidateByPrefix("profile_");
      await invalidateByPrefix("home_");
      await invalidateByPrefix("browse_");

      showAlert({
        title: 'Success',
        message: `Your ${submitType} has been submitted for review!`,
        type: 'success',
        buttons: [{
          text: 'OK',
          onPress: async () => {
            if (draftId) {
              await deleteDraft(draftId, currentUser?.uid);
              const updatedDrafts = await getDrafts(currentUser?.uid);
              setDrafts(updatedDrafts);
            }
            setSubmitType(null);
            setDraftId(null);
            // Reset form
            setTitle('');
            setDescription('');
            setGenres([]);
            setCoverImage(null);
            setSummary('');
            setAuthorsNote('');
            setPrologue('');
            setHasGraphicContent(false);
            setChapters([]);
            setCharacters([]);
            setContent('');
          }
        }]
      });

    } catch (error) {
      console.error('Error submitting:', error);
      setError(`Failed to submit ${submitType}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="log-in-outline" size={64} color={colors.textSecondary} />
        <Text style={styles.emptyTitle}>Please log in</Text>
        <Text style={styles.emptyText}>Log in to submit your work</Text>
      </View>
    );
  }

  // Selection screen
  if (submitType === null) {
    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.selectionContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Draft top card on selection screen */}
          {drafts && drafts.length > 0 && (() => {
            const sorted = [...drafts].sort((a, b) => {
              const ta = a.updatedAt || a.createdAt || '';
              const tb = b.updatedAt || b.createdAt || '';
              return tb.localeCompare(ta);
            });
            const latest = sorted[0];
            return (
              <TouchableOpacity
                key={latest.id}
                style={styles.selectionDraftCard}
                onPress={() => setShowDraftsModal(true)}
                onLongPress={async () => {
                  showAlert({
                    title: 'Delete Draft',
                    message: 'Delete this draft?',
                    type: 'warning',
                    buttons: [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          await deleteDraft(latest.id, currentUser?.uid);
                          setDrafts(await getDrafts(currentUser?.uid));
                        }
                      }
                    ]
                  });
                }}
              >
                <View style={styles.selectionDraftThumb}>
                  {latest.data.coverImage ? (
                    <CachedImage uri={latest.data.coverImage} style={styles.selectionDraftThumbImage} />
                  ) : (
                    <View style={[styles.selectionDraftThumbImage, { backgroundColor: colors.primary + '22', justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ color: colors.primary, fontWeight: '800' }}>{(latest.data.title || 'R').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.selectionDraftContent}>
                  <Text style={[styles.selectionDraftSmall, { color: colors.textSecondary }]}>Continue writing</Text>
                  <Text style={[styles.selectionDraftTitle, { color: colors.text }]} numberOfLines={2}>{latest.data.title || 'Untitled'}</Text>
                  <Text style={[styles.selectionDraftMeta, { color: colors.textSecondary }]}>{sorted.length} draft{sorted.length !== 1 ? 's' : ''}</Text>
                </View>
              </TouchableOpacity>
            );
          })()}

          {/* Drafts list modal */}
          <Modal visible={showDraftsModal} animationType="slide" onRequestClose={() => setShowDraftsModal(false)}>
            <View
              style={[
                styles.modalContainer,
                {
                  backgroundColor: colors.surface,
                  paddingTop: insets.top,
                },
              ]}
            >
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Your Drafts</Text>
                <TouchableOpacity onPress={() => setShowDraftsModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ padding: spacing.lg }}>
                {drafts.length === 0 ? (
                  <Text style={{ color: colors.textSecondary }}>No drafts</Text>
                ) : (
                  drafts.map((d) => (
                    <View key={d.id} style={styles.draftListItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.draftListTitle, { color: colors.text }]} numberOfLines={1}>{d.data.title || '(Untitled)'}</Text>
                        <Text style={[styles.draftListMeta, { color: colors.textSecondary }]}>{d.type === 'novel' ? 'Novel Draft' : 'Poem Draft'} • {d.updatedAt ? new Date(d.updatedAt).toLocaleString() : ''}</Text>
                      </View>
                      <View style={styles.draftActionRow}>
                        <TouchableOpacity style={styles.draftActionButton} onPress={() => {
                          // Continue editing
                          setSubmitType(d.type);
                          setDraftId(d.id);
                          if (d.type === 'novel') {
                            setTitle(d.data.title || '');
                            setDescription(d.data.description || '');
                            setSummary(d.data.summary || '');
                            setAuthorsNote(d.data.authorsNote || '');
                            setPrologue(d.data.prologue || '');
                            setGenres(d.data.genres || []);
                            setCoverImage(d.data.coverImage || null);
                            setHasGraphicContent(!!d.data.hasGraphicContent);
                            setChapters(d.data.chapters || []);
                            setCharacters(d.data.characters || []);
                          } else {
                            setTitle(d.data.title || '');
                            setDescription(d.data.description || '');
                            setContent(d.data.content || '');
                            setGenres(d.data.genres || []);
                            setCoverImage(d.data.coverImage || null);
                          }
                          setCurrentStep(1); // Reset to first step on draft load
                          scrollRef.current?.scrollTo({ y: 0, animated: false });
                          setShowDraftsModal(false);
                        }}>
                          <Text style={[styles.draftActionText, { color: colors.primary }]}>Continue</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.draftActionButton} onPress={async () => { await deleteDraft(d.id, currentUser?.uid); setDrafts(await getDrafts(currentUser?.uid)); }}>
                          <Text style={[styles.draftActionText, { color: colors.error }]}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </Modal>
          {/* Header Section */}
          <View style={styles.selectionHeader}>
            <View style={styles.headerIconContainer}>
              <Ionicons name="create" size={40} color={colors.primary} />
            </View>
            <Text style={styles.selectionTitle}>Share Your Story</Text>
            <Text style={styles.selectionSubtitle}>
              Choose what you'd like to submit and inspire readers around the world
            </Text>
          </View>

          {/* Cards Section */}
          <View style={styles.cardsContainer}>
            {/* Novel Card */}
            <TouchableOpacity
              style={[
                styles.selectionCard,
                novelDraftsCount >= MAX_DRAFTS && styles.selectionCardLimit
              ]}
              onPress={() => startNewWork('novel')}
              activeOpacity={0.7}
            >
              <View style={styles.cardGradient}>
                <View style={styles.cardIconWrapper}>
                  <View style={[styles.cardIconContainer, { backgroundColor: colors.primary }]}>
                    <Ionicons name="book" size={32} color="#fff" />
                  </View>
                </View>

                <View style={styles.cardContent}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.cardTitle}>Novel</Text>
                    <Text style={[
                      styles.draftCounter,
                      novelDraftsCount >= MAX_DRAFTS && styles.draftCounterLimit
                    ]}>
                      Drafts {novelDraftsCount}/{MAX_DRAFTS}
                    </Text>
                  </View>
                  <Text style={styles.cardDescription}>
                    Share your full-length story with chapters, characters, and plot twists
                  </Text>
                </View>

                <View style={styles.cardFooter}>
                  <View style={styles.cardFeatures}>
                    <View style={styles.featureItem}>
                      <Ionicons name="layers-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.featureText}>Multiple chapters</Text>
                    </View>
                    <View style={styles.featureItem}>
                      <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.featureText}>Long-form content</Text>
                    </View>
                  </View>
                  <View style={styles.cardArrow}>
                    <Ionicons name="arrow-forward" size={20} color={colors.primary} />
                  </View>
                </View>
              </View>
            </TouchableOpacity>

            {/* Poem Card */}
            <TouchableOpacity
              style={[
                styles.selectionCard,
                poemDraftsCount >= MAX_DRAFTS && styles.selectionCardLimit
              ]}
              onPress={() => startNewWork('poem')}
              activeOpacity={0.7}
            >
              <View style={styles.cardGradient}>
                <View style={styles.cardIconWrapper}>
                  <View style={[styles.cardIconContainer, { backgroundColor: '#EC4899' }]}>
                    <Ionicons name="rose" size={32} color="#fff" />
                  </View>
                </View>

                <View style={styles.cardContent}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.cardTitle}>Poem</Text>
                    <Text style={[
                      styles.draftCounter,
                      poemDraftsCount >= MAX_DRAFTS && styles.draftCounterLimit
                    ]}>
                      Drafts {poemDraftsCount}/{MAX_DRAFTS}
                    </Text>
                  </View>
                  <Text style={styles.cardDescription}>
                    Express your emotions through beautiful verses and poetic lines
                  </Text>
                </View>

                <View style={styles.cardFooter}>
                  <View style={styles.cardFeatures}>
                    <View style={styles.featureItem}>
                      <Ionicons name="sparkles-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.featureText}>Creative verses</Text>
                    </View>
                    <View style={styles.featureItem}>
                      <Ionicons name="heart-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.featureText}>Emotional depth</Text>
                    </View>
                  </View>
                  <View style={styles.cardArrow}>
                    <Ionicons name="arrow-forward" size={20} color="#EC4899" />
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Bottom Info */}
          <View style={styles.bottomInfo}>
            <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.bottomInfoText}>
              All submissions are reviewed before being published
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Novel or Poem submission form
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderStepIndicator()}
        {/* Save Status Indicator */}
        {saveStatus && (
          <View style={styles.saveStatusContainer}>
            {saveStatus === 'Saving...' && <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginRight: 6 }} />}
            {saveStatus === 'Saved' && <Ionicons name="checkmark-circle" size={16} color={colors.primary} style={{ marginRight: 6 }} />}
            {saveStatus === 'Offline — saving locally' && <Ionicons name="cloud-offline" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />}
            <Text style={styles.saveStatusText}>{saveStatus}</Text>
          </View>
        )}

        {saveStatus === 'Limit reached — cannot save' && (
          <View style={styles.limitBanner}>
            <Ionicons name="warning" size={20} color={colors.error} />
            <Text style={styles.limitBannerText}>
              You’ve reached your draft limit. You can still publish this, but you can’t save new drafts. Delete an existing draft to continue.
            </Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Step-based Novel Flow */}
        {submitType === 'novel' && (
          <View style={styles.wizardContainer}>
            {/* Step 1: Identity */}
            {currentStep === 1 && (
              <Animated.View style={[styles.stepContent, { opacity: stepAnim, transform: [{ translateY: stepSlideVal }] }]}>
                <View style={styles.section}>
                  <Text style={styles.label}>Title *</Text>
                  <TextInput
                    style={styles.input}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Enter your novel title"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
                <View style={styles.section}>
                  <Text style={styles.label}>Description (one sentence) *</Text>
                  <TextInput
                    style={styles.input}
                    value={description}
                    onChangeText={handleDescriptionChange}
                    placeholder="Capture the essence in one line..."
                    placeholderTextColor={colors.textSecondary}
                  />
                  <Text style={styles.helperText}>
                    {countSentences(description)} of 1 sentence used
                  </Text>
                </View>
                <View style={styles.section}>
                  <Text style={styles.label}>Cover Image</Text>
                  <TouchableOpacity style={styles.imageButton} onPress={handleImagePick}>
                    <Ionicons name="image-outline" size={24} color={colors.primary} />
                    <Text style={styles.imageButtonText}>Choose Image</Text>
                  </TouchableOpacity>
                  {coverImage && (
                    <View style={styles.imagePreview}>
                      <CachedImage
                        uri={coverImage}
                        style={[
                          styles.previewImage,
                          coverAspectRatio ? { aspectRatio: coverAspectRatio, height: undefined } : {}
                        ]}
                      />
                      <TouchableOpacity
                        style={styles.removeImageButton}
                        onPress={() => setCoverImage(null)}
                      >
                        <Ionicons name="close-circle" size={24} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                <View style={styles.section}>
                  <Text style={styles.label}>Genres (select at least one) *</Text>
                  <View style={styles.genresGrid}>
                    {availableGenres.map((genre) => (
                      <TouchableOpacity
                        key={genre}
                        style={[
                          styles.genreChip,
                          genres.includes(genre) && styles.genreChipSelected
                        ]}
                        onPress={() => handleGenreToggle(genre)}
                      >
                        <Text style={[
                          styles.genreChipText,
                          genres.includes(genre) && styles.genreChipTextSelected
                        ]}>
                          {genre}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </Animated.View>
            )}

            {/* Step 2: Hook */}
            {currentStep === 2 && (
              <Animated.View style={[styles.stepContent, { opacity: stepAnim, transform: [{ translateY: stepSlideVal }] }]}>
                <View style={styles.section}>
                  <Text style={styles.label}>Summary *</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={summary}
                    onChangeText={setSummary}
                    placeholder="Write a compelling summary..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={4}
                  />
                </View>
                <View style={styles.section}>
                  <Text style={styles.label}>Author's Note (Optional)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={authorsNote}
                    onChangeText={setAuthorsNote}
                    placeholder="Share your thoughts with readers..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={4}
                  />
                </View>
                <View style={styles.section}>
                  <Text style={styles.label}>Prologue (Optional)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={prologue}
                    onChangeText={setPrologue}
                    placeholder="Begin your story with an intriguing prologue..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={4}
                  />
                </View>
                <View style={styles.section}>
                  <Text style={styles.label}>Contains graphic/gory content?</Text>
                  <View style={styles.radioGroup}>
                    <TouchableOpacity
                      style={[styles.radioButton, hasGraphicContent && styles.radioButtonSelected]}
                      onPress={() => setHasGraphicContent(true)}
                    >
                      <Text style={[styles.radioButtonText, hasGraphicContent && styles.radioButtonTextSelected]}>
                        Yes
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.radioButton, !hasGraphicContent && styles.radioButtonSelected]}
                      onPress={() => setHasGraphicContent(false)}
                    >
                      <Text style={[styles.radioButtonText, !hasGraphicContent && styles.radioButtonTextSelected]}>
                        No
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* Step 3: Cast */}
            {currentStep === 3 && (
              <Animated.View style={[styles.stepContent, { opacity: stepAnim, transform: [{ translateY: stepSlideVal }] }]}>
                <View style={styles.section}>
                  <View style={styles.chaptersHeader}>
                    <Text style={styles.sectionTitle}>Cast of Characters</Text>
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={() => {
                        navigation.navigate('CharacterManager', {
                          novelId: draftId,
                          initialCharacters: characters,
                          onSave: (updatedChars: any[]) => {
                            setCharacters(updatedChars);
                          }
                        });
                      }}
                    >
                      <Ionicons name="people-outline" size={20} color={colors.primary} />
                      <Text style={styles.addButtonText}>Manage</Text>
                    </TouchableOpacity>
                  </View>

                  {characters.length === 0 ? (
                    <View style={styles.emptyCharacters}>
                      <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
                      <Text style={styles.emptyCharactersText}>No characters added yet</Text>
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.characterList}>
                      {characters.map((char) => (
                        <View key={char.id} style={styles.characterThumbnail}>
                          {char.imageUrl ? (
                            <CachedImage uri={char.imageUrl} style={styles.charAvatar} />
                          ) : (
                            <View style={[styles.charAvatar, { backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center' }]}>
                              <Text style={{ color: colors.primary }}>{char.name.charAt(0)}</Text>
                            </View>
                          )}
                          <Text style={styles.charName} numberOfLines={1}>{char.name}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </Animated.View>
            )}

            {/* Step 4: Manuscript */}
            {currentStep === 4 && (
              <Animated.View style={[styles.stepContent, { opacity: stepAnim, transform: [{ translateY: stepSlideVal }] }]}>
                <View style={styles.section}>
                  <TouchableOpacity
                    style={[styles.pdfImportButton, (uploadingPdf || pdfProcessing) && styles.pdfImportButtonDisabled]}
                    onPress={handlePdfImport}
                    disabled={uploadingPdf || pdfProcessing}
                  >
                    <Ionicons name="document-text-outline" size={24} color={colors.primary} />
                    <View style={styles.pdfImportTextContainer}>
                      <Text style={styles.pdfImportButtonText}>Import from PDF</Text>
                      <Text style={styles.pdfImportButtonSubtext}>Extract chapters automatically</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.chaptersHeader}>
                    <Text style={styles.sectionTitle}>Chapters</Text>
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={() => {
                        const chapterNumber = chapters.length + 1;
                        navigation.navigate('ChapterEditor', {
                          chapterNumber,
                          onSave: (newChapter: any) => {
                            setChapters(prev => [...prev, { ...newChapter, chatMessages: [] }]);
                          },
                          onAutoSave: (newChapter: any) => {
                            setChapters(prev => [...prev, { ...newChapter, chatMessages: [] }]);
                            DeviceEventEmitter.emit('draftSaveStatus', 'Draft updated');
                            setTimeout(() => DeviceEventEmitter.emit('draftSaveStatus', null), 2000);
                          }
                        });
                      }}
                    >
                      <Ionicons name="add-circle" size={20} color={colors.primary} />
                      <Text style={styles.addButtonText}>Add Chapter</Text>
                    </TouchableOpacity>
                  </View>

                  {chapters.length === 0 ? (
                    <View style={styles.emptyChapters}>
                      <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
                      <Text style={styles.emptyChaptersText}>No chapters yet</Text>
                    </View>
                  ) : (
                    chapters.map((chapter, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.chapterCard}
                        onPress={() => {
                          navigation.navigate('ChapterEditor', {
                            chapterNumber: index + 1,
                            initialTitle: chapter.title,
                            initialContent: chapter.content,
                            onSave: (updatedChapter: any) => {
                              setChapters(prev => {
                                const next = [...prev];
                                next[index] = { ...next[index], ...updatedChapter };
                                return next;
                              });
                            },
                            onAutoSave: (updatedChapter: any) => {
                              DeviceEventEmitter.emit('draftSaveStatus', 'Saving...');
                              setChapters(prev => {
                                const next = [...prev];
                                next[index] = { ...next[index], ...updatedChapter };
                                return next;
                              });
                              setTimeout(() => {
                                DeviceEventEmitter.emit('draftSaveStatus', 'Draft updated');
                                setTimeout(() => DeviceEventEmitter.emit('draftSaveStatus', null), 2000);
                              }, 500);
                            }
                          });
                        }}
                      >
                        <View style={styles.chapterHeader}>
                          <Text style={styles.chapterNumber}>Chapter {index + 1}</Text>
                          <TouchableOpacity onPress={() => removeChapter(index)}>
                            <Ionicons name="trash-outline" size={20} color={colors.error} />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.chapterTitleText} numberOfLines={1}>{chapter.title}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </Animated.View>
            )}

            {/* Step 5: Final Review */}
            {currentStep === 5 && (
              <Animated.View style={[styles.stepContent, { opacity: stepAnim, transform: [{ translateY: stepSlideVal }] }]}>
                <View style={styles.reviewHeader}>
                  <Ionicons name="sparkles" size={32} color={colors.primary} />
                  <Text style={styles.reviewHeaderTitle}>Your masterpiece is ready</Text>
                  <Text style={styles.reviewHeaderSubtitle}>Review your novel's identity before it goes live</Text>
                </View>

                <View style={styles.reviewEditorialContent}>
                  {coverImage && (
                    <View style={styles.reviewEditorialCoverWrapper}>
                      <CachedImage
                        uri={coverImage}
                        style={[
                          styles.reviewCover,
                          coverAspectRatio ? { aspectRatio: coverAspectRatio, height: undefined } : {}
                        ]}
                      />
                    </View>
                  )}

                  <View style={styles.reviewEditorialInfo}>
                    <Text style={styles.reviewNovelTitle}>{title}</Text>

                    <View style={styles.reviewBadgeRow}>
                      {genres.map(genre => (
                        <View key={genre} style={styles.reviewGenreBadge}>
                          <Text style={styles.reviewGenreBadgeText}>{genre}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.reviewStatsRow}>
                      <View style={styles.reviewStatBox}>
                        <Ionicons name="book-outline" size={20} color={colors.primary} />
                        <Text style={styles.reviewStatValue}>{chapters.length}</Text>
                        <Text style={styles.reviewStatLabel}>Chapters</Text>
                      </View>
                      <View style={styles.reviewStatBox}>
                        <Ionicons name="people-outline" size={20} color={colors.primary} />
                        <Text style={styles.reviewStatValue}>{characters.length}</Text>
                        <Text style={styles.reviewStatLabel}>Characters</Text>
                      </View>
                    </View>

                    {description ? (
                      <View style={styles.reviewSummarySection}>
                        <Text style={styles.reviewSummaryLabel}>Description</Text>
                        <Text style={styles.reviewSummaryText}>{description}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Animated.View>
            )}

            {/* Wizard Navigation */}
            <View style={styles.wizardNavigation}>
              <TouchableOpacity style={styles.wizardBackButton} onPress={goToPrevStep}>
                <Ionicons name="arrow-back" size={20} color={colors.text} />
                <Text style={styles.wizardBackText}>{currentStep === 1 ? 'Cancel' : 'Back'}</Text>
              </TouchableOpacity>

              {currentStep < totalSteps ? (
                <TouchableOpacity style={styles.wizardNextButton} onPress={goToNextStep}>
                  <Text style={styles.wizardNextText}>Next</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.publishButton, loading && styles.submitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                      <Text style={styles.submitButtonText}>Publish Novel</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Keeping Poem Flow as is */}
        {submitType === 'poem' && (
          <View>
            <View style={styles.section}>
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Enter your poem title"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={styles.section}>
              <Text style={styles.label}>Description (one sentence) *</Text>
              <TextInput
                style={styles.input}
                value={description}
                onChangeText={handleDescriptionChange}
                placeholder="Capture the essence in one line..."
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={styles.helperText}>
                {countSentences(description)} of 1 sentence used
              </Text>
            </View>
            <View style={styles.section}>
              <View style={styles.poemHeader}>
                <Text style={styles.label}>Your Poem *</Text>
                <TouchableOpacity
                  style={styles.previewToggle}
                  onPress={() => setShowPreview(!showPreview)}
                >
                  <Ionicons
                    name={showPreview ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.previewToggleText}>
                    {showPreview ? 'Edit' : 'Preview'}
                  </Text>
                </TouchableOpacity>
              </View>

              {!showPreview ? (
                <>
                  <TextInput
                    style={[styles.input, styles.textArea, styles.poemInput]}
                    value={content}
                    onChangeText={setContent}
                    placeholder="Let your verses flow..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={15}
                  />
                  <View style={styles.statsRow}>
                    <Text style={styles.statText}>{lineCount} lines</Text>
                    <Text style={styles.statText}>•</Text>
                    <Text style={styles.statText}>{wordCount} words</Text>
                    <Text style={styles.statText}>•</Text>
                    <Text style={styles.statText}>{stanzaCount} stanzas</Text>
                  </View>
                </>
              ) : (
                <View style={styles.poemPreview}>
                  <Text style={styles.previewTitle}>{title}</Text>
                  <Text style={styles.previewContent}>{content}</Text>
                </View>
              )}
            </View>
            <View style={styles.section}>
              <Text style={styles.label}>Cover Image</Text>
              <TouchableOpacity style={styles.imageButton} onPress={handleImagePick}>
                <Ionicons name="image-outline" size={24} color={colors.primary} />
                <Text style={styles.imageButtonText}>Choose Image</Text>
              </TouchableOpacity>
              {coverImage && (
                <View style={styles.imagePreview}>
                  <CachedImage uri={coverImage} style={styles.previewImage} />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => setCoverImage(null)}
                  >
                    <Ionicons name="close-circle" size={24} color={colors.error} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <View style={styles.section}>
              <Text style={styles.label}>Genres *</Text>
              <View style={styles.genresGrid}>
                {availableGenres.map((genre) => (
                  <TouchableOpacity
                    key={genre}
                    style={[
                      styles.genreChip,
                      genres.includes(genre) && styles.genreChipSelected
                    ]}
                    onPress={() => handleGenreToggle(genre)}
                  >
                    <Text style={[
                      styles.genreChipText,
                      genres.includes(genre) && styles.genreChipTextSelected
                    ]}>
                      {genre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.publishButton, loading && styles.submitButtonDisabled, { margin: spacing.lg }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                  <Text style={styles.submitButtonText}>Publish Poem</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: themeColors.background,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: themeColors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 16,
    color: themeColors.textSecondary,
    textAlign: 'center',
  },
  selectionContainer: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  selectionHeader: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl * 1.5,
  },
  headerIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: themeColors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  selectionTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: themeColors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
    letterSpacing: -0.5,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  selectionSubtitle: {
    fontSize: 16,
    color: themeColors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: spacing.md,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  cardsContainer: {
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  selectionCard: {
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  cardGradient: {
    backgroundColor: themeColors.backgroundSecondary,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 20,
  },
  cardIconWrapper: {
    marginBottom: spacing.md,
  },
  cardIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardContent: {
    marginBottom: spacing.lg,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: spacing.xs,
  },
  cardDescription: {
    fontSize: 15,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    lineHeight: 22,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  cardFeatures: {
    flex: 1,
    gap: spacing.xs,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  featureText: {
    fontSize: 13,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  cardArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: themeColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: themeColors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  bottomInfoText: {
    fontSize: 13,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    flex: 1,
  },
  errorBanner: {
    backgroundColor: themeColors.error + '15',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 12,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    fontSize: 14,
    color: themeColors.error,
    flex: 1,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  label: {
    fontSize: 14,
    color: themeColors.text,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  input: {
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    padding: spacing.md,
    color: themeColors.text,
    borderWidth: 1.5,
    borderColor: themeColors.border,
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: spacing.md,
  },
  poemInput: {
    minHeight: 300,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  helperText: {
    fontSize: 12,
    color: themeColors.textSecondary,
    marginTop: spacing.xs,
  },
  poemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  previewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  previewToggleText: {
    fontSize: 14,
    color: themeColors.primary,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  statText: {
    fontSize: 12,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  poemPreview: {
    backgroundColor: themeColors.backgroundSecondary,
    borderRadius: 12,
    padding: spacing.lg,
    minHeight: 300,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: themeColors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  previewContent: {
    fontSize: 16,
    color: themeColors.text,
    textAlign: 'center',
    lineHeight: 28,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontStyle: 'italic',
  },
  previewGenres: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  previewGenreChip: {
    backgroundColor: themeColors.primary + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.primary + '40',
  },
  previewGenreText: {
    fontSize: 10,
    color: themeColors.primary,
  },
  emptyPreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 300,
  },
  emptyPreviewText: {
    fontSize: 16,
    color: themeColors.text,
    marginTop: spacing.md,
  },
  emptyPreviewSubtext: {
    fontSize: 14,
    color: themeColors.textSecondary,
    marginTop: spacing.xs,
  },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColors.primary + '10',
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: themeColors.primary,
    borderStyle: 'dashed',
    gap: spacing.sm,
  },
  imageButtonText: {
    fontSize: 15,
    color: themeColors.primary,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  imagePreview: {
    marginTop: spacing.md,
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  previewImage: {
    width: '100%',
    height: 220, // Default height if no aspect ratio detected
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: themeColors.error,
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    marginTop: spacing.xs,
  },
  // Wizard Styles
  stepIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    backgroundColor: themeColors.background,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  stepItem: {
    alignItems: 'center',
    zIndex: 1,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: themeColors.backgroundSecondary,
    borderWidth: 2,
    borderColor: themeColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepDotActive: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  stepDotCompleted: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  stepLabel: {
    fontSize: 10,
    color: themeColors.textSecondary,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  stepLabelActive: {
    color: themeColors.text,
    fontWeight: '700',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: themeColors.border,
    marginHorizontal: -4,
    marginTop: -16,
  },
  stepLineActive: {
    backgroundColor: themeColors.primary,
  },
  wizardContainer: {
    flex: 1,
  },
  stepContent: {
    flex: 1,
    minHeight: 400,
  },
  wizardNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.md,
  },
  wizardBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
    backgroundColor: themeColors.backgroundSecondary,
    borderWidth: 1,
    borderColor: themeColors.border,
    flex: 1,
    gap: spacing.sm,
  },
  wizardBackText: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  wizardNextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
    backgroundColor: themeColors.primary,
    flex: 1,
    gap: spacing.sm,
    shadowColor: themeColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  wizardNextText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  // Review Cards
  reviewEditorialContent: {
    marginVertical: spacing.lg,
  },
  reviewEditorialCoverWrapper: {
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  reviewHeader: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  reviewHeaderTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: themeColors.text,
    marginTop: spacing.sm,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign: 'center',
  },
  reviewHeaderSubtitle: {
    fontSize: 15,
    color: themeColors.textSecondary,
    marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign: 'center',
  },
  reviewCover: {
    width: '55%',
    height: 250,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  reviewEditorialInfo: {
    paddingHorizontal: spacing.xl,
  },
  reviewNovelTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign: 'center',
    marginBottom: spacing.md,
    letterSpacing: -0.5,
  },
  reviewBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  reviewGenreBadge: {
    backgroundColor: themeColors.primary + '12',
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: themeColors.primary + '25',
  },
  reviewGenreBadgeText: {
    fontSize: 12,
    color: themeColors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  reviewStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: themeColors.backgroundSecondary,
    borderRadius: 24,
    padding: spacing.xl,
    marginBottom: spacing.xl * 1.5,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  reviewStatBox: {
    alignItems: 'center',
    flex: 1,
  },
  reviewStatValue: {
    fontSize: 20,
    fontWeight: '800',
    color: themeColors.text,
    marginTop: 6,
  },
  reviewStatLabel: {
    fontSize: 11,
    color: themeColors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  reviewSummarySection: {
    marginBottom: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border + '50',
  },
  reviewSummaryLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: themeColors.text,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: spacing.md,
  },
  reviewSummaryText: {
    fontSize: 16,
    color: themeColors.text,
    lineHeight: 26,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontStyle: 'italic',
    opacity: 0.9,
  },
  // Character Step Styles
  characterList: {
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  characterThumbnail: {
    width: 80,
    alignItems: 'center',
    gap: spacing.xs,
  },
  charAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: themeColors.backgroundSecondary,
  },
  charName: {
    fontSize: 12,
    color: themeColors.text,
    textAlign: 'center',
    fontWeight: '600',
  },
  emptyCharacters: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: themeColors.backgroundSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderStyle: 'dashed',
  },
  emptyCharactersText: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: themeColors.textSecondary,
    fontWeight: '500',
  },
  // Manuscript Step Styles
  chapterPreview: {
    fontSize: 13,
    color: themeColors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  chapterStats: {
    flexDirection: 'row',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
    paddingTop: spacing.sm,
  },
  chapterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chapterNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: themeColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chapterTitleText: {
    fontSize: 18,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: spacing.sm,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chapterStatText: {
    fontSize: 12,
    color: themeColors.textSecondary,
    fontWeight: '500',
  },
  pdfErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: themeColors.error + '10',
    borderRadius: 8,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  pdfErrorText: {
    fontSize: 14,
    color: themeColors.error,
    flex: 1,
  },
  pdfSuccessContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: themeColors.primary + '10',
    borderRadius: 8,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  pdfSuccessText: {
    fontSize: 14,
    color: themeColors.primary,
    flex: 1,
  },
  genresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  genreChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: 24,
    backgroundColor: themeColors.surface,
    borderWidth: 1.5,
    borderColor: themeColors.border,
  },
  genreChipSelected: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
    shadowColor: themeColors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  genreChipText: {
    fontSize: 13,
    color: themeColors.text,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  genreChipTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  radioGroup: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  radioButton: {
    flex: 1,
    paddingVertical: spacing.md + 2,
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: themeColors.border,
    alignItems: 'center',
  },
  radioButtonSelected: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
    shadowColor: themeColors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  radioButtonText: {
    fontSize: 15,
    color: themeColors.text,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  radioButtonTextSelected: {
    color: '#fff',
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
    color: themeColors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: themeColors.primary + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
  },
  addButtonText: {
    fontSize: 14,
    color: themeColors.primary,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  emptyChapters: {
    backgroundColor: themeColors.surface,
    borderRadius: 16,
    padding: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.sm,
    borderWidth: 2,
    borderColor: themeColors.border,
    borderStyle: 'dashed',
  },
  emptyChaptersText: {
    fontSize: 16,
    color: themeColors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  emptyChaptersSubtext: {
    fontSize: 13,
    color: themeColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  pdfImportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: themeColors.primary + '15',
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: themeColors.primary,
    borderStyle: 'dashed',
    marginBottom: spacing.md,
  },
  pdfImportButtonDisabled: {
    opacity: 0.6,
  },
  pdfImportTextContainer: {
    alignItems: 'flex-start',
  },
  pdfImportButtonText: {
    fontSize: 16,
    color: themeColors.primary,
    fontWeight: '700',
  },
  pdfImportButtonSubtext: {
    fontSize: 12,
    color: themeColors.primary,
    opacity: 0.8,
    marginTop: 2,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  pdfUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: themeColors.backgroundSecondary,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: themeColors.primary,
    marginBottom: spacing.md,
  },
  pdfUploadButtonDisabled: {
    opacity: 0.6,
  },
  pdfUploadButtonText: {
    fontSize: 16,
    color: themeColors.primary,
    fontWeight: '600',
  },
  parsingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: themeColors.primary + '10',
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: themeColors.primary,
  },
  parsingText: {
    fontSize: 14,
    color: themeColors.primary,
    fontWeight: '600',
  },
  parseErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: themeColors.error + '10',
    borderRadius: 8,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: themeColors.error,
  },
  parseSuccessContainer: {
    backgroundColor: themeColors.primary + '10',
    borderLeftColor: themeColors.primary,
  },
  parseErrorText: {
    fontSize: 14,
    color: themeColors.error,
    fontWeight: '500',
    flex: 1,
  },
  parseSuccessText: {
    color: themeColors.primary,
  },
  chapterCard: {
    backgroundColor: themeColors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: themeColors.border,
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
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColors.primary,
    borderRadius: 16,
    padding: spacing.lg + 2,
    // margin handled by actionsRow
    gap: spacing.sm,
    shadowColor: themeColors.primary,
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
  bottomSpacing: {
    height: spacing.xl * 2,
  },
  actionsRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionWrapper: {
    flex: 1,
    paddingHorizontal: spacing.xs,
  },
  draftButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: themeColors.primary,
    gap: spacing.sm,
  },
  draftButtonText: {
    fontSize: 17,
    color: themeColors.primary,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginLeft: 8,
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColors.primary,
    borderRadius: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    shadowColor: themeColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  selectionDraftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: themeColors.surface,
    borderWidth: 1,
    borderColor: themeColors.border,
    marginBottom: spacing.lg,
  },
  selectionDraftThumb: {
    width: 80,
    height: 110,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: spacing.lg,
  },
  selectionDraftThumbImage: {
    width: '100%',
    height: '100%',
  },
  selectionDraftContent: {
    flex: 1,
  },
  selectionDraftSmall: {
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '600',
  },
  selectionDraftTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  selectionDraftMeta: {
    fontSize: 13,
  },
  /* Modal & Draft list styles */
  modalContainer: {
    flex: 1,
    paddingTop: spacing.md,
    backgroundColor: themeColors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  draftListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: themeColors.surface,
    borderWidth: 1,
    borderColor: themeColors.border,
    marginBottom: spacing.sm,
  },
  draftListTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  draftListMeta: {
    fontSize: 12,
    color: themeColors.textSecondary,
  },
  draftActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.md,
  },
  draftActionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: 10,
  },
  draftActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  saveStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: themeColors.surface,
    borderRadius: 20,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  saveStatusText: {
    fontSize: 13,
    color: themeColors.textSecondary,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  limitBanner: {
    backgroundColor: themeColors.error + '15',
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.error + '30',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  limitBannerText: {
    color: themeColors.error,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  draftCounter: {
    fontSize: 12,
    fontWeight: '700',
    color: themeColors.textSecondary,
    backgroundColor: themeColors.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  draftCounterLimit: {
    color: themeColors.error,
    backgroundColor: themeColors.error + '10',
  },
  selectionCardLimit: {
    opacity: 0.85,
    borderColor: themeColors.error + '20',
  },
});
