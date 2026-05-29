import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { StudentList } from '../../components/school/StudentList';
import { SchoolHeader } from '../../components/school/SchoolHeader';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';

export const StudentScreen = () => {
  const { colors } = useTheme();
  const { currentUser } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const isTeacher = currentUser?.schoolRole === 'teacher';
  const isPrincipal = currentUser?.schoolRole === 'school_admin';

  useEffect(() => {
    if ((isTeacher || isPrincipal) && currentUser?.schoolId) {
      fetchClasses();
    }
  }, [currentUser?.schoolId, isTeacher, isPrincipal]);

  const fetchClasses = async () => {
    if (!currentUser?.schoolId) return;
    setLoading(true);
    try {
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
      
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClasses(list);
      if (list.length > 0) {
        setSelectedClassId(list[0].id);
      }
    } catch (error) {
      console.error("Error fetching classes for selector:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SchoolHeader title="Student Roster" />
      
      {classes.length > 1 && (
        <View style={styles.selectorContainer}>
          <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>SELECT CLASS:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorScroll}>
            {classes.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.classChip,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  selectedClassId === c.id && { backgroundColor: colors.primary, borderColor: colors.primary }
                ]}
                onPress={() => setSelectedClassId(c.id)}
              >
                <Text style={[
                  styles.classChipText, 
                  { color: colors.text },
                  selectedClassId === c.id && { color: '#fff' }
                ]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.content}>
        {loading && classes.length === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <StudentList classId={selectedClassId || currentUser?.classId || undefined} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  selectorContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  selectorLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 1,
  },
  selectorScroll: {
    paddingRight: 20,
  },
  classChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 10,
  },
  classChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
    paddingTop: 0,
  },
});
