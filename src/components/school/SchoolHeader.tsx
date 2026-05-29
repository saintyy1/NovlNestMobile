import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigation } from '@react-navigation/native';

interface SchoolHeaderProps {
  title: string;
}

export const SchoolHeader = ({ title }: SchoolHeaderProps) => {
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const navigation = useNavigation<any>();

  return (
    <View style={[styles.header, { backgroundColor: colors.primary }]}>
      <View style={styles.headerTop}>
        <View>
          <Text style={styles.userName}>{currentUser?.displayName || 'Educator'}</Text>
          <Text style={styles.schoolName}>{currentUser?.institutionName || 'My School'}</Text>
          <Text style={styles.titleText}>{title}</Text>
        </View>
        <TouchableOpacity
          style={styles.profileBadge}
          onPress={() => navigation.navigate('Profile', { userId: currentUser?.uid })}
        >
          <Ionicons name="person-circle-outline" size={32} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  schoolName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  titleText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  profileBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
