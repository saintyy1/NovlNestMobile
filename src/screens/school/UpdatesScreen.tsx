import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AnnouncementsList } from '../../components/school/AnnouncementsList';
import { SchoolHeader } from '../../components/school/SchoolHeader';
import { useTheme } from '../../contexts/ThemeContext';

export const UpdatesScreen = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SchoolHeader title="Class Updates" />
      <View style={styles.content}>
        <AnnouncementsList />
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
