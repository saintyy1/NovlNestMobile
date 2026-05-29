import React from 'react';
import { View, StyleSheet } from 'react-native';
import { StaffManagement } from '../../components/school/StaffManagement';
import { SchoolHeader } from '../../components/school/SchoolHeader';
import { useTheme } from '../../contexts/ThemeContext';

export const StaffScreen = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SchoolHeader title="Staff Management" />
      <View style={styles.content}>
        <StaffManagement />
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
