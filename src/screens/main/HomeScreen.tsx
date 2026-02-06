// src/screens/main/HomeScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import CachedImage from '../../components/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, orderBy, limit, getDocs, where, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { Novel } from '../../types/novel';
import type { Poem } from '../../types/poem'; 
import HeroBanner from '../../components/HeroBanner';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../theme';
import { sendPromotionEndedNotification } from "../../services/notificationServices";

export const HomeScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const [promotedNovels, setPromotedNovels] = useState<Novel[]>([]);
  const [trendingNovels, setTrendingNovels] = useState<Novel[]>([]);
  const [trendingPoems, setTrendingPoems] = useState<Poem[]>([]);
  const [newReleases, setNewReleases] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const styles = getStyles(colors);

  const handleGenreClick = (genre: string) => {
    navigation.navigate('Browse', { 
      selectedGenre: genre,
      browseType: 'novels'
    });
  };

  const getGenreColor = (genres: string[]) => {
    if (!genres || genres.length === 0) return colors.textSecondary;

    const colorMap: Record<string, string> = {
      Fantasy: '#8B5CF6',
      'Sci-Fi': '#3B82F6',
      Romance: '#EC4899',
      Mystery: '#F59E0B',
      Horror: '#EF4444',
      Adventure: '#10B981',
      Thriller: '#F97316',
      Drama: '#8B5CF6',
      Comedy: '#14B8A6',
      'Dark Romance': '#BE185D',
      Romantic: '#EC4899',
      Nature: '#10B981',
      'Free Verse': '#8B5CF6',
      Haiku: '#3B82F6',
      Sonnet: '#F59E0B',
      Epic: '#EF4444',
      Lyric: '#EC4899',
      Narrative: '#8B5CF6',
      Limerick: '#F59E0B',
      Ballad: '#14B8A6',
      Elegy: '#6B7280',
      Ode: '#F59E0B',
    };

    return colorMap[genres[0]] || colors.textSecondary;
  };

  const getFirebaseDownloadUrl = (url: string) => {
    if (!url || !url.includes('firebasestorage')) {
      return url;
    }

    try {
      const urlParts = url.split('/');
      const bucketName = urlParts[3];
      const filePath = urlParts.slice(4).join('/');
      return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media`;
    } catch (error) {
      console.log('Error converting Firebase URL:', error);
      return url;
    }
  };

  const fetchPromotedNovels = async () => {
    try {
      const novelsRef = collection(db, 'novels');
      const q = query(
        novelsRef,
        where('isPromoted', '==', true),
        where('published', '==', true),
        orderBy("createdAt", "desc"),
        limit(7)
      );
      const querySnapshot = await getDocs(q);
      const promotionalData: Novel[] = [];

      const now = new Date()

        for (const docSnap of querySnapshot.docs) {
          const data = docSnap.data() as any
          const endDate = data.promotionEndDate?.toDate?.() || data.promotionEndDate

          if (endDate && endDate < now) {
            // Send notification to the author that their promotion has ended
            // Only send once - check if notification hasn't been sent yet
            if (!data.promotionEndNotificationSent) {
              try {
                await sendPromotionEndedNotification(
                  data.authorId,
                  docSnap.id,
                  data.title
                )
                console.log(`Promotion ended notification sent for novel: ${data.title}`)
              } catch (error) {
                console.error("Error sending promotion ended notification:", error)
              }
            }

            // Mark that notification has been sent
            await updateDoc(docSnap.ref, {
              isPromoted: false,
              promotionStartDate: null,
              promotionEndDate: null,
              reference: null,
              promotionPlan: null,
              promotionEndNotificationSent: true
            })
          } else {
            promotionalData.push({ id: docSnap.id, ...data } as Novel)
          }
        }

      setPromotedNovels(promotionalData);
    } catch (error) {
      console.error('Error fetching promoted novels:', error);
    }
  };

  const fetchTrendingNovels = async () => {
    try {
      const novelsRef = collection(db, 'novels');
      const q = query(novelsRef, where('published', '==', true), orderBy('views', 'desc'));
      const querySnapshot = await getDocs(q);

      const novels: Novel[] = [];
      querySnapshot.forEach((doc) => {
        const novelData = { id: doc.id, ...doc.data() } as Novel;
        // Exclude promoted novels from trending
        if (!novelData.isPromoted) {
          novels.push(novelData);
        }
      });

      // Limit to 7 after filtering
      setTrendingNovels(novels.slice(0, 7));
    } catch (error) {
      console.error('Error fetching trending novels:', error);
    }
  };

  const fetchNewReleases = async () => {
    try {
      const novelsRef = collection(db, 'novels');
      const q = query(novelsRef, where('published', '==', true), orderBy('createdAt', 'desc'), limit(7));
      const querySnapshot = await getDocs(q);

      const novels: Novel[] = [];
      querySnapshot.forEach((doc) => {
        novels.push({ id: doc.id, ...doc.data() } as Novel);
      });

      setNewReleases(novels);
    } catch (error) {
      console.error('Error fetching new releases:', error);
    }
  };

  const fetchTrendingPoems = async () => {
    try {
      const poemsRef = collection(db, 'poems');
      const q = query(poemsRef, where('published', '==', true), orderBy('views', 'desc'), limit(7));
      const querySnapshot = await getDocs(q);

      const poems: Poem[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        poems.push({
          id: doc.id,
          title: data.title || 'Untitled',
          poetName: data.poetName || 'Unknown',
          description: data.description || '',
          content: data.content || '',
          genres: data.genres || [],
          poetId: data.poetId || '',
          published: data.published || false,
          createdAt: data.createdAt || '',
          updatedAt: data.updatedAt || '',
          likes: data.likes || 0,
          views: data.views || 0,
          coverImage: data.coverImage,
          coverSmallImage: data.coverSmallImage,
        } as Poem);
      });
      setTrendingPoems(poems);
    } catch (error) {
      console.error('Error fetching trending poems:', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([
        fetchPromotedNovels(),
        fetchTrendingNovels(),
        fetchNewReleases(),
        fetchTrendingPoems(),
      ]);
      setLoading(false);
    };

    fetchData();
  }, []);

  const bannerSlides = [
  {
    id: "banner-1",
    image: require("../../../assets/images/writers-comp.webp"),
    externalLink: "https://discord.gg/rMasj5PDPe",
    alt: "Discord Community Banner",
  },
  {
    id: "banner-2",
    image: require("../../../assets/images/dec-comp-winner.webp"),
    novelId: "xeypggSi2BR7dYzp7NhO",
    alt: "Dec Comp Banner",
  },
  {
    id: "banner-3",
    image: require("../../../assets/images/his-dangerous-truth.webp"),
    novelId: "erpas9As02OQgKGlXtJ7",
    alt: "Promotion Banner",
  },
  {
    id: "banner-4",
    image: require("../../../assets/images/the-accidental-landlord.webp"),
    novelId: "OgrUd6n4cLlAbh3aKMrm",
    alt: "Promotion Banner",
  },
];


  const handleImageError = (novelId: string) => {
    setImageErrors(prev => ({ ...prev, [novelId]: true }));
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const renderNovelCard = (novel: Novel) => {
    const hasImage = (novel.coverSmallImage || novel.coverImage) && !imageErrors[novel.id];

    return (
      <TouchableOpacity
        key={novel.id}
        style={styles.novelCard}
        onPress={() => {navigation.navigate('NovelOverview', {novelId: novel.id });}}
      >
        {hasImage ? (
          <CachedImage
            uri={getFirebaseDownloadUrl(novel.coverSmallImage || novel.coverImage || '')}
            style={styles.novelCover}
            onError={() => handleImageError(novel.id)}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.novelCover, { backgroundColor: getGenreColor(novel.genres) }]}>
            <Text style={styles.fallbackTitle} numberOfLines={3}>
              {novel.title}
            </Text>
            <View style={styles.fallbackDivider} />
            <Text style={styles.fallbackAuthor} numberOfLines={1}>
              {novel.authorName}
            </Text>
          </View>
        )}
        <View style={styles.novelStats}>
          <View style={styles.novelStat}>
            <Ionicons name="eye" size={14} color={colors.textSecondary} />
            <Text style={styles.novelStatText}>{formatNumber(novel.views || 0)}</Text>
          </View>
          <View style={styles.novelStat}>
            <Ionicons name="heart" size={14} color={colors.textSecondary} />
            <Text style={styles.novelStatText}>{formatNumber(novel.likes || 0)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPoemCard = (poem: Poem) => {
    const hasImage = (poem.coverSmallImage || poem.coverImage) && !imageErrors[poem.id];

    return (
      <TouchableOpacity
        key={poem.id}
        style={styles.novelCard}
        onPress={() => {
          navigation.navigate('PoemOverview', {poemId: poem.id });
        }}
      >
        {hasImage ? (
          <CachedImage
            uri={getFirebaseDownloadUrl(poem.coverSmallImage || poem.coverImage || '')}
            style={styles.novelCover}
            onError={() => handleImageError(poem.id)}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.novelCover, { backgroundColor: getGenreColor(poem.genres) }]}>
            <Text style={styles.fallbackTitle} numberOfLines={3}>
              {poem.title}
            </Text>
            <View style={styles.fallbackDivider} />
            <Text style={styles.fallbackAuthor} numberOfLines={1}>
              {poem.poetName}
            </Text>
          </View>
        )}
        <View style={styles.novelStats}>
          <View style={styles.novelStat}>
            <Ionicons name="eye" size={14} color={colors.textSecondary} />
            <Text style={styles.novelStatText}>{formatNumber(poem.views || 0)}</Text>
          </View>
          <View style={styles.novelStat}>
            <Ionicons name="heart" size={14} color={colors.textSecondary} />
            <Text style={styles.novelStatText}>{formatNumber(poem.likes || 0)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading novels...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false}>

      {/* Hero Banner Section */}
      <HeroBanner slides={bannerSlides} autoSlideInterval={5000} />

      {promotedNovels.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Promotions</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {promotedNovels.map(renderNovelCard)}
          </ScrollView>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Trending Now</Text>
        </View>
        {trendingNovels.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {trendingNovels.map(renderNovelCard)}
          </ScrollView>
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>No trending novels at the moment</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>New Releases</Text>
        </View>
        {newReleases.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {newReleases.map(renderNovelCard)}
          </ScrollView>
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>No new releases at the moment</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Poetry</Text>
        </View>
        {trendingPoems.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {trendingPoems.map(renderPoemCard)}
          </ScrollView>
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>No new releases at the moment</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.genreTitle}>Popular Genres</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.genresScroll}
        >
          <View style={styles.genresGrid}>
            <View style={styles.genresRow}>
              {["Fantasy", "Sci-Fi", "Romance", "Mystery", "Horror", "Adventure", "Thriller"].map((genre) => (
                <TouchableOpacity
                  key={genre}
                  style={styles.genreCard}
                  onPress={() => handleGenreClick(genre)}
                >
                  <Text style={styles.genreText}>{genre}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.genresRow}>
              {["Dark Romance", "Historical Fiction", "Comedy", "Drama", "Dystopian", "Fiction"].map((genre) => (
                <TouchableOpacity
                  key={genre}
                  style={styles.genreCard}
                  onPress={() => handleGenreClick(genre)}
                >
                  <Text style={styles.genreText}>{genre}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>

      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
};

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: themeColors.background,
  },
  loadingText: {
    ...typography.body,
    color: themeColors.textSecondary,
    marginTop: spacing.md,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  section: {
    padding: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h2,
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  horizontalScroll: {
    gap: spacing.md,
  },
  novelCard: {
    width: 140,
  },
  novelCover: {
    width: 140,
    height: 200,
    backgroundColor: themeColors.backgroundSecondary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  novelStats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  novelStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  novelStatText: {
    ...typography.caption,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  genreTitle: {
    ...typography.h3,
    color: themeColors.text,
    marginBottom: spacing.md,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  genresScroll: {
    paddingRight: spacing.md,
  },
  genresGrid: {
    gap: spacing.sm,
  },
  genresRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  genreCard: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: themeColors.backgroundSecondary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  genreText: {
    ...typography.bodySmall,
    color: themeColors.text,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  emptySection: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  bottomSpacing: {
    height: spacing.lg,
  },
  fallbackTitle: {
    ...typography.bodySmall,
    color: themeColors.text,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.xs,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  fallbackDivider: {
    width: 30,
    height: 1,
    backgroundColor: themeColors.text,
    opacity: 0.3,
    marginVertical: spacing.xs,
  },
  fallbackAuthor: {
    ...typography.caption,
    color: themeColors.textSecondary,
    opacity: 0.75,
    textAlign: 'center',
  },
});
