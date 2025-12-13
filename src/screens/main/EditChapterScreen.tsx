// src/screens/main/EditChapterScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';

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

interface ChatMessage {
  sender: string;
  message: string;
  timestamp?: string;
}

const EditChapterScreen = ({ route, navigation }: any) => {
  const { novelId, chapterIndex } = route.params;
  const { currentUser } = useAuth();

  const [novel, setNovel] = useState<Novel | null>(null);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterContent, setChapterContent] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showContentEditor, setShowContentEditor] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);

  const chapterIdx = chapterIndex ? Number(chapterIndex) : 0;

  useEffect(() => {
    fetchNovelAndChapter();
  }, [novelId, chapterIndex, currentUser]);

  // Check for changes
  useEffect(() => {
    const titleChanged = chapterTitle !== originalTitle;
    const contentChanged = chapterContent !== originalContent;
    setHasChanges(titleChanged || contentChanged);
  }, [chapterTitle, chapterContent, originalTitle, originalContent]);

  // Set header title
  useEffect(() => {
    navigation.setOptions({
      title: 'Edit Chapter',
    });
  }, [navigation]);

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

        const chapter = novelData.chapters[chapterIdx];
        setNovel(novelData);
        setChapterTitle(chapter.title);
        setChapterContent(chapter.content);
        setOriginalTitle(chapter.title);
        setOriginalContent(chapter.content);
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
    if (!novelId || !novel) return;

    // Validate input
    if (!chapterTitle.trim()) {
      Alert.alert('Error', 'Chapter title is required.');
      return;
    }

    if (!chapterContent.trim()) {
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
        title: chapterTitle.trim(),
        content: chapterContent.trim(),
      };

      // Update the novel with modified chapter
      await updateDoc(doc(db, 'novels', novelId), {
        chapters: updatedChapters,
        updatedAt: new Date().toISOString(),
      });

      // Update local state
      setOriginalTitle(chapterTitle.trim());
      setOriginalContent(chapterContent.trim());
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

  const handleReset = () => {
    if (hasChanges) {
      Alert.alert('Reset Changes', 'Are you sure you want to reset all changes?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setChapterTitle(originalTitle);
            setChapterContent(originalContent);
          },
        },
      ]);
    }
  };

  const insertChatIntoChapter = (messages: ChatMessage[]) => {
    // Create simple JSON marker for chat messages
    const chatData = `[CHAT_START]${JSON.stringify(messages)}[CHAT_END]`;

    // Insert at the end
    const newContent = chapterContent + '\n\n' + chatData + '\n\n';
    setChapterContent(newContent);
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

  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading chapter...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !novel) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={60} color="#EF4444" />
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
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
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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

          {/* Edit Chapter Card */}
          <View style={styles.chapterCard}>
            {/* Chapter Header */}
            <View style={styles.chapterHeader}>
              <Text style={styles.chapterHeaderTitle}>Chapter {chapterIdx + 1}</Text>
              <TouchableOpacity
                onPress={handleReset}
                disabled={!hasChanges}
                style={[styles.resetButton, !hasChanges && styles.resetButtonDisabled]}
              >
                <Ionicons
                  name="refresh"
                  size={18}
                  color={hasChanges ? '#9CA3AF' : '#4B5563'}
                />
                <Text style={[styles.resetButtonText, !hasChanges && styles.resetButtonTextDisabled]}>
                  Reset
                </Text>
              </TouchableOpacity>
            </View>

            {/* Chapter Title Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Chapter Title</Text>
              <TextInput
                style={styles.titleInput}
                value={chapterTitle}
                onChangeText={setChapterTitle}
                placeholder="Enter chapter title"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Chapter Content Input */}
            <View style={styles.inputGroup}>
              <View style={styles.contentLabelRow}>
                <Text style={styles.inputLabel}>Chapter Content</Text>
                <TouchableOpacity
                  onPress={() => setShowChatModal(true)}
                  style={styles.chatButton}
                >
                  <Ionicons name="chatbubbles-outline" size={16} color="#8B5CF6" />
                  <Text style={styles.chatButtonText}>Add Chat</Text>
                </TouchableOpacity>
              </View>
              
              {/* Content Preview/Edit Button */}
              <TouchableOpacity
                style={styles.contentPreview}
                onPress={() => setShowContentEditor(true)}
                activeOpacity={0.7}
              >
                {chapterContent ? (
                  <Text style={styles.contentPreviewText} numberOfLines={8}>
                    {chapterContent}
                  </Text>
                ) : (
                  <Text style={styles.contentPlaceholder}>
                    Tap to edit chapter content...
                  </Text>
                )}
                <View style={styles.editOverlay}>
                  <Ionicons name="create-outline" size={20} color="#8B5CF6" />
                  <Text style={styles.editOverlayText}>Tap to edit</Text>
                </View>
              </TouchableOpacity>
              
              <View style={styles.statsRow}>
                <Text style={styles.statText}>Characters: {chapterContent.length}</Text>
                <Text style={styles.statText}>Words: {getWordCount(chapterContent)}</Text>
              </View>
            </View>
          </View>

          {/* Submit Buttons */}
          <View style={styles.submitContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveButton,
                (saving || !hasChanges) && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={saving || !hasChanges}
            >
              {saving ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.saveButtonText}>Saving...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="save-outline" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Content Editor Modal */}
        {showContentEditor && (
          <ContentEditorModal
            visible={showContentEditor}
            content={chapterContent}
            onClose={() => setShowContentEditor(false)}
            onSave={(newContent) => {
              setChapterContent(newContent);
              setShowContentEditor(false);
            }}
          />
        )}

        {/* Chat Modal */}
        {showChatModal && (
          <ChatEditorModal
            visible={showChatModal}
            onClose={() => setShowChatModal(false)}
            onAdd={(messages) => {
              insertChatIntoChapter(messages);
              setShowChatModal(false);
              Alert.alert('Success', 'Chat dialogue added to chapter!');
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// Content Editor Modal Component
interface ContentEditorModalProps {
  visible: boolean;
  content: string;
  onClose: () => void;
  onSave: (content: string) => void;
}

const ContentEditorModal: React.FC<ContentEditorModalProps> = ({
  visible,
  content,
  onClose,
  onSave,
}) => {
  const [editedContent, setEditedContent] = useState(content);

  useEffect(() => {
    if (visible) {
      setEditedContent(content);
    }
  }, [visible, content]);

  const handleSave = () => {
    onSave(editedContent);
  };

  const handleCancel = () => {
    if (editedContent !== content) {
      Alert.alert(
        'Discard Changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: onClose,
          },
        ]
      );
    } else {
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleCancel}>
      <SafeAreaView style={styles.editorModalContainer} edges={['top', 'left', 'right']}>
        <View style={styles.editorModalHeader}>
          <TouchableOpacity onPress={handleCancel} style={styles.editorModalButton}>
            <Ionicons name="close" size={24} color="#9CA3AF" />
          </TouchableOpacity>
          <Text style={styles.editorModalTitle}>Edit Content</Text>
          <TouchableOpacity onPress={handleSave} style={styles.editorModalButton}>
            <Ionicons name="checkmark" size={24} color="#10B981" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            style={styles.editorModalBody}
            contentContainerStyle={styles.editorModalBodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TextInput
              style={styles.editorModalInput}
              value={editedContent}
              onChangeText={setEditedContent}
              placeholder="Write your chapter content here..."
              placeholderTextColor="#9CA3AF"
              multiline
              autoFocus
              textAlignVertical="top"
            />
          </ScrollView>
          
          <View style={styles.editorModalStats}>
            <Text style={styles.editorModalStatText}>
              {editedContent.length} characters
            </Text>
            <Text style={styles.editorModalStatText}>
              {editedContent.trim().split(/\s+/).filter((w) => w.length > 0).length} words
            </Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

// Chat Editor Modal Component
interface ChatEditorModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (messages: ChatMessage[]) => void;
}

const ChatEditorModal: React.FC<ChatEditorModalProps> = ({ visible, onClose, onAdd }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentSender, setCurrentSender] = useState('');
  const [currentMessage, setCurrentMessage] = useState('');

  const addMessage = () => {
    if (currentSender.trim() && currentMessage.trim()) {
      setMessages([...messages, { sender: currentSender, message: currentMessage }]);
      setCurrentMessage('');
    } else {
      Alert.alert('Error', 'Please enter both sender name and message.');
    }
  };

  const removeMessage = (index: number) => {
    const updatedMessages = [...messages];
    updatedMessages.splice(index, 1);
    setMessages(updatedMessages);
  };

  const handleAdd = () => {
    if (messages.length === 0 || !messages.every((m) => m.sender && m.message)) {
      Alert.alert('Error', 'Please add at least one complete message.');
      return;
    }
    onAdd(messages);
  };

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Chat Dialogue</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
          {/* Existing Messages */}
          {messages.map((msg, index) => (
            <View key={index} style={styles.messageItem}>
              <View style={styles.messageHeader}>
                <Text style={styles.messageSender}>{msg.sender}</Text>
                <TouchableOpacity onPress={() => removeMessage(index)}>
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
              <Text style={styles.messageText}>{msg.message}</Text>
            </View>
          ))}

          {/* Add New Message */}
          <View style={styles.addMessageContainer}>
            <Text style={styles.addMessageTitle}>Add Message</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Character name"
              placeholderTextColor="#9CA3AF"
              value={currentSender}
              onChangeText={setCurrentSender}
            />
            <TextInput
              style={[styles.modalInput, styles.modalMessageInput]}
              placeholder="Message"
              placeholderTextColor="#9CA3AF"
              value={currentMessage}
              onChangeText={setCurrentMessage}
              multiline
            />
            <TouchableOpacity style={styles.addMessageButton} onPress={addMessage}>
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.addMessageButtonText}>Add Message</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.modalFooter}>
          <TouchableOpacity style={styles.modalCancelButton} onPress={onClose}>
            <Text style={styles.modalCancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalAddButton} onPress={handleAdd}>
            <Text style={styles.modalAddButtonText}>Add to Chapter</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#111827',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#fff',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center' as const,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  headerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
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
    fontWeight: 'bold' as const,
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  unsavedBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  unsavedText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#fff',
  },
  container: {
    flex: 1,
  },
  novelCard: {
    backgroundColor: '#1F2937',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  novelInfo: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 16,
  },
  coverImage: {
    width: 80,
    height: 112,
    borderRadius: 8,
  },
  novelDetails: {
    flex: 1,
  },
  novelTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#fff',
    marginBottom: 4,
  },
  novelAuthor: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  novelChapters: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  errorMessage: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#EF4444',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  errorMessageText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  chapterCard: {
    backgroundColor: '#1F2937',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#8B5CF6',
  },
  chapterHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  chapterHeaderTitle: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    color: '#fff',
  },
  resetButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  resetButtonDisabled: {
    opacity: 0.5,
  },
  resetButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  resetButtonTextDisabled: {
    color: '#4B5563',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: '#D1D5DB',
    marginBottom: 8,
  },
  titleInput: {
    backgroundColor: '#374151',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  contentLabelRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  chatButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  chatButtonText: {
    color: '#8B5CF6',
    fontSize: 12,
  },
  contentInput: {
    backgroundColor: '#374151',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    minHeight: 200,
    maxHeight: 200,
  },
  contentPreview: {
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
    minHeight: 200,
    position: 'relative' as const,
  },
  contentPreviewText: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
  },
  contentPlaceholder: {
    color: '#6B7280',
    fontSize: 14,
    fontStyle: 'italic' as const,
  },
  editOverlay: {
    position: 'absolute' as const,
    bottom: 12,
    right: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  editOverlayText: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '600' as const,
  },
  statsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: 8,
  },
  statText: {
    fontSize: 12,
    color: '#6B7280',
  },
  editorModalContainer: {
    flex: 1,
    backgroundColor: '#111827',
  },
  editorModalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  editorModalButton: {
    padding: 8,
    width: 40,
  },
  editorModalTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#fff',
  },
  editorModalBody: {
    flex: 1,
  },
  editorModalBodyContent: {
    padding: 16,
    flexGrow: 1,
  },
  editorModalInput: {
    backgroundColor: '#1F2937',
    color: '#fff',
    padding: 16,
    borderRadius: 12,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top' as const,
    minHeight: 400,
  },
  editorModalStats: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#1F2937',
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  editorModalStatText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  submitContainer: {
    flexDirection: 'row' as const,
    gap: 12,
    margin: 16,
    marginBottom: 32,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#374151',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  cancelButtonText: {
    color: '#D1D5DB',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row' as const,
    backgroundColor: '#8B5CF6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  modalOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    width: '100%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#fff',
  },
  modalBody: {
    padding: 16,
    maxHeight: 400,
  },
  messageItem: {
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  messageHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  messageSender: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#8B5CF6',
  },
  messageText: {
    fontSize: 14,
    color: '#D1D5DB',
  },
  addMessageContainer: {
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  addMessageTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#fff',
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: '#1F2937',
    color: '#fff',
    padding: 10,
    borderRadius: 6,
    fontSize: 14,
    marginBottom: 8,
  },
  modalMessageInput: {
    minHeight: 80,
    textAlignVertical: 'top' as const,
  },
  addMessageButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#8B5CF6',
    padding: 10,
    borderRadius: 6,
    gap: 6,
    marginTop: 8,
  },
  addMessageButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  modalFooter: {
    flexDirection: 'row' as const,
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#374151',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  modalCancelButtonText: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  modalAddButton: {
    flex: 1,
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  modalAddButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
});

export default EditChapterScreen;