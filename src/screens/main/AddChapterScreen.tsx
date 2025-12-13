// src/screens/main/AddChaptersScreen.tsx
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

interface Chapter {
  title: string;
  content: string;
}

interface ChatMessage {
  sender: string;
  message: string;
  timestamp?: string;
}

const AddChaptersScreen = ({ route, navigation }: any) => {
  const { novelId } = route.params;
  const { currentUser } = useAuth();

  const [novel, setNovel] = useState<Novel | null>(null);
  const [newChapters, setNewChapters] = useState<Chapter[]>([{ title: '', content: '' }]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingChapterIndex, setEditingChapterIndex] = useState<number | null>(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [currentChapterForChat, setCurrentChapterForChat] = useState<number | null>(null);

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

  const handleChapterTitleChange = (index: number, title: string) => {
    const updatedChapters = [...newChapters];
    updatedChapters[index].title = title;
    setNewChapters(updatedChapters);
  };

  const handleChapterContentChange = (index: number, content: string) => {
    const updatedChapters = [...newChapters];
    updatedChapters[index].content = content;
    setNewChapters(updatedChapters);
  };

  const insertChatIntoChapter = (index: number, messages: ChatMessage[]) => {
    const updatedChapters = [...newChapters];
    const currentContent = updatedChapters[index].content;

    // Create simple JSON marker for chat messages
    const chatData = `[CHAT_START]${JSON.stringify(messages)}[CHAT_END]`;

    // Insert at the end
    updatedChapters[index].content = currentContent + '\n\n' + chatData + '\n\n';
    setNewChapters(updatedChapters);
  };

  const addChapter = () => {
    setNewChapters([...newChapters, { title: '', content: '' }]);
  };

  const removeChapter = (index: number) => {
    if (newChapters.length > 1) {
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
    } else {
      Alert.alert('Error', 'You must have at least one chapter.');
    }
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

      setSuccess(`Successfully added ${validChapters.length} new chapter(s)!`);
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
      setNewChapters([{ title: '', content: '' }]);
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

  const openChatEditor = (chapterIndex: number) => {
    setCurrentChapterForChat(chapterIndex);
    setShowChatModal(true);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading novel...</Text>
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Chapters</Text>
          <View style={{ width: 40 }} />
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
                  Current chapters: {novel?.chapters?.length || 0}
                </Text>
              </View>
            </View>
          </View>

          {/* Success Message */}
          {success && (
            <View style={styles.successMessage}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={styles.successText}>{success}</Text>
            </View>
          )}

          {/* Error Message */}
          {error && (
            <View style={styles.errorMessage}>
              <Ionicons name="alert-circle" size={20} color="#EF4444" />
              <Text style={styles.errorMessageText}>{error}</Text>
            </View>
          )}

          {/* Chapters Section Header */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>New Chapters</Text>
            <TouchableOpacity onPress={addChapter} style={styles.addChapterButton}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.addChapterButtonText}>Add Chapter</Text>
            </TouchableOpacity>
          </View>

          {/* Chapters List */}
          {newChapters.map((chapter, index) => {
            const chapterNumber = (novel?.chapters?.length || 0) + index + 1;
            const isEditing = editingChapterIndex === index;

            return (
              <View key={index} style={styles.chapterCard}>
                {/* Chapter Header */}
                <View style={styles.chapterHeader}>
                  <Text style={styles.chapterHeaderTitle}>
                    New Chapter {chapterNumber}
                  </Text>
                  {newChapters.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeChapter(index)}
                      style={styles.removeButton}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      <Text style={styles.removeButtonText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Chapter Title Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Chapter Title</Text>
                  <TextInput
                    style={styles.titleInput}
                    value={chapter.title}
                    onChangeText={(text) => handleChapterTitleChange(index, text)}
                    placeholder={`Enter Chapter ${chapterNumber} title`}
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                {/* Chapter Content Input */}
                <View style={styles.inputGroup}>
                  <View style={styles.contentLabelRow}>
                    <Text style={styles.inputLabel}>Chapter Content</Text>
                    <TouchableOpacity
                      onPress={() => openChatEditor(index)}
                      style={styles.chatButton}
                    >
                      <Ionicons name="chatbubbles-outline" size={16} color="#8B5CF6" />
                      <Text style={styles.chatButtonText}>Add Chat</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.contentInput}
                    value={chapter.content}
                    onChangeText={(text) => handleChapterContentChange(index, text)}
                    placeholder="Write your chapter content here..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    numberOfLines={10}
                    textAlignVertical="top"
                  />
                  <Text style={styles.characterCount}>
                    {chapter.content.length} characters
                  </Text>
                </View>

                {/* Formatting Tips */}
                <View style={styles.tipsContainer}>
                  <Text style={styles.tipsTitle}>Formatting Tips:</Text>
                  <Text style={styles.tipText}>• Use blank lines to separate paragraphs</Text>
                  <Text style={styles.tipText}>• Use *text* for italic emphasis</Text>
                  <Text style={styles.tipText}>• Use **text** for bold emphasis</Text>
                </View>
              </View>
            );
          })}

          {/* Submit Button */}
          <View style={styles.submitContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.submitButtonText}>Adding...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <Text style={styles.submitButtonText}>
                    Add {newChapters.length} Chapter{newChapters.length > 1 ? 's' : ''}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Chat Modal */}
        {showChatModal && currentChapterForChat !== null && (
          <ChatEditorModal
            visible={showChatModal}
            onClose={() => {
              setShowChatModal(false);
              setCurrentChapterForChat(null);
            }}
            onAdd={(messages) => {
              insertChatIntoChapter(currentChapterForChat, messages);
              setShowChatModal(false);
              setCurrentChapterForChat(null);
              Alert.alert('Success', 'Chat dialogue added to chapter!');
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// Chat Editor Modal Component
interface ChatEditorModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (messages: ChatMessage[]) => void;
}

const ChatEditorModal: React.FC<ChatEditorModalProps> = ({ visible, onClose, onAdd }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { sender: 'Character 1', message: '' },
  ]);
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
    if (messages.length === 0 || !messages.every(m => m.sender && m.message)) {
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
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
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
  successMessage: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#10B981',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  successText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
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
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: '#fff',
  },
  addChapterButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  addChapterButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
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
  removeButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  removeButtonText: {
    color: '#EF4444',
    fontSize: 14,
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
    minHeight: 150,
  },
  characterCount: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'right' as const,
  },
  tipsContainer: {
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  tipsTitle: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 4,
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
  submitButton: {
    flex: 2,
    flexDirection: 'row' as const,
    backgroundColor: '#8B5CF6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
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

export default AddChaptersScreen;