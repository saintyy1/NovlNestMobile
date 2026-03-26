import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface ClassicsBadgeProps {
  style?: any;
}

const ClassicsBadge: React.FC<ClassicsBadgeProps> = ({ style }) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.badge, style, { backgroundColor: colors.primary }]}>
      <Ionicons name="ribbon-outline" size={12} color="#fff" />
      <Text style={styles.text}>Public Domain Classic</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'center',
    gap: 4,
  },
  text: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default ClassicsBadge;
