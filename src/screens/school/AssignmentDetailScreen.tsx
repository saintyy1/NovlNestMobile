import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../contexts/AlertContext';
import { spacing, typography } from '../../theme';
import { db } from '../../firebase/config';
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  updateDoc,
  increment,
  orderBy,
  limit,
} from 'firebase/firestore';

export const AssignmentDetailScreen = ({ route, navigation }: any) => {
  const { assignmentId, schoolId: propSchoolId, classId: propClassId } = route.params;
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const { showToast } = useAlert();
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<any>(null);
  const [submissionContent, setSubmissionContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [studentSubmission, setStudentSubmission] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);

  const effectiveSchoolId = propSchoolId || currentUser?.schoolId;
  const effectiveClassId = propClassId || currentUser?.classId;
  const isTeacher = currentUser?.schoolRole === 'teacher';
  const isPrincipal = currentUser?.schoolRole === 'school_admin';
  const isStudent = currentUser?.schoolRole === 'student';

  useEffect(() => {
    fetchAssignmentDetail();
  }, [assignmentId, effectiveSchoolId, effectiveClassId]);

  const fetchAssignmentDetail = async () => {
    if (!effectiveSchoolId || !effectiveClassId) {
      setLoading(false);
      return;
    }
    try {
      const classRef = `schools/${effectiveSchoolId}/classes/${effectiveClassId}`;
      const assignmentRef = doc(db, `${classRef}/assignments`, assignmentId);
      const snap = await getDoc(assignmentRef);
      
      if (snap.exists()) {
        setAssignment({ id: snap.id, ...snap.data() });
        
        // If student, check if they already submitted
        if (isStudent) {
          const subQ = query(
            collection(db, `${classRef}/assignments/${assignmentId}/submissions`),
            where("studentId", "==", currentUser?.uid)
          );
          const subSnap = await getDocs(subQ);
          if (!subSnap.empty) {
            setHasSubmitted(true);
            setSubmissionContent(subSnap.docs[0].data().content);
            setStudentSubmission({ id: subSnap.docs[0].id, ...subSnap.docs[0].data() });
          }
        } else {
          // If teacher, fetch all submissions
          const subsQ = query(
            collection(db, `${classRef}/assignments/${assignmentId}/submissions`),
            orderBy("submittedAt", "desc"),
            limit(50)
          );
          const subsSnap = await getDocs(subsQ);
          setSubmissions(subsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      }
    } catch (error) {
      console.error("Error fetching assignment:", error);
      showToast({ message: "Failed to load assignment", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!submissionContent.trim()) return;
    if (!effectiveSchoolId || !effectiveClassId || !currentUser) return;

    setIsSubmitting(true);
    try {
      const classRef = `schools/${effectiveSchoolId}/classes/${effectiveClassId}`;
      const subCollectionRef = collection(db, `${classRef}/assignments/${assignmentId}/submissions`);
      
      // Calculate word count
      const wordCount = submissionContent.trim().split(/\s+/).filter(Boolean).length;

      // 1. Create Submission
      await addDoc(subCollectionRef, {
        authorId: currentUser.uid,
        studentId: currentUser.uid,
        studentName: currentUser.displayName,
        title: assignment?.title || 'Submission',
        content: submissionContent.trim(),
        wordCount: wordCount,
        visibility: 'public',
        teacherApproved: false,
        teacherFeedback: '',
        submittedAt: serverTimestamp(),
        schoolId: effectiveSchoolId,
        classId: effectiveClassId,
        assignmentId: assignmentId,
        assignmentTitle: assignment?.title || 'Work',
        reactions: {},
        commentCount: 0
      });

      // 2. Update submission count on assignment
      await updateDoc(doc(db, `${classRef}/assignments`, assignmentId), {
        submissionCount: increment(1)
      });

      // 3. Update Student Stats on User Doc - Blueprint Item: Teacher Management
      const studentRef = doc(db, "users", currentUser.uid);
      await updateDoc(studentRef, {
        "schoolStats.submissionCount": increment(1),
        "schoolStats.totalWordCount": increment(wordCount),
        "schoolStats.lastSubmittedAt": serverTimestamp()
      });

      // 4. Update School Stats (Principal Oversight)
      const schoolRefDoc = doc(db, "schools", effectiveSchoolId);
      await updateDoc(schoolRefDoc, {
        "stats.totalWordCount": increment(wordCount)
      });

      setHasSubmitted(true);
      Alert.alert("Submitted!", "Your assignment has been sent to your teacher.");
      navigation.goBack();
    } catch (error) {
      console.error("Error submitting assignment:", error);
      Alert.alert("Error", "Failed to submit assignment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublishGlobally = async () => {
    if (!studentSubmission || !currentUser) return;
    
    Alert.alert(
      "Publish Globally?",
      "Your teacher has approved this work! Publishing will make it visible to the entire NovlNest community. Proceed?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Publish", 
          onPress: async () => {
            setIsSubmitting(true);
            try {
              // 1. Create Global Novel
              await addDoc(collection(db, "novels"), {
                title: studentSubmission.title || assignment?.title || "My Story",
                authorId: currentUser.uid,
                authorName: currentUser.displayName,
                summary: `School project from ${currentUser.institutionName}`,
                content: studentSubmission.content,
                genres: ["Fiction"], // Default
                published: true,
                createdAt: serverTimestamp(),
                schoolId: effectiveSchoolId, // Maintain link to school
                isGraduated: true, // Internal flag
                views: 0,
                likes: 0,
                commentCount: 0
              });

              // 2. Update Submission
              const classRef = `schools/${effectiveSchoolId}/classes/${effectiveClassId}`;
              const subRef = doc(db, `${classRef}/assignments/${assignmentId}/submissions`, studentSubmission.id);
              await updateDoc(subRef, {
                globallyPublished: true,
                publishedAt: serverTimestamp()
              });

              setStudentSubmission((prev: any) => ({ ...prev, globallyPublished: true }));
              showToast({ message: "Congratulations! Your work is now live globally.", type: 'success' });
            } catch (error) {
              console.error("Global publish error:", error);
              Alert.alert("Error", "Failed to publish globally.");
            } finally {
              setIsSubmitting(false);
            }
          }
        }
      ]
    );
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
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>{assignment?.title}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            Posted by {assignment?.teacherName}
          </Text>
        </View>

        <View style={styles.contentSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Instructions</Text>
          <Text style={[styles.description, { color: colors.text }]}>{assignment?.description}</Text>
        </View>

        {isStudent && !hasSubmitted && (
          <View style={styles.submissionSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Response</Text>
            <TextInput
              style={[styles.editor, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Start writing here..."
              placeholderTextColor={colors.textSecondary}
              multiline
              value={submissionContent}
              onChangeText={setSubmissionContent}
              textAlignVertical="top"
            />
            <TouchableOpacity 
              style={[styles.submitButton, { backgroundColor: colors.primary }]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Submit Assignment</Text>}
            </TouchableOpacity>
          </View>
        )}

        {hasSubmitted && isStudent && (
          <View style={styles.submissionSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Response</Text>
            <View style={[styles.submittedResponseCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.submittedResponseText, { color: colors.text }]}>{submissionContent}</Text>
            </View>

            <View style={styles.submittedBox}>
              <Ionicons name="checkmark-circle" size={36} color={colors.primary} />
              <Text style={[styles.submittedTitle, { color: colors.text }]}>Submission Received</Text>
              <Text style={[styles.submittedText, { color: colors.textSecondary }]}>
                {studentSubmission?.teacherFeedback 
                  ? 'Your teacher has reviewed your work and left notes below.' 
                  : 'Your teacher will review your work soon.'}
              </Text>
              
              {studentSubmission?.teacherFeedback ? (
                <View style={[styles.feedbackBox, { backgroundColor: colors.background, borderColor: colors.primary }]}>
                  <Text style={[styles.feedbackLabel, { color: colors.primary }]}>Teacher Feedback</Text>
                  <Text style={[styles.feedbackText, { color: colors.text }]}>{studentSubmission.teacherFeedback}</Text>
                </View>
              ) : null}

              {/* Graduation Flow - Blueprint Item: Moderated Growth */}
              {studentSubmission?.teacherApproved && !studentSubmission?.globallyPublished && (
                <TouchableOpacity
                  style={[styles.publishButton, { backgroundColor: colors.success }]}
                  onPress={handlePublishGlobally}
                  disabled={isSubmitting}
                >
                  <Ionicons name="globe-outline" size={20} color="#fff" />
                  <Text style={styles.publishButtonText}>Publish Globally</Text>
                </TouchableOpacity>
              )}

              {studentSubmission?.globallyPublished && (
                <View style={[styles.publishedBadge, { backgroundColor: colors.success + '15' }]}>
                  <Ionicons name="globe" size={16} color={colors.success} />
                  <Text style={[styles.publishedBadgeText, { color: colors.success }]}>Published Globally</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {(isTeacher || isPrincipal) && (
          <View style={styles.teacherView}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Submissions ({submissions.length})</Text>
            {submissions.map(sub => (
              <TouchableOpacity 
                key={sub.id} 
                style={[styles.subCard, { backgroundColor: colors.surface }]}
                onPress={() => navigation.navigate('SubmissionReview', {
                  submissionId: sub.id,
                  assignmentId: assignmentId,
                  classId: effectiveClassId,
                  schoolId: effectiveSchoolId
                })}
              >
                <Text style={[styles.subStudent, { color: colors.text }]}>{sub.studentName}</Text>
                <Text style={[styles.subDate, { color: colors.textSecondary }]}>
                  Submitted: {sub.submittedAt?.toDate().toLocaleDateString()}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  meta: {
    fontSize: 14,
  },
  contentSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  submissionSection: {
    marginTop: 10,
  },
  editor: {
    minHeight: 300,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  submitButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  submittedBox: {
    alignItems: 'center',
    padding: 30,
    marginTop: 24,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
  },
  submittedResponseCard: {
    padding: 20,
    borderRadius: 16,
    minHeight: 150,
  },
  submittedResponseText: {
    fontSize: 16,
    lineHeight: 24,
  },
  submittedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
  },
  submittedText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  feedbackBox: {
    width: '100%',
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 16,
  },
  feedbackLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  feedbackText: {
    fontSize: 16,
    lineHeight: 24,
  },
  teacherView: {
    marginTop: 10,
  },
  subCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  subStudent: {
    flex: 1,
    fontWeight: '600',
    fontSize: 15,
  },
  subDate: {
    fontSize: 12,
    marginRight: 10,
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
    width: '100%',
  },
  publishButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  publishedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 16,
    gap: 6,
  },
  publishedBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
});

export default AssignmentDetailScreen;
