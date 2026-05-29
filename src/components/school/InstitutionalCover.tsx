import React from 'react';
import { View, Text, StyleSheet, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';

interface InstitutionalCoverProps {
  schoolName: string;
  assignmentTitle: string;
  studentName: string;
  className: string;
  width?: number;
  height?: number;
}

export const InstitutionalCover = ({
  schoolName,
  assignmentTitle,
  studentName,
  className,
  width = 140,
  height = 200,
}: InstitutionalCoverProps) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { width, height }]}>
      <LinearGradient
        colors={[colors.primary, '#2D1B69']}
        style={styles.gradient}
      >
        <View style={styles.overlay}>
          <Text style={styles.schoolTag}>{schoolName}</Text>
          
          <View style={styles.centerContent}>
            <Text style={styles.title} numberOfLines={3}>{assignmentTitle}</Text>
            <View style={styles.divider} />
            <Text style={styles.studentName}>{studentName}</Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.classTag}>{className}</Text>
            <Text style={styles.brandText}>NovlNest Institutional</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  gradient: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  schoolTag: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  centerContent: {
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  divider: {
    width: 30,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginVertical: 8,
  },
  studentName: {
    color: '#fff',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
  },
  classTag: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
  },
  brandText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
});
