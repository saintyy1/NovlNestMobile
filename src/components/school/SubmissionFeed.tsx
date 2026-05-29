import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../firebase/config';
import { CommentModal } from './CommentModal';
import {
  collectionGroup,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  increment,
  doc,
  limit
} from 'firebase/firestore';

export const SubmissionFeed = ({ classId, schoolId: propSchoolId }: { classId: string, schoolId?: string }) => {
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);

  const effectiveSchoolId = propSchoolId || currentUser?.schoolId;

  useEffect(() => {
    if (!classId || !effectiveSchoolId) {
      setLoading(false);
      return;
    }

    // Use collectionGroup to find submissions across all assignments in this class
    // Note: This requires a composite index in Firestore
    const q = query(
      collectionGroup(db, 'submissions'),
      where('schoolId', '==', effectiveSchoolId),
      where('classId', '==', classId),
      orderBy('submittedAt', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSubmissions(list);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to submission feed:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [classId]);

  const handleReaction = async (submission: any, emoji: string) => {
    if (!currentUser?.uid) return;
    try {
      // submissions are in schools/{schoolId}/classes/{classId}/assignments/{assignmentId}/submissions/{submissionId}
      // We need the full path to update
      const subRef = doc(db, submission.path || `schools/${effectiveSchoolId}/classes/${classId}/assignments/${submission.assignmentId}/submissions/${submission.id}`);
      await updateDoc(subRef, {
        [`reactions.${emoji}`]: increment(1)
      });
    } catch (error) {
      console.error("Error reacting to submission:", error);
    }
  };

  const renderItem = ({ item }: any) => (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>
            {(item.studentName || 'S').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={[styles.studentName, { color: colors.text }]}>{item.studentName}</Text>
          <Text style={[styles.assignmentTitle, { color: colors.textSecondary }]}>
            submitted a {item.assignmentType || 'task'}: {item.assignmentTitle || 'Work'}
          </Text>
        </View>
        <Text style={[styles.time, { color: colors.textSecondary }]}>
          {item.submittedAt?.toDate ? item.submittedAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
        </Text>
      </View>

      <View style={styles.cardBody}>
        <Ionicons name="document-text-outline" size={32} color={colors.primary} style={{ opacity: 0.6 }} />
        <View style={styles.fileInfo}>
          <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
            {item.fileName || 'Submission Work'}
          </Text>
          <Text style={[styles.fileSize, { color: colors.textSecondary }]}>
            {item.fileSize ? `${(item.fileSize / 1024).toFixed(1)} KB` : 'Review attachment'}
          </Text>
        </View>
      </View>

      {/* Reactions Bar */}
      <View style={[styles.actionBar, { borderTopColor: colors.border }]}>
        <View style={styles.reactionsContainer}>
          {['👏', '🙌', '✨', '🏆'].map(emoji => (
            <TouchableOpacity 
              key={emoji} 
              style={[styles.reactionButton, { backgroundColor: colors.background }]}
              onPress={() => handleReaction(item, emoji)}
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
          onPress={() => setSelectedSubmission(item)}
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
      <View style={styles.feedHeader}>
        <Text style={[styles.title, { color: colors.text }]}>Submission Activity</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Celebrating student progress</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={submissions}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="sparkles-outline" size={48} color={colors.textSecondary} style={{ opacity: 0.3 }} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No submissions yet</Text>
              <Text style={styles.emptySubtext}>Student work will appear here as it's turned in.</Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Comments Modal */}
      {selectedSubmission && (
        <CommentModal
          visible={!!selectedSubmission}
          onClose={() => setSelectedSubmission(null)}
          contentId={selectedSubmission.id}
          collectionPath={selectedSubmission.path || `schools/${currentUser?.schoolId}/classes/${classId}/assignments/${selectedSubmission.assignmentId}/submissions`}
          title="Submission Feedback"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  feedHeader: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  assignmentTitle: {
    fontSize: 12,
  },
  time: {
    fontSize: 11,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.02)',
    marginBottom: 16,
  },
  fileInfo: {
    marginLeft: 12,
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
  },
  fileSize: {
    fontSize: 11,
    marginTop: 2,
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
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
});
