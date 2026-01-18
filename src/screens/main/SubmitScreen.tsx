// src/screens/main/SubmitScreen.tsx
import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { collection, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing } from '../../theme';
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

export const SubmitScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  
  const [submitType, setSubmitType] = useState<SubmitType>(null);
  
  // Common fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Novel-specific fields
  const [summary, setSummary] = useState('');
  const [authorsNote, setAuthorsNote] = useState('');
  const [prologue, setPrologue] = useState('');
  const [hasGraphicContent, setHasGraphicContent] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterSelections, setChapterSelections] = useState<{[key: number]: {start: number, end: number}}>({}); 
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfProcessing, setPdfProcessing] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  
  // Poem-specific fields
  const [content, setContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);

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
      Alert.alert('Permission Required', 'Permission to access camera roll is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, // No cropping
      quality: 0.8,
    });

    if (!result.canceled) {
      setCoverImage(result.assets[0].uri);
    }
  };

  const addChapter = () => {
    setChapters([...chapters, { title: '', content: '', chatMessages: [] }]);
  };

  const removeChapter = (index: number) => {
    const newChapters = [...chapters];
    newChapters.splice(index, 1);
    setChapters(newChapters);
  };

  const handleChapterTitleChange = (index: number, title: string) => {
    const newChapters = [...chapters];
    newChapters[index].title = title;
    setChapters(newChapters);
  };

  const handleChapterContentChange = (index: number, content: string) => {
    const newChapters = [...chapters];
    newChapters[index].content = content;
    setChapters(newChapters);
  };

  const insertChatIntoChapter = (index: number, messages: ChatMessage[]) => {
    const newChapters = [...chapters];
    const currentContent = newChapters[index].content;

    // Create simple JSON marker for chat messages
    const chatData = `[CHAT_START]${JSON.stringify(messages)}[CHAT_END]`;

    // Insert at end of content
    newChapters[index].content = currentContent + (currentContent ? '\n\n' : '') + chatData;
    newChapters[index].chatMessages = messages;
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
        Alert.alert(
          'Success',
          `Imported ${importedChapters.length} chapter(s) from PDF`,
          [{ text: 'OK' }]
        );
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
      Alert.alert('Import Failed', errorMessage);
    }
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
          const response = await fetch(coverImage);
          const blob = await response.blob();
          
          const storageFolder = submitType === 'novel' ? 'covers-large' : 'poem-covers-large';
          const storageSmallFolder = submitType === 'novel' ? 'covers-small' : 'poem-covers-small';
          
          const coverRef = ref(storage, `${storageFolder}/${docRef.id}.jpg`);
          const coverSmallRef = ref(storage, `${storageSmallFolder}/${docRef.id}.jpg`);

          await uploadBytes(coverRef, blob);
          await uploadBytes(coverSmallRef, blob);

          coverUrl = `https://storage.googleapis.com/novelnest-50ab1.firebasestorage.app/${storageFolder}/${docRef.id}.jpg`;
          coverSmallUrl = `https://storage.googleapis.com/novelnest-50ab1.firebasestorage.app/${storageSmallFolder}/${docRef.id}.jpg`;
        } catch (err) {
          console.error('Image upload failed:', err);
          setError('Failed to upload image');
          setLoading(false);
          return;
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
          authorId: currentUser?.uid,
          authorName: currentUser?.displayName,
          isPromoted: false,
          published: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          coverImage: coverUrl || null,
          coverSmallImage: coverSmallUrl || null,
          likes: 0,
          views: 0,
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

      Alert.alert(
        'Success',
        `Your ${submitType} has been submitted for review!`,
        [{ text: 'OK', onPress: () => {
          setSubmitType(null);
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
          setContent('');
        }}]
      );
      
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
              style={styles.selectionCard}
              onPress={() => setSubmitType('novel')}
              activeOpacity={0.7}
            >
              <View style={styles.cardGradient}>
                <View style={styles.cardIconWrapper}>
                  <View style={[styles.cardIconContainer, { backgroundColor: colors.primary }]}>
                    <Ionicons name="book" size={32} color="#fff" />
                  </View>
                </View>
                
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>Novel</Text>
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
              style={styles.selectionCard}
              onPress={() => setSubmitType('poem')}
              activeOpacity={0.7}
            >
              <View style={styles.cardGradient}>
                <View style={styles.cardIconWrapper}>
                  <View style={[styles.cardIconContainer, { backgroundColor: '#EC4899' }]}>
                    <Ionicons name="rose" size={32} color="#fff" />
                  </View>
                </View>
                
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>Poem</Text>
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
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Title */}
        <View style={styles.section}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={submitType === 'novel' ? 'Enter your novel title' : 'Enter your poem title'}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {/* Description */}
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

        {/* Novel-specific: Summary */}
        {submitType === 'novel' && (
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
        )}

        {/* Novel-specific: Author's Note */}
        {submitType === 'novel' && (
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
        )}

        {/* Novel-specific: Prologue */}
        {submitType === 'novel' && (
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
        )}

        {/* Poem-specific: Content */}
        {submitType === 'poem' && (
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
                  <Text style={styles.statText}>{stanzaCount} stanza{stanzaCount !== 1 ? 's' : ''}</Text>
                </View>
              </>
            ) : (
              <View style={styles.poemPreview}>
                {content ? (
                  <>
                    {title && (
                      <Text style={styles.previewTitle}>{title}</Text>
                    )}
                    <Text style={styles.previewContent}>{content}</Text>
                    {genres.length > 0 && (
                      <View style={styles.previewGenres}>
                        {genres.map((genre) => (
                          <View key={genre} style={styles.previewGenreChip}>
                            <Text style={styles.previewGenreText}>{genre}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.emptyPreview}>
                    <Ionicons name="document-text-outline" size={48} color={colors.textSecondary} />
                    <Text style={styles.emptyPreviewText}>Your poem will appear here</Text>
                    <Text style={styles.emptyPreviewSubtext}>Start writing to see the preview</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Cover Image */}
        <View style={styles.section}>
          <Text style={styles.label}>Cover Image (Optional)</Text>
          <TouchableOpacity style={styles.imageButton} onPress={handleImagePick}>
            <Ionicons name="image-outline" size={24} color={colors.primary} />
            <Text style={styles.imageButtonText}>Choose Image</Text>
          </TouchableOpacity>
          {coverImage && (
            <View style={styles.imagePreview}>
              <Image source={{ uri: coverImage }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => setCoverImage(null)}
              >
                <Ionicons name="close-circle" size={24} color={colors.error} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Genres */}
        <View style={styles.section}>
          <Text style={styles.label}>
            {submitType === 'novel' ? 'Genres' : 'Poetry Styles'} (select at least one) *
          </Text>
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

        {/* Novel-specific: Graphic Content */}
        {submitType === 'novel' && (
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
        )}

        {/* Novel-specific: Chapters */}
        {submitType === 'novel' && (
          <View style={styles.section}>
            {/* PDF Import Button */}
            <TouchableOpacity
              style={[styles.pdfImportButton, (uploadingPdf || pdfProcessing) && styles.pdfImportButtonDisabled]}
              onPress={handlePdfImport}
              disabled={uploadingPdf || pdfProcessing}
            >
              {uploadingPdf ? (
                <>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.pdfImportButtonText}>Uploading PDF...</Text>
                </>
              ) : pdfProcessing ? (
                <>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.pdfImportButtonText}>Processing PDF...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={24} color={colors.primary} />
                  <View style={styles.pdfImportTextContainer}>
                    <Text style={styles.pdfImportButtonText}>Import from PDF</Text>
                    <Text style={styles.pdfImportButtonSubtext}>Automatically extract chapters</Text>
                  </View>
                </>
              )}
            </TouchableOpacity>

            {parseError && (
              <View style={styles.pdfErrorContainer}>
                <Ionicons name="alert-circle-outline" size={20} color={colors.error} />
                <Text style={styles.pdfErrorText}>{parseError}</Text>
              </View>
            )}

            {pdfFileName && chapters.length > 0 && (
              <View style={styles.pdfSuccessContainer}>
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                <Text style={styles.pdfSuccessText}>Imported from: {pdfFileName}</Text>
              </View>
            )}

            <View style={styles.chaptersHeader}>
              <Text style={styles.sectionTitle}>Chapters</Text>
              <TouchableOpacity 
                style={styles.addButton} 
                onPress={() => {
                  const chapterNumber = chapters.length + 1;
                  navigation.navigate('ChapterEditor', {
                    chapterNumber,
                    initialTitle: '',
                    initialContent: '',
                    onSave: (newChapter: { title: string; content: string }) => {
                      setChapters([...chapters, {
                        title: newChapter.title,
                        content: newChapter.content,
                        chatMessages: []
                      }]);
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
                <Text style={styles.emptyChaptersText}>No chapters added yet</Text>
                <Text style={styles.emptyChaptersSubtext}>
                  Tap "Add Chapter" to start writing your story
                </Text>
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
                      onSave: (updatedChapter: { title: string; content: string }) => {
                        const newChapters = [...chapters];
                        newChapters[index] = {
                          ...newChapters[index],
                          title: updatedChapter.title,
                          content: updatedChapter.content
                        };
                        setChapters(newChapters);
                      }
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.chapterHeader}>
                    <View style={styles.chapterTitleRow}>
                      <Text style={styles.chapterNumber}>Chapter {index + 1}</Text>
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
                    {chapter.title || `Chapter ${index + 1} (Untitled)`}
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
                        {chapter.content.trim().split(/\s+/).filter((w: string) => w).length} words
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>
                Publish {submitType === 'novel' ? 'Novel' : 'Poem'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </View>
  );
};

const getStyles = (themeColors : any) => StyleSheet.create({
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
    height: 220,
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
    elevation: 4,
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
  pdfErrorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: themeColors.error + '10',
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: themeColors.error,
  },
  pdfErrorText: {
    fontSize: 13,
    color: themeColors.error,
    fontWeight: '500',
    flex: 1,
    lineHeight: 18,
  },
  pdfSuccessContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: themeColors.primary + '10',
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: themeColors.primary,
  },
  pdfSuccessText: {
    fontSize: 13,
    color: themeColors.primary,
    fontWeight: '600',
    flex: 1,
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
  chapterPreview: {
    fontSize: 14,
    color: themeColors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  chapterStats: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chapterStatText: {
    fontSize: 11,
    color: themeColors.textSecondary,
    fontWeight: '600',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColors.primary,
    borderRadius: 16,
    padding: spacing.lg + 2,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
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
});