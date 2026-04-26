import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Dimensions, Animated, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { getUserReadingStats } from '../services/readingAnalyticsService';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { spacing } from '../theme';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

const { width } = Dimensions.get('window');
const ARC_SIZE = width * 0.7;
const ARC_RADIUS = (ARC_SIZE - 24) / 2; // leaving room for stroke
const ARC_CIRCUMFERENCE = Math.PI * ARC_RADIUS;
const AnimatedPath = Animated.createAnimatedComponent(Path);

export const ReadingActivityDashboard = () => {
  const { colors } = useTheme();
  const { currentUser } = useAuth();
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Animated progress
  const progressAnim = useRef(new Animated.Value(0)).current;

  const fetchStats = useCallback(async () => {
    if (!currentUser?.uid) return;
    try {
      const data = await getUserReadingStats(currentUser.uid);
      setStats(data);

      // Animate arc fill
      if (data) {
        let maxGoal = 60;
        if (data.todayMinutes >= 120) maxGoal = 120;
        else if (data.todayMinutes >= 60) maxGoal = 120;

        const p = Math.min(data.todayMinutes / maxGoal, 1);
        Animated.timing(progressAnim, {
          toValue: p,
          duration: 1200,
          delay: 150,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true, // SVG layout handles native driver for setNativeProps automatically via strokeDashoffset
        }).start();
      }
    } catch (error) {
      console.error('[ReadingActivityDashboard] Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid]);

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [fetchStats])
  );

  if (loading && !stats) {
    return (
      <View style={[styles.container, { minHeight: 350, justifyContent: 'center' }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }
  if (!stats) return null;

  let dailyMilestone = 60;
  let congratsMessage = "Make reading a daily habit and track your progress here.";

  if (stats.todayMinutes >= 120) {
    dailyMilestone = 120;
    congratsMessage = "You’ve hit today’s goal 🎉\nKeep going if you’d like 🔥";
  } else if (stats.todayMinutes >= 60) {
    dailyMilestone = 120;
    congratsMessage = "Goal Crushed! 🎯 Next stop: 2 Hours.";
  }

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [ARC_CIRCUMFERENCE, 0]
  });

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>Reading Insights</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {congratsMessage}
      </Text>

      <View style={styles.arcContainer}>
        {/* Genuine Animated SVG Arc */}
        <View style={styles.svgWrapper}>
          <Svg width={ARC_SIZE} height={ARC_SIZE / 2 + 12} viewBox={`0 0 ${ARC_SIZE} ${ARC_SIZE / 2 + 12}`}>
            {/* Background Track */}
            <Path
              d={`M 12 ${ARC_SIZE / 2 + 6} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${ARC_SIZE - 12} ${ARC_SIZE / 2 + 6}`}
              stroke={colors.border}
              strokeWidth={12}
              strokeLinecap="round"
              fill="none"
            />
            {/* Filled Animated Track */}
            <AnimatedPath
              d={`M 12 ${ARC_SIZE / 2 + 6} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${ARC_SIZE - 12} ${ARC_SIZE / 2 + 6}`}
              stroke={colors.primary}
              strokeWidth={12}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={ARC_CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
            />
          </Svg>
        </View>

        <View style={styles.counterContainer}>
          <View style={styles.streakRow}>
            <Ionicons name="flame" size={22} color="#FF5A00" />
            <Text style={[styles.streakValue, { color: "#FF5A00" }]}>
              {stats.streak}
            </Text>
          </View>
          <Text style={[styles.todayLabel, { color: colors.textSecondary }]}>Today's Reading</Text>
          <Text style={[styles.timeValue, { color: colors.text }]}>
            {formatTime(stats.todayMinutes)}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.exploreBtn, { backgroundColor: colors.text }]}
        onPress={() => navigation.navigate('ReadingInsights')}
      >
        <Text style={[styles.exploreBtnText, { color: colors.background }]}>See Reading Insights</Text>
      </TouchableOpacity>
    </View>
  );
};

const formatTime = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}:${m < 10 ? '0' + m : m}`;
  return `0:${m < 10 ? '0' + m : m}`;
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 40,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  arcContainer: {
    width: ARC_SIZE,
    height: ARC_SIZE / 2 + 20,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 30,
  },
  svgWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  counterContainer: {
    alignItems: 'center',
    paddingBottom: 2,
    zIndex: 2,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  streakValue: {
    fontSize: 18,
    fontWeight: '800',

    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  todayLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeValue: {
    fontSize: 72,
    fontWeight: '700',
    letterSpacing: -2,
    lineHeight: 80,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  goalLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  exploreBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 100,
    width: '100%',
    alignItems: 'center',
  },
  exploreBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  gallerySection: {
    width: '100%',
    paddingTop: 30,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    alignItems: 'center',
  },
  galleryTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  placeholderRow: {
    flexDirection: 'row',
    gap: 15,
    marginBottom: 20,
  },
  placeholderCover: {
    width: 80,
    height: 120,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderNum: {
    fontSize: 32,
    fontWeight: '800',
  },
  galleryFooter: {
    fontSize: 13,
    fontWeight: '600',
  },
});
