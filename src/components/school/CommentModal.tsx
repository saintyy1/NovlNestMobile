import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../firebase/config';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  doc,
  updateDoc,
  increment
} from 'firebase/firestore';

interface CommentModalProps {
  visible: boolean;
  onClose: () => void;
  contentId: string;
  collectionPath: string; // 'announcements' or a full path to a submission
  title: string;
}

export const CommentModal = ({ visible, onClose, contentId, collectionPath, title }: CommentModalProps) => {
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!visible || !contentId) return;

    setLoading(true);
    // Comments for educational content are stored in a top-level collection or subcollection
    // For MVP simplicity: a global 'educationalComments' collection with contentId field
    const q = query(
      collection(db, "educationalComments"),
      where("contentId", "==", contentId),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setComments(list);
      setLoading(false);
    }, (error) => {
      console.error("Error loading comments:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [visible, contentId]);

  const handlePostComment = async () => {
    if (!newComment.trim() || !currentUser) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "educationalComments"), {
        contentId,
        schoolId: currentUser.schoolId,
        authorId: currentUser.uid,
        authorName: currentUser.displayName || 'User',
        text: newComment.trim(),
        createdAt: serverTimestamp(),
      });

      // Increment comment count on the source document
      const docRef = doc(db, collectionPath, contentId);
      await updateDoc(docRef, {
        commentCount: increment(1)
      });

      setNewComment('');
    } catch (error) {
      console.error("Error posting comment:", error);
      Alert.alert("Error", "Failed to post comment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderComment = ({ item }: any) => (
    <View style={styles.commentItem}>
      <View style={[styles.avatar, { backgroundColor: colors.primary + '10' }]}>
        <Text style={[styles.avatarText, { color: colors.primary }]}>
          {(item.authorName || 'U').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.commentContent}>
        <Text style={[styles.authorName, { color: colors.text }]}>{item.authorName}</Text>
        <Text style={[styles.commentText, { color: colors.text }]}>{item.text}</Text>
        <Text style={[styles.commentDate, { color: colors.textSecondary }]}>
          {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Just now'}
        </Text>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.container, { backgroundColor: colors.surface }]}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
          ) : (
            <FlatList
              data={comments}
              renderItem={renderComment}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No comments yet.</Text>
                  <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Be the first to share your thoughts!</Text>
                </View>
              }
            />
          )}

          <View style={[styles.inputContainer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
              placeholder="Add a comment..."
              placeholderTextColor={colors.textSecondary}
              value={newComment}
              onChangeText={setNewComment}
              multiline
            />
            <TouchableOpacity 
              onPress={handlePostComment} 
              disabled={!newComment.trim() || isSubmitting}
              style={[styles.sendButton, { opacity: newComment.trim() ? 1 : 0.5 }]}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="send" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// Add where import to firestore
import { where } from 'firebase/firestore';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    height: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  commentContent: {
    flex: 1,
  },
  authorName: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  commentDate: {
    fontSize: 11,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    maxHeight: 100,
  },
  sendButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 13,
    marginTop: 4,
  }
});
