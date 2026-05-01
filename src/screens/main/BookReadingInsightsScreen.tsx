import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  Platform,
  SafeAreaView,
  StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import CachedImage from '../../components/CachedImage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// A few vibrant colors for the top items
const ACCENT_COLORS = ['#A1A1A1', '#B8A484', '#1F69A5', '#7F3F3F', '#D32F2F', '#1976D2', '#388E3C'];

export const BookReadingInsightsScreen = ({ route, navigation }: any) => {
  const { bookStats } = route.params;
  const { colors, isDark } = useTheme();

  const totalMinutes = useMemo(() => {
    return bookStats.reduce((acc: number, curr: any) => acc + curr.minutes, 0);
  }, [bookStats]);

  const maxMinutes = useMemo(() => {
    if (bookStats.length === 0) return 1;
    return Math.max(...bookStats.map((b: any) => b.minutes));
  }, [bookStats]);

  const earliestDate = useMemo(() => {
    if (bookStats.length === 0) return 'December 2024';
    const dates = bookStats.map((b: any) => new Date(b.lastRead).getTime());
    const minDate = new Date(Math.min(...dates));
    return minDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [bookStats]);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h} h ${m} m`;
    if (h > 0) return `${h} h`;
    return `${m} m`;
  };

  const renderBookItem = (item: any, index: number) => {
    const ratio = item.minutes / maxMinutes;
    // We want the bar to take up to 60% of the screen width to leave room for cover and text
    const barWidth = ratio * (SCREEN_WIDTH * 0.6);
    const barColor = index < ACCENT_COLORS.length ? ACCENT_COLORS[index] : (isDark ? '#333' : '#E0E0E0');

    return (
      <View key={item.bookId} style={styles.bookRow}>
        {/* Progress Bar on the left */}
        <View 
          style={[
            styles.progressBar, 
            { 
              width: barWidth, 
              backgroundColor: barColor,
              opacity: index < 2 ? 0.8 : 0.4
            }
          ]} 
        />
        
        {/* Content immediately follows the bar */}
        <View style={styles.rowContent}>
          <View style={styles.coverContainer}>
            {item.coverImage ? (
              <CachedImage
                uri={item.coverImage}
                style={styles.smallCover}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.smallCoverPlaceholder, { backgroundColor: colors.border }]}>
                <Ionicons name="book-outline" size={16} color={colors.textSecondary} />
              </View>
            )}
          </View>

          <View style={styles.bookDetails}>
            <Text style={[styles.bookTitle, { color: colors.text }]} numberOfLines={1}>
              {item.bookTitle}
            </Text>
            <Text style={[styles.bookDuration, { color: colors.textSecondary }]}>
              {formatDuration(item.minutes)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Reading Insights</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Total Time Section */}
          <View style={styles.totalSection}>
            <View style={styles.totalTimeRow}>
              <Text style={[styles.totalNumber, { color: colors.text }]}>
                {Math.floor(totalMinutes / 60)}
              </Text>
              <Text style={[styles.totalUnit, { color: colors.text }]}> h </Text>
              {totalMinutes % 60 > 0 && (
                <>
                  <Text style={[styles.totalNumber, { color: colors.text, fontSize: 48 }]}>
                    {totalMinutes % 60}
                  </Text>
                  <Text style={[styles.totalUnit, { color: colors.text, fontSize: 24 }]}> m</Text>
                </>
              )}
            </View>
            
            <View style={styles.metaRow}>
              <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                Reading time calculated since {earliestDate}.
              </Text>
            </View>

            <Text style={[styles.quoteText, { color: colors.textSecondary }]}>
              "A reader lives a thousand lives before he dies. The man who never reads lives only one." — George R.R. Martin
            </Text>
          </View>

          {/* List Section */}
          <View style={styles.listContainer}>
            {bookStats.map((item: any, index: number) => renderBookItem(item, index))}
          </View>
        </Animated.View>
        
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  scrollContent: {
    paddingTop: 20,
  },
  totalSection: {
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  totalTimeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  totalNumber: {
    fontSize: 64,
    fontWeight: '400',
    letterSpacing: -1,
  },
  totalUnit: {
    fontSize: 32,
    fontWeight: '300',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.8,
  },
  quoteText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    opacity: 0.9,
  },
  listContainer: {
    marginTop: 10,
  },
  bookRow: {
    flexDirection: 'row',
    height: 64,
    alignItems: 'center',
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    flex: 1,
  },
  coverContainer: {
    width: 44,
    height: 56,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  smallCover: {
    width: '100%',
    height: '100%',
  },
  smallCoverPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookDetails: {
    marginLeft: 12,
    flexShrink: 1,
  },
  bookTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  bookDuration: {
    fontSize: 12,
    fontWeight: '400',
    opacity: 0.7,
  },
});
