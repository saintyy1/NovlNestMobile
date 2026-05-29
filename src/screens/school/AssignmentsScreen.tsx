import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AssignmentList } from '../../components/school/AssignmentList';
import { ClassSetup } from '../../components/school/ClassSetup';
import { SchoolHeader } from '../../components/school/SchoolHeader';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

export const AssignmentsScreen = () => {
  const { colors } = useTheme();
  const { currentUser } = useAuth();
  
  const isTeacher = currentUser?.schoolRole === 'teacher';
  const hasNoClass = isTeacher && !currentUser?.classId;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SchoolHeader title="Class Assignments" />
      <View style={styles.content}>
        {hasNoClass ? (
          <ClassSetup />
        ) : (
          <AssignmentList />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
});
