import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ClassManagement } from '../../components/school/ClassManagement';
import { SchoolHeader } from '../../components/school/SchoolHeader';
import { useTheme } from '../../contexts/ThemeContext';

export const ClassesScreen = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SchoolHeader title="Classes & Sections" />
      <View style={styles.content}>
        <ClassManagement />
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
