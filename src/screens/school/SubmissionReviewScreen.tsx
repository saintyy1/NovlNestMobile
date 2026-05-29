import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../contexts/AlertContext';
import { db } from '../../firebase/config';
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

export const SubmissionReviewScreen = ({ route, navigation }: any) => {
  const { submissionId, assignmentId, classId, schoolId } = route.params;
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const { showToast } = useAlert();
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<any>(null);
  const [approving, setApproving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const isTeacher = currentUser?.schoolRole === 'teacher';

  useEffect(() => {
    fetchSubmission();
  }, [submissionId]);

  const fetchSubmission = async () => {
    try {
      const subRef = doc(db, `schools/${schoolId}/classes/${classId}/assignments/${assignmentId}/submissions`, submissionId);
      const snap = await getDoc(subRef);
      if (snap.exists()) {
        const data = snap.data();
        setSubmission({ id: snap.id, ...data });
        if (data.teacherFeedback) {
          setFeedback(data.teacherFeedback);
        }
      }
    } catch (error) {
      console.error("Error fetching submission:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFeedback = async () => {
    if (!feedback.trim()) {
      showToast({ message: "Please enter some feedback first.", type: 'warning' });
      return;
    }
    try {
      const subRef = doc(db, `schools/${schoolId}/classes/${classId}/assignments/${assignmentId}/submissions`, submissionId);
      await updateDoc(subRef, {
        teacherFeedback: feedback.trim(),
      });
      setSubmission((prev: any) => ({ ...prev, teacherFeedback: feedback.trim() }));
      showToast({ message: "Feedback saved successfully", type: 'success' });
    } catch (error) {
      console.error("Error saving feedback:", error);
      Alert.alert("Error", "Failed to save feedback.");
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const subRef = doc(db, `schools/${schoolId}/classes/${classId}/assignments/${assignmentId}/submissions`, submissionId);
      
      const updateData = {
        status: 'approved',
        teacherApproved: true,
        approvedAt: serverTimestamp(),
        teacherFeedback: feedback.trim(),
      };

      await updateDoc(subRef, updateData);

      // Also publish to root 'submissions' collection for school-wide showcase
      const rootSubRef = doc(db, "submissions", submissionId);
      await setDoc(rootSubRef, {
        ...submission,
        ...updateData
      });

      setSubmission((prev: any) => ({ ...prev, ...updateData }));
      Alert.alert("Approved!", "This submission is now eligible for global publishing by the student.");
    } catch (error) {
      console.error("Error approving submission:", error);
      Alert.alert("Error", "Failed to approve submission.");
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.studentName, { color: colors.text }]}>{submission?.studentName}</Text>
          <Text style={[styles.date, { color: colors.textSecondary }]}>
            Submitted {submission?.submittedAt?.toDate().toLocaleDateString()}
          </Text>
        </View>

        <View style={[styles.contentCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.content, { color: colors.text }]}>{submission?.content}</Text>
        </View>

        <View style={styles.feedbackSection}>
          <Text style={[styles.feedbackLabel, { color: colors.text }]}>Teacher Feedback</Text>
          <View style={[styles.feedbackInputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {isTeacher && submission?.status === 'pending' ? (
              <TextInput
                style={[styles.feedbackInput, { color: colors.text }]}
                placeholder="Leave notes for the student..."
                placeholderTextColor={colors.textSecondary}
                multiline
                value={feedback}
                onChangeText={setFeedback}
                textAlignVertical="top"
              />
            ) : (
              <Text style={[styles.feedbackInput, { color: colors.text }]}>
                {feedback || "No feedback provided yet."}
              </Text>
            )}
          </View>
          {isTeacher && feedback.trim() !== (submission?.teacherFeedback || '') && (
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: colors.primary }]}
              onPress={handleSaveFeedback}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Save Feedback Only</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {isTeacher && submission?.status === 'pending' && (
        <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
          <TouchableOpacity
            style={[styles.approveButton, { backgroundColor: colors.primary }]}
            onPress={handleApprove}
            disabled={approving}
          >
            {approving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-done-circle" size={24} color="#fff" />
                <Text style={styles.approveButtonText}>Approve & Publish</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
  },
  studentName: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  date: {
    fontSize: 14,
    marginTop: 4,
  },
  contentCard: {
    padding: 24,
    borderRadius: 16,
    minHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  content: {
    fontSize: 18,
    lineHeight: 28,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: 1,
  },
  approveButton: {
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  approveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  feedbackSection: {
    marginTop: 24,
  },
  feedbackLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  feedbackInputContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    minHeight: 120,
  },
  feedbackInput: {
    fontSize: 16,
    flex: 1,
  },
  secondaryButton: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SubmissionReviewScreen;
