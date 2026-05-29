import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Alert, Modal, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../firebase/config';
import { CommentModal } from './CommentModal';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, increment, doc } from 'firebase/firestore';

export const AnnouncementsList = ({ classId: propClassId, schoolId: propSchoolId }: { classId?: string, schoolId?: string }) => {
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<any[]>([]);

  const effectiveClassId = propClassId || currentUser?.classId;
  const effectiveSchoolId = propSchoolId || currentUser?.schoolId;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any>(null);

  const isTeacher = currentUser?.schoolRole === 'teacher';
  const isPrincipal = currentUser?.schoolRole === 'school_admin';

  useEffect(() => {
    if (!effectiveSchoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let announcementsQ;
    if (effectiveClassId && effectiveSchoolId) {
      announcementsQ = query(
        collection(db, `schools/${effectiveSchoolId}/classes/${effectiveClassId}/announcements`),
        orderBy("createdAt", "desc")
      );
    } else {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(announcementsQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAnnouncements(list);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to announcements:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [effectiveSchoolId, effectiveClassId, isPrincipal]);

  const handleReaction = async (announcementId: string, emoji: string) => {
    if (!currentUser?.uid || !effectiveSchoolId || !effectiveClassId) return;
    try {
      const annRef = doc(db, `schools/${effectiveSchoolId}/classes/${effectiveClassId}/announcements`, announcementId);
      await updateDoc(annRef, {
        [`reactions.${emoji}`]: increment(1)
      });
    } catch (error) {
      console.error("Error reacting:", error);
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!newContent.trim()) {
      Alert.alert("Required", "Please enter some content for the update.");
      return;
    }

    if (!effectiveSchoolId || !effectiveClassId || !currentUser) {
      Alert.alert("Error", "Missing school or user information.");
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, `schools/${effectiveSchoolId}/classes/${effectiveClassId}/announcements`), {
        content: newContent.trim(),
        authorId: currentUser.uid,
        authorName: currentUser.displayName || 'Teacher',
        createdAt: serverTimestamp(),
        reactions: {},
        commentCount: 0
      });
      setNewContent('');
      setShowCreateModal(false);
      Alert.alert("Success", "Announcement posted successfully.");
    } catch (error) {
      console.error("Error creating announcement:", error);
      Alert.alert("Error", "Failed to post announcement.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderItem = ({ item }: any) => (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="megaphone-outline" size={20} color={colors.primary} />
        </View>
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Just now'}
        </Text>
      </View>
      <Text style={[styles.content, { color: colors.text }]}>{item.content}</Text>
      <Text style={[styles.author, { color: colors.textSecondary }]}>— {item.authorName || 'Teacher'}</Text>

      {/* Reactions & Comments Bar */}
      <View style={[styles.actionBar, { borderTopColor: colors.border }]}>
        <View style={styles.reactionsContainer}>
          {['👍', '❤️', '👏', '🔥'].map(emoji => (
            <TouchableOpacity
              key={emoji}
              style={[styles.reactionButton, { backgroundColor: colors.background }]}
              onPress={() => handleReaction(item.id, emoji)}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>
                {item.reactions?.[emoji] || 0}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.commentButton}
          onPress={() => setSelectedAnnouncement(item)}
        >
          <Ionicons name="chatbubble-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.commentText, { color: colors.textSecondary }]}>
            {item.commentCount || 0}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Class Updates</Text>
        {isTeacher && (
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add-outline" size={20} color="#fff" />
            <Text style={styles.addButtonText}>New Update</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={announcements}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.text }]}>No updates yet</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Important announcements and class updates will appear here.
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Create Announcement Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>New Announcement</Text>

              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                placeholder="Write your update here..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
                value={newContent}
                onChangeText={setNewContent}
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                >
                  <Text style={{ color: colors.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmButton, { backgroundColor: colors.primary }]}
                  onPress={handleCreateAnnouncement}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.confirmButtonText}>Post Update</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* Comments Modal */}
      {selectedAnnouncement && (
        <CommentModal
          visible={!!selectedAnnouncement}
          onClose={() => setSelectedAnnouncement(null)}
          contentId={selectedAnnouncement.id}
          collectionPath={`schools/${effectiveSchoolId}/classes/${effectiveClassId}/announcements`}
          title="Update Discussion"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 4,
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconContainer: {
    padding: 8,
    borderRadius: 10,
  },
  date: {
    fontSize: 12,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  author: {
    fontSize: 13,
    fontWeight: '600',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 12,
  },
  reactionsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  reactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  commentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  commentText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    opacity: 0.5,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    padding: 12,
  },
  confirmButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 120,
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
