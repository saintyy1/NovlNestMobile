import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase/config';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

export const StudentList = ({ classId: propClassId, schoolId: propSchoolId }: { classId?: string, schoolId?: string }) => {
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<any[]>([]);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [activeInviteCode, setActiveInviteCode] = useState<string | null>(null);

  const effectiveClassId = propClassId || currentUser?.classId;
  const effectiveSchoolId = propSchoolId || currentUser?.schoolId;
  const isTeacher = currentUser?.schoolRole === 'teacher';
  const isPrincipal = currentUser?.schoolRole === 'school_admin';

  useEffect(() => {
    if (!effectiveSchoolId) {
      setLoading(false);
      return;
    }

    // Principal sees all students, Teachers see their specific class
    if (!isPrincipal && !effectiveClassId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let q;
    if (effectiveClassId) {
      q = query(
        collection(db, "users"),
        where("schoolId", "==", effectiveSchoolId),
        where("classId", "==", effectiveClassId),
        where("schoolRole", "==", "student")
      );
    } else if (isPrincipal) {
      q = query(
        collection(db, "users"),
        where("schoolId", "==", effectiveSchoolId),
        where("schoolRole", "==", "student")
      );
    } else {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const studentList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStudents(studentList);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to students:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser?.schoolId, effectiveClassId, isPrincipal]);

  useEffect(() => {
    if (!currentUser?.schoolId || !effectiveClassId || (!isTeacher && !isPrincipal)) return;

    const brand = currentUser.institutionName?.substring(0, 3).toUpperCase() || 'SCH';
    const code = `${brand}-${effectiveClassId.toUpperCase()}`;
    const codeRef = doc(db, "inviteCodes", code);

    const unsub = onSnapshot(codeRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().isActive) {
        setActiveInviteCode(code);
      } else {
        setActiveInviteCode(null);
      }
    }, (err) => {
      console.error("Error watching invite code:", err);
    });

    return () => unsub();
  }, [currentUser?.schoolId, effectiveClassId, isTeacher, isPrincipal]);

  const generateStudentCode = async () => {
    if (!currentUser || !effectiveSchoolId || !effectiveClassId) {
      Alert.alert("Class Required", "Please ensure you are assigned to a class before inviting students.");
      return;
    }
    setGeneratingCode(true);
    try {
      const brand = currentUser.institutionName?.substring(0, 3).toUpperCase() || 'SCH';
      const code = `${brand}-${effectiveClassId.toUpperCase()}`;

      const codeRef = doc(db, "inviteCodes", code);
      await setDoc(codeRef, {
        schoolPath: `schools/${currentUser.schoolId}`,
        classId: effectiveClassId,
        role: 'student',
        isActive: true,
        usageCount: 0,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        institutionName: currentUser.institutionName || 'My School'
      }, { merge: true });

      Alert.alert(
        "Student Code Generated",
        `Share this code with your students for ${effectiveClassId}:\n\n${code}`,
        [
          {
            text: "Copy Code", onPress: () => {
              Clipboard.setString(code);
              Alert.alert("Copied!", "Code copied to clipboard.");
            }
          },
          { text: "Done" }
        ]
      );
    } catch (error) {
      console.error("Error generating student code:", error);
      Alert.alert("Error", "Failed to generate invite code.");
    } finally {
      setGeneratingCode(false);
    }
  };

  const renderStudentItem = ({ item }: any) => (
    <View style={[styles.studentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.avatar, { backgroundColor: colors.primary + '15' }]}>
        <Text style={[styles.avatarText, { color: colors.primary }]}>
          {(item.displayName || 'S').charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.studentInfo}>
        <Text style={[styles.studentName, { color: colors.text }]}>
          {item.displayName || 'Unknown Student'}
        </Text>
        <Text style={[styles.studentDetail, { color: colors.textSecondary }]}>
          {item.classId || 'No Class'} • Student
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Class Roster</Text>
        {(isTeacher || isPrincipal) && effectiveClassId && (
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={generateStudentCode}
            disabled={generatingCode}
          >
            {generatingCode ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name={activeInviteCode ? "refresh-outline" : "person-add-outline"} size={18} color="#fff" />
                <Text style={styles.addButtonText}>
                  {activeInviteCode ? "Invite Code" : "Invite Student"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {loading && students.length === 0 ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={students}
          renderItem={renderStudentItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            activeInviteCode ? (
              <View style={[styles.codeCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
                <View style={styles.codeInfo}>
                  <Text style={[styles.codeLabel, { color: colors.textSecondary }]}>CLASS INVITE CODE</Text>
                  <Text style={[styles.codeValue, { color: colors.text }]}>{activeInviteCode}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.copyButton, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    Clipboard.setString(activeInviteCode);
                    Alert.alert("Copied!", "Invite code copied.");
                  }}
                >
                  <Ionicons name="copy-outline" size={18} color="#fff" />
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color={colors.textSecondary} style={{ opacity: 0.5 }} />
              <Text style={[styles.emptyText, { color: colors.text }]}>No students joined yet</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                {isPrincipal
                  ? "Teachers haven't added students to their classes yet."
                  : "Share the code above with your students to get started!"}
              </Text>
            </View>
          }
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
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 6,
  },
  listContent: {
    paddingBottom: 40,
  },
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
    borderStyle: 'dashed',
  },
  codeInfo: {
    flex: 1,
  },
  codeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  codeValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
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
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '600',
  },
  studentDetail: {
    fontSize: 12,
  },
  manageButton: {
    padding: 8,
  },
});
