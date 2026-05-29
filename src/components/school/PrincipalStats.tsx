import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Switch,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../../firebase/config';
import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../contexts/AlertContext';

const { width } = Dimensions.get('window');

export const PrincipalStats = () => {
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const { showToast } = useAlert();
  const [loading, setLoading] = useState(true);
  const [schoolData, setSchoolData] = useState<any>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!currentUser?.schoolId) return;

    const schoolRef = doc(db, "schools", currentUser.schoolId);
    const unsubscribe = onSnapshot(schoolRef, (docSnap) => {
      if (docSnap.exists()) {
        setSchoolData(docSnap.data());
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching school stats:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser?.schoolId]);

  const toggleFocusedMode = async () => {
    if (!currentUser?.schoolId) return;
    setUpdating(true);
    try {
      const schoolRef = doc(db, "schools", currentUser.schoolId);
      const newValue = !schoolData?.focusedMode;
      await updateDoc(schoolRef, {
        focusedMode: newValue
      });
      showToast({ 
        message: newValue ? "Focused Mode Active: Global content hidden" : "Focused Mode Disabled", 
        type: newValue ? 'warning' : 'success' 
      });
    } catch (e) {
      showToast({ message: "Failed to update settings", type: 'error' });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  const stats = [
    {
      label: 'Total Words',
      value: (schoolData?.stats?.totalWordCount || 0).toLocaleString(),
      icon: 'text-box-multiple-outline',
      color: '#6366F1',
      iconType: 'material'
    },
    {
      label: 'Submissions',
      value: (schoolData?.stats?.totalSubmissions || 0).toLocaleString(),
      icon: 'document-text-outline',
      color: '#10B981',
      iconType: 'ionicons'
    },
    {
      label: 'Students',
      value: (schoolData?.stats?.studentCount || 0).toLocaleString(),
      icon: 'people-outline',
      color: '#F59E0B',
      iconType: 'ionicons'
    },
    {
      label: 'Staff',
      value: (schoolData?.stats?.teacherCount || 0).toLocaleString(),
      icon: 'school-outline',
      color: '#EC4899',
      iconType: 'ionicons'
    }
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{schoolData?.name || 'Institutional Overview'}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Analytics & Control</Text>
      </View>
      <View style={styles.statsGrid}>
        {stats.map((stat, index) => (
          <View 
            key={index} 
            style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={[styles.iconBox, { backgroundColor: stat.color + '15' }]}>
              {stat.iconType === 'material' ? (
                <MaterialCommunityIcons name={stat.icon as any} size={24} color={stat.color} />
              ) : (
                <Ionicons name={stat.icon as any} size={24} color={stat.color} />
              )}
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.insightCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '20' }]}>
        <Ionicons name="trending-up" size={24} color={colors.primary} />
        <View style={styles.insightContent}>
          <Text style={[styles.insightTitle, { color: colors.text }]}>Writing Growth</Text>
          <Text style={[styles.insightText, { color: colors.textSecondary }]}>
            Your students have authored {schoolData?.stats?.totalWordCount || 0} words across all classes. 
            Keep encouraging them to publish!
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  loadingContainer: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  header: {
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: (width - 40 - 12) / 2,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  insightCard: {
    marginTop: 20,
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
    alignItems: 'center',
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  insightText: {
    fontSize: 13,
    lineHeight: 18,
  },
  safetyCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  safetyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  safetyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  safetyDesc: {
    fontSize: 12,
    marginTop: 2,
  },
});
