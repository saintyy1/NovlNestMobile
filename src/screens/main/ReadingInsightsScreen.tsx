import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Dimensions,
  Animated,
  Easing,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getUserReadingStats } from '../../services/readingAnalyticsService';
import { scheduleStreakReminder } from '../../services/localNotificationService';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import CachedImage from '../../components/CachedImage';

const { width } = Dimensions.get('window');

// Bento Box dimensions
const BENTO_PADDING = 16;
const BENTO_SPACING = 14;
const CARD_WIDTH_HALF = (width - BENTO_PADDING * 2 - BENTO_SPACING) / 2;
const ACCENT_ORANGE = '#FF5A00';

const ACHIEVEMENTS = [
  {
    id: 'spark',
    name: 'Spark Ignited',
    threshold: 2,
    type: 'streak',
    icon: 'flame',
    size: 18,
    desc: 'Ignite your reading habit by completing a 2-day streak.'
  },
  {
    id: 'fire',
    name: 'On Fire',
    threshold: 7,
    type: 'streak',
    icon: 'flame',
    size: 24,
    desc: 'You’re building momentum! Keep it going for 7 consecutive days.'
  },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    threshold: 30,
    type: 'streak',
    icon: 'flame',
    size: 30,
    desc: 'Legendary status. Maintain your consistency for 30 days.'
  },
  {
    id: 'explorer',
    name: 'Explorer',
    threshold: 3,
    type: 'books',
    icon: 'book',
    size: 22,
    desc: 'Feed your curiosity by reading at least 3 different books or poems.'
  },
];

export const ReadingInsightsScreen = ({ navigation }: any) => {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const { currentUser } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [selectedAchievement, setSelectedAchievement] = useState<any | null>(null);

  // Animation values
  const loadAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const fetchStats = useCallback(async () => {
    if (!currentUser?.uid) return;
    try {
      const data = await getUserReadingStats(currentUser.uid);
      setStats(data);

      // Check and schedule streak reminder if user has zero progress today
      if (data && data.streak > 0 && data.todayMinutes === 0) {
        scheduleStreakReminder();
      }
    } catch (error) {
      console.error('[ReadingInsights] Error fetching stats:', error);
    } finally {
      setLoading(false);
      // Trigger cascade animations
      Animated.timing(loadAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
        easing: Easing.out(Easing.exp)
      }).start();

      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 1200,
        delay: 200,
        useNativeDriver: false,
        easing: Easing.out(Easing.cubic)
      }).start();
    }
  }, [currentUser?.uid, loadAnim, progressAnim]);

  const maxMinutes = stats?.bookStats?.length > 0
    ? Math.max(...stats.bookStats.map((b: any) => b.minutes))
    : 1;

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h} h ${m} m`;
    if (h > 0) return `${h} h`;
    return `${m} m`;
  };

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!stats) return null;

  let dynamicGoal = 60;
  let motivationalFocus = "Today's Focus";

  if (stats.todayMinutes >= 120) {
    dynamicGoal = 120; // Cap at 2 hours
    motivationalFocus = "You’ve hit today’s goal 🎉\nKeep going if you’d like 🔥";
  } else if (stats.todayMinutes >= 60) {
    dynamicGoal = 120; // 2 hrs
    motivationalFocus = "Goal Crushed! 🎯";
  }

  const rawProgress = Math.min(stats.todayMinutes / dynamicGoal, 1);
  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', `${rawProgress * 100}%`]
  });

  const maxWeeklyMinutes = Math.max(...stats.dailyHistory.map((d: any) => d.minutes), 30);

  // Vibrant accent colors
  const ACCENT_RED = '#FF5252';
  const ACCENT_BLUE = '#448AFF';
  const ACCENT_ORANGE = '#FF9100';
  const ACCENT_GREEN = '#00E676';

  const cardBgDefault = colors.surface;
  const cardBorderDefault = colors.border;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Insights</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => fetchStats()}>
          <Ionicons name="sync" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: loadAnim, transform: [{ translateY: loadAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>

          {/* Immersive Hero Section */}
          <View style={styles.heroWrapper}>
            <View style={styles.heroBgRing}>
              <Ionicons name="flame" size={240} color={`${ACCENT_ORANGE}10`} />
            </View>
            <View style={styles.heroContent}>
              <Text style={[styles.heroEditorialLabel, { color: colors.textSecondary }]}>
                {stats.todayMinutes >= dynamicGoal ? "Daily Goal Reached 🏆" : motivationalFocus}
              </Text>
              <View style={styles.heroMainRow}>
                <Text style={[styles.heroMassiveTime, { color: colors.text }]}>
                  {stats.todayMinutes < 60 ? `${stats.todayMinutes}` : Math.floor(stats.todayMinutes / 60)}
                </Text>
                <View>
                  <Text style={[styles.heroUnitLabel, { color: colors.text }]}>
                    {stats.todayMinutes < 60 ? "MIN" : "HRS"}
                  </Text>
                  {stats.todayMinutes >= 60 && (
                    <Text style={[styles.heroSubUnitLabel, { color: colors.textSecondary }]}>
                      {stats.todayMinutes % 60}m today
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.heroProgressBanner}>
                <View style={styles.heroProgressBarTrack}>
                  <Animated.View
                    style={[
                      styles.heroProgressBarFill,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', `${Math.min((stats.todayMinutes / dynamicGoal) * 100, 100)}%`]
                        }),
                        backgroundColor: stats.todayMinutes >= dynamicGoal ? ACCENT_ORANGE : colors.primary
                      }
                    ]}
                  />
                </View>
                <Text style={[styles.heroGoalMeta, { color: colors.textSecondary }]}>
                  {stats.todayMinutes}m / {dynamicGoal}m goal
                </Text>
              </View>

              <View style={styles.streakStatusRow}>
                <View style={[styles.firePill, { backgroundColor: `${ACCENT_ORANGE}15` }]}>
                  <Ionicons name="flame" size={18} color={ACCENT_ORANGE} />
                  <Text style={[styles.firePillText, { color: ACCENT_ORANGE }]}>{stats.streak}d STREAK</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Minimalist Floating Achievements */}
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.editorialTitle, { color: colors.text }]}>Milestones</Text>
            </View>
            <Text style={[styles.editorialStats, { color: colors.textSecondary }]}>{ACHIEVEMENTS.filter(a => (a.type === 'streak' ? stats.bestStreak >= a.threshold : stats.uniqueBooksCount >= a.threshold)).length}/{ACHIEVEMENTS.length} Earned</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.glassScroll}>
            {ACHIEVEMENTS.map((ach) => {
              const isEarned = ach.type === 'streak' ? stats.bestStreak >= ach.threshold : stats.uniqueBooksCount >= ach.threshold;
              return (
                <TouchableOpacity key={ach.id} style={styles.badgeWrapper} activeOpacity={0.7} onPress={() => setSelectedAchievement(ach)}>
                  <View style={[styles.glassBadge, { backgroundColor: isEarned ? `${ACCENT_ORANGE}15` : colors.border + '20', borderColor: isEarned ? ACCENT_ORANGE : colors.border }]}>
                    <Ionicons name={ach.icon as any} size={ach.size} color={isEarned ? ACCENT_ORANGE : colors.textSecondary} />
                  </View>
                  <Text style={[styles.badgeLabelMinor, { color: isEarned ? colors.text : colors.textSecondary }]}>{ach.name}</Text>
                  {isEarned && <View style={[styles.miniGlow, { backgroundColor: ACCENT_ORANGE }]} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Reading Breakdown Section */}
          {stats.bookStats && stats.bookStats.length > 0 && (
            <View style={styles.breakdownSection}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.editorialTitle, { color: colors.text }]}>Reading by Book</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('BookReadingInsights', { bookStats: stats.bookStats })}
                >
                  <Text style={[styles.seeAllText, { color: ACCENT_ORANGE }]}>See All</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.miniBreakdownList}>
                {stats.bookStats.slice(0, 2).map((item: any, index: number) => {
                  const ratio = item.minutes / maxMinutes;
                  // Scale the bar to a max of 40% of screen width for the preview
                  const barWidth = ratio * (width * 0.4);
                  const barColor = index === 0 ? '#B8A484' : '#1F69A5';

                  return (
                    <View key={item.bookId} style={styles.miniBookRow}>
                      <View style={[styles.miniProgressBar, { width: barWidth, backgroundColor: barColor }]} />
                      <View style={styles.miniRowContent}>
                        <View style={styles.miniCoverContainer}>
                          {item.coverImage ? (
                            <CachedImage uri={item.coverImage} style={styles.miniCover} />
                          ) : (
                            <View style={[styles.miniCover, { backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center' }]}>
                              <Ionicons name="book-outline" size={12} color={colors.textSecondary} />
                            </View>
                          )}
                        </View>
                        <View style={styles.miniDetails}>
                          <Text style={[styles.miniTitle, { color: colors.text }]} numberOfLines={1}>{item.bookTitle}</Text>
                          <Text style={[styles.miniDuration, { color: colors.textSecondary }]}>{formatDuration(item.minutes)}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.breakdownFooter}
                onPress={() => navigation.navigate('BookReadingInsights', { bookStats: stats.bookStats })}
              >
                <Text style={[styles.breakdownFooterText, { color: ACCENT_ORANGE }]}>
                  Explore full breakdown
                </Text>
                <Ionicons name="arrow-forward" size={16} color={ACCENT_ORANGE} />
              </TouchableOpacity>
            </View>
          )}

          {/* Minimalist Peak Chart */}
          <View style={styles.chartWrapper}>
            <View style={styles.chartHeaderMinimal}>
              <View>
                <Text style={[styles.editorialTitle, { color: colors.text }]}>
                  {selectedDayIndex !== null
                    ? `${stats.dailyHistory[selectedDayIndex].dayName}'s Pace`
                    : 'Weekly Pace'}
                </Text>
                <Text style={[styles.badgeLabelMinor, { color: colors.textSecondary }]}>
                  {selectedDayIndex !== null
                    ? `${stats.dailyHistory[selectedDayIndex].minutes} MINUTES READ`
                    : stats.currentWeekLabel}
                </Text>
              </View>
              {selectedDayIndex !== null && (
                <TouchableOpacity onPress={() => setSelectedDayIndex(null)}>
                  <Ionicons name="close-circle-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.graphicChart}>
              {stats.dailyHistory.map((day: any, i: number) => {
                const ratio = day.minutes / maxWeeklyMinutes;
                const isSelected = selectedDayIndex === i;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.graphicColumn, { opacity: selectedDayIndex !== null && !isSelected ? 0.4 : 1 }]}
                    onPress={() => setSelectedDayIndex(isSelected ? null : i)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.graphicBarBg}>
                      <Animated.View
                        style={[
                          styles.graphicBarFill,
                          {
                            backgroundColor: isSelected || (selectedDayIndex === null && day.isToday) ? ACCENT_ORANGE : colors.border,
                            height: progressAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0%', day.isFuture ? '0%' : `${Math.max(ratio * 100, 8)}%`]
                            }),
                            opacity: day.isFuture ? 0 : 1
                          }
                        ]}
                      />
                    </View>
                    <Text style={[styles.graphicLabel, { color: isSelected || (selectedDayIndex === null && day.isToday) ? ACCENT_ORANGE : colors.textSecondary }]}>
                      {day.dayName[0]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>



          {/* Editorial Pattern Cards (2x2 Grid) */}
          <View style={styles.patternGrid}>
            <View style={styles.patternBox}>
              <Text style={styles.editorialMinorLabel}>PEAK READING DAY</Text>
              <Text style={[styles.patternValue, { color: colors.text }]}>{stats.mostActiveDay || "N/A"}</Text>
            </View>
            <View style={styles.patternBox}>
              <Text style={styles.editorialMinorLabel}>DAILY PACE</Text>
              <Text style={[styles.patternValue, { color: colors.text }]}>{stats.dailyAverageMinutes}m</Text>
            </View>
            <View style={styles.patternRowSpacing} />
            <View style={styles.patternBox}>
              <Text style={styles.editorialMinorLabel}>THIS WEEK TOTAL</Text>
              <Text style={[styles.patternValue, { color: colors.text }]}>
                {stats.currentCalendarWeekMinutes < 60 ? `${stats.currentCalendarWeekMinutes}m` : `${Math.floor(stats.currentCalendarWeekMinutes / 60)}h ${stats.currentCalendarWeekMinutes % 60}m`}
              </Text>
            </View>
            <View style={styles.patternBox}>
              <Text style={styles.editorialMinorLabel}>LONGEST SIT</Text>
              <View>
                <Text style={[styles.patternValue, { color: colors.text }]}>
                  {stats.longestSessionStats?.minutes || 0}m
                </Text>
                {stats.longestSessionStats?.date && (
                  <Text style={styles.recordDate}>{stats.longestSessionStats.date}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Minimalist Notion-style Log */}
          {stats.historicalWeeks && stats.historicalWeeks.length > 0 && (
            <View style={styles.editorialHistory}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.editorialTitle, { color: colors.text }]}>Top Records</Text>
              </View>
              {stats.historicalWeeks.slice(0, 3).map((week: any, idx: number) => (
                <View key={idx} style={styles.notionRow}>
                  <View style={styles.notionBullet} />
                  <Text style={[styles.notionText, { color: colors.text }]}>{week.id}</Text>
                  <Text style={[styles.notionValue, { color: colors.textSecondary }]}>
                    {week.minutes < 60 ? `${week.minutes}m` : `${Math.floor(week.minutes / 60)}h ${week.minutes % 60}m`}
                  </Text>
                </View>
              ))}

              {stats.historicalWeeks.length > 3 && (
                <TouchableOpacity
                  style={styles.seeMoreButton}
                  onPress={() => setShowHistoryModal(true)}
                >
                  <Text style={[styles.seeMoreButtonText, { color: ACCENT_ORANGE }]}>See older records</Text>
                  <Ionicons name="arrow-forward" size={16} color={ACCENT_ORANGE} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </Animated.View>
      </ScrollView>

      {/* History Modal */}
      <Modal
        visible={showHistoryModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowHistoryModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>All History</Text>
            <TouchableOpacity onPress={() => setShowHistoryModal(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {stats?.historicalWeeks?.map((week: any, idx: number) => (
              <View key={idx} style={[styles.historyRow, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', borderColor: isDark ? '#333' : '#E5E5E5' }]}>
                <View style={styles.historyRowLeft}>
                  <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} style={{ marginRight: 12 }} />
                  <Text style={[styles.historyRowLabel, { color: colors.text }]}>{week.id}</Text>
                </View>
                <Text style={[styles.historyRowValue, { color: colors.text }]}>
                  {week.minutes < 60 ? `${week.minutes}m` : `${Math.floor(week.minutes / 60)}h ${week.minutes % 60}m`}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Achievement Detail Modal */}
      <Modal
        visible={!!selectedAchievement}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAchievement(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedAchievement(null)}
        >
          <Animated.View style={[styles.achievementPopup, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.popupIconBox, { backgroundColor: `${ACCENT_ORANGE}15` }]}>
              <Ionicons name={selectedAchievement?.icon || 'flame'} size={40} color={ACCENT_ORANGE} />
            </View>
            <Text style={[styles.popupTitle, { color: colors.text }]}>{selectedAchievement?.name}</Text>
            <Text style={[styles.popupDesc, { color: colors.textSecondary }]}>{selectedAchievement?.desc}</Text>

            <View style={[styles.popupProgressRow, { backgroundColor: `${colors.border}20` }]}>
              <View style={styles.popupProgressInfo}>
                <Text style={[styles.popupProgressLabel, { color: colors.textSecondary }]}>PERSONAL BEST</Text>
                <Text style={[styles.popupProgressValue, { color: colors.text }]}>
                  {selectedAchievement?.type === 'streak' ? stats.bestStreak : stats.uniqueBooksCount} / {selectedAchievement?.threshold} {selectedAchievement?.type === 'streak' ? 'days' : 'books'}
                </Text>
                {selectedAchievement?.type === 'streak' && (
                  <Text style={[styles.popupCurrentSubtext, { color: colors.textSecondary }]}>
                    Current Streak: {stats.streak} {stats.streak === 1 ? 'day' : 'days'}
                  </Text>
                )}
              </View>
              <Ionicons
                name={(selectedAchievement?.type === 'streak' ? stats.bestStreak >= selectedAchievement?.threshold : stats.uniqueBooksCount >= selectedAchievement?.threshold) ? "checkmark-circle" : "lock-closed"}
                size={24}
                color={(selectedAchievement?.type === 'streak' ? stats.bestStreak >= selectedAchievement?.threshold : stats.uniqueBooksCount >= selectedAchievement?.threshold) ? ACCENT_ORANGE : colors.textSecondary}
              />
            </View>

            <TouchableOpacity
              style={[styles.popupButton, { backgroundColor: ACCENT_ORANGE }]}
              onPress={() => setSelectedAchievement(null)}
            >
              <Text style={styles.popupButtonText}>Got it</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 15,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: 10,
  },
  heroWrapper: {
    paddingVertical: 40,
    alignItems: 'center',
    position: 'relative',
    height: 300,
    justifyContent: 'center',
  },
  heroBgRing: {
    position: 'absolute',
    opacity: 0.8,
  },
  heroContent: {
    alignItems: 'center',
    zIndex: 2,
  },
  heroEditorialLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  heroMainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  heroMassiveTime: {
    fontSize: 100,
    fontWeight: '900',
    letterSpacing: -5,
  },
  heroUnitLabel: {
    fontSize: 20,
    fontWeight: '800',
    marginLeft: 4,
  },
  heroSubUnitLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: -4,
    marginLeft: 4,
  },
  streakStatusRow: {
    marginTop: 24,
  },
  heroProgressBanner: {
    marginTop: 16,
    width: 200,
    alignItems: 'center',
  },
  heroProgressBarTrack: {
    height: 4,
    width: '100%',
    backgroundColor: '#8E8E9320',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  heroProgressBarFill: {
    height: '100%',
  },
  heroGoalMeta: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  firePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
    gap: 8,
  },
  firePillText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  editorialTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  editorialStats: {
    fontSize: 13,
    fontWeight: '600',
  },
  glassScroll: {
    paddingLeft: 10,
    paddingBottom: 24,
    gap: 16,
  },
  badgeWrapper: {
    alignItems: 'center',
    width: 80,
  },
  glassBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  badgeLabelMinor: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  miniGlow: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  chartWrapper: {
    marginTop: 10,
    marginBottom: 40,
    paddingHorizontal: 10,
  },
  chartHeaderMinimal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  graphicChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
  },
  graphicColumn: {
    alignItems: 'center',
    flex: 1,
  },
  graphicBarBg: {
    height: 100,
    width: 8,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  graphicBarFill: {
    width: 8,
    borderRadius: 4,
  },
  graphicLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  patternGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 40,
  },
  patternBox: {
    width: '48%',
  },
  patternRowSpacing: {
    width: '100%',
    height: 24,
  },
  editorialMinorLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8E8E93',
    letterSpacing: 1,
    marginBottom: 4,
  },
  patternValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  recordDate: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  editorialHistory: {
    paddingHorizontal: 10,
    marginBottom: 40,
  },
  notionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#8E8E9320',
  },
  notionBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF5A00',
    marginRight: 16,
  },
  notionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  notionValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  seeMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
    gap: 8,
  },
  seeMoreButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  breakdownSection: {
    paddingTop: 10,
    paddingHorizontal: 10,
    marginBottom: 40,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '700',
  },
  breakdownFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    gap: 8,
  },
  breakdownFooterText: {
    fontSize: 14,
    fontWeight: '700',
  },
  miniBreakdownList: {
    marginTop: 8,
    marginBottom: 8,
  },
  miniBookRow: {
    flexDirection: 'row',
    height: 48,
    alignItems: 'center',
    marginBottom: 8,
  },
  miniProgressBar: {
    height: '100%',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    opacity: 0.6,
  },
  miniRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    flex: 1,
  },
  miniCoverContainer: {
    width: 32,
    height: 44,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  miniCover: {
    width: '100%',
    height: '100%',
  },
  miniDetails: {
    marginLeft: 10,
    flex: 1,
  },
  miniTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  miniDuration: {
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.7,
  },
  modalContainer: {
    flex: 1,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  historyRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyRowLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  historyRowValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    paddingTop: Platform.OS === 'ios' ? 20 : 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalScroll: {
    padding: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000080',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  achievementPopup: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 32,
    borderWidth: 1,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  popupIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  popupTitle: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center',
  },
  popupDesc: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  popupProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: 16,
    borderRadius: 20,
    marginBottom: 24,
  },
  popupProgressInfo: {
    flex: 1,
  },
  popupProgressLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  popupProgressValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  popupCurrentSubtext: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  popupButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  popupButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
