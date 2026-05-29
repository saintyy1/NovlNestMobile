import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase/config';
import {
  collection,
  query,
  getDocs,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

export const ClassManagement = () => {
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);

  const isTeacher = currentUser?.schoolRole === 'teacher';
  const isPrincipal = currentUser?.schoolRole === 'school_admin';

  useEffect(() => {
    if (!currentUser?.schoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let q;
    if (isTeacher) {
      q = query(
        collection(db, `schools/${currentUser.schoolId}/classes`),
        where("teacherId", "==", currentUser.uid),
        where("isArchived", "==", false)
      );
    } else {
      q = query(
        collection(db, `schools/${currentUser.schoolId}/classes`),
        where("isArchived", "==", false)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const classList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClasses(classList);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to classes:", error);
      setLoading(false);
    });

    if (isPrincipal) {
      fetchTeachers();
    }

    return () => unsubscribe();
  }, [currentUser?.schoolId, isTeacher, isPrincipal, currentUser?.uid]);

  const fetchTeachers = async () => {
    if (!currentUser?.schoolId) return;
    try {
      const teachersQ = query(
        collection(db, "users"),
        where("schoolId", "==", currentUser.schoolId),
        where("schoolRole", "==", "teacher")
      );
      const teachersSnap = await getDocs(teachersQ);
      const teachersList = teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTeachers(teachersList);
    } catch (error) {
      console.error("Error fetching teachers:", error);
    }
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim()) {
      Alert.alert("Required", "Please enter a class name.");
      return;
    }
    if (!currentUser?.schoolId) return;

    setLoading(true);
    try {
      const brand = currentUser.institutionName?.substring(0, 3).toUpperCase() || 'SCH';
      const cleanParts = newClassName.trim().toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
      const shortParts = cleanParts.map((part, index) => {
        if (index === 0) return part.substring(0, 5); // Keep first word up to 5
        return part.substring(0, 3); // Truncate others to 3
      });
      const classId = shortParts.join('-').substring(0, 12);

      const teacherId = isTeacher ? currentUser.uid : selectedTeacherId;
      const teacherName = isTeacher
        ? (currentUser.displayName || 'Teacher')
        : (teachers.find(t => t.id === selectedTeacherId)?.displayName || 'Unassigned');

      const studentCode = `${brand}-${classId}`;
      const classRef = doc(db, `schools/${currentUser.schoolId}/classes`, classId);
      await setDoc(classRef, {
        name: newClassName.trim(),
        teacherId: teacherId || null,
        teacherName: teacherName,
        joinCode: studentCode,
        isArchived: false,
        createdAt: serverTimestamp(),
        schoolId: currentUser.schoolId
      });

      if (teacherId) {
        await updateDoc(doc(db, "users", teacherId), {
          classId: classId
        });
      }

      const codeRef = doc(db, "inviteCodes", studentCode);
      await setDoc(codeRef, {
        schoolPath: `schools/${currentUser.schoolId}`,
        classId: classId,
        role: 'student',
        isActive: true,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        institutionName: currentUser.institutionName || 'My School',
        usageCount: 0,
      });

      setShowCreateModal(false);
      setNewClassName('');
      setSelectedTeacherId(null);
      Alert.alert("Success", `Class ${newClassName} created successfully.`);
    } catch (error) {
      console.error("Error creating class:", error);
      Alert.alert("Error", "Failed to create class. It might already exist.");
    } finally {
      setLoading(false);
    }
  };

  const renderClassItem = ({ item }: any) => (
    <TouchableOpacity
      style={[styles.classCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => navigation.navigate('ClassroomStream', {
        classId: item.id,
        className: item.name,
        schoolId: item.schoolId || currentUser?.schoolId
      })}
    >
      <View style={[styles.classIcon, { backgroundColor: colors.primary + '20' }]}>
        <Ionicons name="school-outline" size={24} color={colors.primary} />
      </View>
      <View style={styles.classInfo}>
        <Text style={[styles.className, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.classTeacher, { color: colors.textSecondary }]}>
          {isTeacher ? "Your Classroom" : `Teacher: ${item.teacherName || 'Unassigned'}`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Classrooms</Text>
        {(isTeacher || isPrincipal) && (
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add-outline" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Add Class</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && classes.length === 0 ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={classes}
          renderItem={renderClassItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="business-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No classes created</Text>
            </View>
          }
        />
      )}

      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Classroom</Text>

            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Class Name (e.g. JSS1)"
              placeholderTextColor={colors.textSecondary}
              value={newClassName}
              onChangeText={setNewClassName}
              autoCapitalize="characters"
            />

            {isPrincipal && teachers.length > 0 && (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Assign Teacher</Text>
                <ScrollView style={styles.teacherList}>
                  {teachers.map(teacher => (
                    <TouchableOpacity
                      key={teacher.id}
                      style={[
                        styles.teacherItem,
                        { borderColor: colors.border },
                        selectedTeacherId === teacher.id && { backgroundColor: colors.primary + '20', borderColor: colors.primary }
                      ]}
                      onPress={() => setSelectedTeacherId(teacher.id)}
                    >
                      <Text style={[styles.teacherName, { color: colors.text }]}>{teacher.displayName}</Text>
                      {selectedTeacherId === teacher.id && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: colors.primary }]}
                onPress={handleCreateClass}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
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
    marginLeft: 4,
  },
  listContainer: {
    paddingBottom: 20,
  },
  classCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  classIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  classTeacher: {
    fontSize: 13,
    marginTop: 2,
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
    maxHeight: '80%',
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
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    marginBottom: 10,
    fontWeight: '600',
  },
  teacherList: {
    maxHeight: 200,
    marginBottom: 20,
  },
  teacherItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  teacherName: {
    fontSize: 15,
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
  },
});
