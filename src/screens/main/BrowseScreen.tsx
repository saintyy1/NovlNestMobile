// src/screens/main/BrowseScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  QueryConstraint 
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { Novel } from '../../types/novel';
import type { Poem } from '../../types/poem';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../theme';

const NOVEL_GENRES = [
  'All',
  'Fantasy',
  'Romance',
  'Mystery',
  'Sci-Fi',
  'Horror',
  'Adventure',
  'Drama',
  'Comedy',
  'Thriller',
  'Dark Romance',
  'Historical Fiction',
  'Dystopian',
  'Fiction',
];

const POEM_GENRES = [
  'All',
  'Romantic',
  'Nature',
  'Free Verse',
  'Haiku',
  'Sonnet',
  'Epic',
  'Lyric',
  'Narrative',
  'Limerick',
  'Ballad',
  'Elegy',
  'Ode',
];

const FILTERS = ['Popular', 'New', 'Trending'];

type BrowseType = null | 'novels' | 'poems';

export const BrowseScreen = () => {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const [browseType, setBrowseType] = useState<BrowseType>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [selectedFilter, setSelectedFilter] = useState('Popular');
  const [novels, setNovels] = useState<Novel[]>([]);
  const [poems, setPoems] = useState<Poem[]>([]);
  const [loading, setLoading] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const styles = getStyles(colors);

  // Get genres based on browse type
  const genres = browseType === 'novels' ? NOVEL_GENRES : POEM_GENRES;

  // Listen for reset param from back button
  useEffect(() => {
    const params = route.params as any;
    if (params?.resetBrowseType) {
      setBrowseType(null);
      // Clear the param after resetting
      setTimeout(() => {
        navigation.setParams({ resetBrowseType: undefined } as any);
      }, 100);
    }
    
    // Handle genre navigation from HomeScreen
    if (params?.selectedGenre && params?.browseType) {
      setBrowseType(params.browseType);
      setSelectedGenre(params.selectedGenre);
      // Clear params after setting
      setTimeout(() => {
        navigation.setParams({ selectedGenre: undefined, browseType: undefined } as any);
      }, 100);
    }
  }, [route.params]);

  // Update header based on browse type
  useEffect(() => {
    if (browseType === 'novels') {
      navigation.setOptions({ 
        title: 'Browse Novels',
      });
      navigation.setParams({ showBackButton: true } as any);
    } else if (browseType === 'poems') {
      navigation.setOptions({ 
        title: 'Browse Poems',
      });
      navigation.setParams({ showBackButton: true } as any);
    } else {
      navigation.setOptions({ 
        title: 'Browse',
      });
      navigation.setParams({ showBackButton: false } as any);
    }
  }, [browseType, navigation]);

  // Reset filters when browse type changes
  useEffect(() => {
    setSelectedGenre('All');
    setSearchQuery('');
    setSelectedFilter('Popular');
  }, [browseType]);

  // Fetch data when filters change
  useEffect(() => {
    if (browseType) {
      if (browseType === 'novels') {
        fetchNovels();
      } else {
        fetchPoems();
      }
    }
  }, [browseType, selectedGenre, selectedFilter, searchQuery]);

  const fetchNovels = async () => {
    setLoading(true);
    try {
      const novelsRef = collection(db, 'novels');
      const queryConstraints: QueryConstraint[] = [];

      if (selectedGenre !== 'All') {
        queryConstraints.push(where('genres', 'array-contains', selectedGenre));
      }

      switch (selectedFilter) {
        case 'Popular':
          queryConstraints.push(orderBy('views', 'desc'));
          break;
        case 'New':
          queryConstraints.push(orderBy('createdAt', 'desc'));
          break;
        case 'Trending':
          queryConstraints.push(orderBy('likes', 'desc'));
          break;
      }

      const q = query(novelsRef, ...queryConstraints);
      const querySnapshot = await getDocs(q);

      let novelsData: Novel[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        novelsData.push({
          id: doc.id,
          title: data.title || 'Untitled',
          authorName: data.authorName || 'Unknown',
          summary: data.summary || '',
          coverImage: data.coverImage,
          coverSmallImage: data.coverSmallImage,
          views: data.views || 0,
          likes: data.likes || 0,
          genres: data.genres || [],
        } as Novel);
      });

      if (searchQuery.trim()) {
        const searchLower = searchQuery.toLowerCase();
        novelsData = novelsData.filter(
          (novel) =>
            novel.title.toLowerCase().includes(searchLower) ||
            novel.authorName.toLowerCase().includes(searchLower) ||
            novel.summary.toLowerCase().includes(searchLower)
        );
      }

      setNovels(novelsData);
    } catch (error) {
      console.error('Error fetching novels:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPoems = async () => {
    setLoading(true);
    try {
      const poemsRef = collection(db, 'poems');
      const queryConstraints: QueryConstraint[] = [];

      if (selectedGenre !== 'All') {
        queryConstraints.push(where('genres', 'array-contains', selectedGenre));
      }

      switch (selectedFilter) {
        case 'Popular':
          queryConstraints.push(orderBy('views', 'desc'));
          break;
        case 'New':
          queryConstraints.push(orderBy('createdAt', 'desc'));
          break;
        case 'Trending':
          queryConstraints.push(orderBy('likes', 'desc'));
          break;
      }

      const q = query(poemsRef, ...queryConstraints);
      const querySnapshot = await getDocs(q);

      let poemsData: Poem[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        poemsData.push({
          id: doc.id,
          title: data.title || 'Untitled',
          poetName: data.poetName || 'Unknown',
          coverImage: data.coverImage,
          coverSmallImage: data.coverSmallImage,
          content: data.content || '',
          views: data.views || 0,
          likes: data.likes || 0,
          genres: data.genres || [],
        } as Poem);
      });

      if (searchQuery.trim()) {
        const searchLower = searchQuery.toLowerCase();
        poemsData = poemsData.filter(
          (poem) =>
            poem.title.toLowerCase().includes(searchLower) ||
            poem.poetName.toLowerCase().includes(searchLower) ||
            poem.content.toLowerCase().includes(searchLower)
        );
      }

      setPoems(poemsData);
    } catch (error) {
      console.error('Error fetching poems:', error);
    } finally {
      setLoading(false);
    }
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
      return url;
    }
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

  const handleImageError = (id: string) => {
    setImageErrors(prev => ({ ...prev, [id]: true }));
  };

  const renderNovelCard = (novel: Novel) => {
    const hasImage = (novel.coverSmallImage || novel.coverImage) && !imageErrors[novel.id];

    return (
      <TouchableOpacity
        key={novel.id}
        style={styles.itemCard}
        onPress={() => (navigation as any).navigate('NovelOverview', { novelId: novel.id })}
      >
        <View style={styles.imageContainer}>
          {hasImage ? (
            <Image
              source={{ uri: getFirebaseDownloadUrl(novel.coverSmallImage || novel.coverImage || '') }}
              style={styles.itemImage}
              onError={() => handleImageError(novel.id)}
            />
          ) : (
            <View style={[styles.imageFallback, { backgroundColor: getGenreColor(novel.genres) }]}>
              <Text style={styles.fallbackTitle} numberOfLines={3}>
                {novel.title}
              </Text>
              <View style={styles.fallbackDivider} />
              <Text style={styles.fallbackAuthor} numberOfLines={1}>
                {novel.authorName}
              </Text>
            </View>
          )}
          
          <View style={styles.statsOverlay}>
            <View style={styles.statItem}>
              <Ionicons name="eye" size={12} color="#fff" />
              <Text style={styles.statText}>{novel.views}</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="heart" size={12} color="#fff" />
              <Text style={styles.statText}>{novel.likes}</Text>
            </View>
          </View>
        </View>

        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle} numberOfLines={2}>
            {novel.title}
          </Text>
          <Text style={styles.itemAuthor} numberOfLines={1}>
            by {novel.authorName}
          </Text>
          <Text style={styles.itemSummary} numberOfLines={2}>
            {novel.summary}
          </Text>
          <View style={styles.genresContainer}>
            {novel.genres.slice(0, 2).map((genre, index) => (
              <View key={index} style={styles.genreChip}>
                <Text style={styles.genreChipText}>{genre}</Text>
              </View>
            ))}
            {novel.genres.length > 2 && (
              <View style={styles.genreChip}>
                <Text style={styles.genreChipText}>+{novel.genres.length - 2}</Text>
              </View>
            )}
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
        style={styles.itemCard}
        onPress={() => (navigation as any).navigate('PoemOverview', { poemId: poem.id })}
      >
        <View style={styles.imageContainer}>
          {hasImage ? (
            <Image
              source={{ uri: getFirebaseDownloadUrl(poem.coverSmallImage || poem.coverImage || '') }}
              style={styles.itemImage}
              onError={() => handleImageError(poem.id)}
            />
          ) : (
            <View style={[styles.imageFallback, { backgroundColor: getGenreColor(poem.genres) }]}>
              <Text style={styles.fallbackTitle} numberOfLines={3}>
                {poem.title}
              </Text>
              <View style={styles.fallbackDivider} />
              <Text style={styles.fallbackAuthor} numberOfLines={1}>
                {poem.poetName}
              </Text>
            </View>
          )}
          
          <View style={styles.statsOverlay}>
            <View style={styles.statItem}>
              <Ionicons name="eye" size={12} color="#fff" />
              <Text style={styles.statText}>{poem.views}</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="heart" size={12} color="#fff" />
              <Text style={styles.statText}>{poem.likes}</Text>
            </View>
          </View>
        </View>

        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle} numberOfLines={2}>
            {poem.title}
          </Text>
          <Text style={styles.itemAuthor} numberOfLines={1}>
            by {poem.poetName}
          </Text>
          <Text style={styles.itemSummary} numberOfLines={1}>
            {poem.description}
          </Text>
          <View style={styles.genresContainer}>
            {poem.genres.slice(0, 2).map((genre, index) => (
              <View key={index} style={styles.genreChip}>
                <Text style={styles.genreChipText}>{genre}</Text>
              </View>
            ))}
            {poem.genres.length > 2 && (
              <View style={styles.genreChip}>
                <Text style={styles.genreChipText}>+{poem.genres.length - 2}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Initial selection screen
  if (browseType === null) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.selectionContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={styles.selectionHeader}>
            <View style={styles.headerIconContainer}>
              <Ionicons name="search" size={40} color={colors.primary} />
            </View>
            <Text style={styles.selectionTitle}>Explore Stories</Text>
            <Text style={styles.selectionSubtitle}>
              Choose what you'd like to discover and find your next favorite read
            </Text>
          </View>

          {/* Cards Section */}
          <View style={styles.cardsContainer}>
            {/* Novels Card */}
            <TouchableOpacity
              style={styles.selectionCard}
              onPress={() => setBrowseType('novels')}
              activeOpacity={0.7}
            >
              <View style={styles.cardGradient}>
                <View style={styles.cardIconWrapper}>
                  <View style={[styles.cardIconContainer, { backgroundColor: colors.primary }]}>
                    <Ionicons name="book" size={32} color="#fff" />
                  </View>
                </View>

                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>Novels</Text>
                  <Text style={styles.cardDescription}>
                    Discover full-length stories with chapters, characters, and compelling plots
                  </Text>
                </View>

                <View style={styles.cardFooter}>
                  <View style={styles.cardFeatures}>
                    <View style={styles.featureItem}>
                      <Ionicons name="book-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.featureText}>Full-length stories</Text>
                    </View>
                    <View style={styles.featureItem}>
                      <Ionicons name="star-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.featureText}>Popular & trending</Text>
                    </View>
                  </View>
                  <View style={styles.cardArrow}>
                    <Ionicons name="arrow-forward" size={20} color={colors.primary} />
                  </View>
                </View>
              </View>
            </TouchableOpacity>

            {/* Poems Card */}
            <TouchableOpacity
              style={styles.selectionCard}
              onPress={() => setBrowseType('poems')}
              activeOpacity={0.7}
            >
              <View style={styles.cardGradient}>
                <View style={styles.cardIconWrapper}>
                  <View style={[styles.cardIconContainer, { backgroundColor: '#EC4899' }]}>
                    <Ionicons name="rose" size={32} color="#fff" />
                  </View>
                </View>

                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>Poems</Text>
                  <Text style={styles.cardDescription}>
                    Explore beautiful verses and poetic expressions that touch the heart
                  </Text>
                </View>

                <View style={styles.cardFooter}>
                  <View style={styles.cardFeatures}>
                    <View style={styles.featureItem}>
                      <Ionicons name="sparkles-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.featureText}>Creative verses</Text>
                    </View>
                    <View style={styles.featureItem}>
                      <Ionicons name="heart-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.featureText}>Emotional depth</Text>
                    </View>
                  </View>
                  <View style={styles.cardArrow}>
                    <Ionicons name="arrow-forward" size={20} color="#EC4899" />
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Browse interface
  const items = browseType === 'novels' ? novels : poems;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setBrowseType(null)} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Browse {browseType}</Text>
      </View>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search ${browseType}...`}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={colors.textSecondary}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Genre Filter */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Genres</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipContainer}>
              {genres.map((genre) => (
                <TouchableOpacity
                  key={genre}
                  style={[styles.chip, selectedGenre === genre && styles.chipSelected]}
                  onPress={() => setSelectedGenre(genre)}
                >
                  <Text style={[styles.chipText, selectedGenre === genre && styles.chipTextSelected]}>
                    {genre}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Sort Filter */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sort By</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipContainer}>
              {FILTERS.map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={[styles.chip, selectedFilter === filter && styles.chipSelected]}
                  onPress={() => setSelectedFilter(filter)}
                >
                  <Text style={[styles.chipText, selectedFilter === filter && styles.chipTextSelected]}>
                    {filter}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Results */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Results {items.length > 0 && `(${items.length})`}
          </Text>
          
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading {browseType}...</Text>
            </View>
          ) : items.length > 0 ? (
            <View style={styles.resultsGrid}>
              {browseType === 'novels'
                ? novels.map(renderNovelCard)
                : poems.map(renderPoemCard)}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons 
                name={browseType === 'novels' ? 'book-outline' : 'rose-outline'} 
                size={64} 
                color={colors.textSecondary} 
              />
              <Text style={styles.emptyText}>No {browseType} found</Text>
              <Text style={styles.emptySubtext}>Try adjusting your search or filters</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
  },
  headerButton: {
    paddingHorizontal: 8,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: themeColors.primary,
  },
  selectionContainer: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  selectionHeader: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl * 1.5,
  },
  headerIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: themeColors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  selectionTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: themeColors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
    letterSpacing: -0.5,
  },
  selectionSubtitle: {
    fontSize: 16,
    color: themeColors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: spacing.md,
  },
  cardsContainer: {
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  selectionCard: {
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  cardGradient: {
    backgroundColor: themeColors.backgroundSecondary,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 20,
  },
  cardIconWrapper: {
    marginBottom: spacing.md,
  },
  cardIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardContent: {
    marginBottom: spacing.lg,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: spacing.xs,
  },
  cardDescription: {
    fontSize: 15,
    color: themeColors.textSecondary,
    lineHeight: 22,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  cardFeatures: {
    flex: 1,
    gap: spacing.xs,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  featureText: {
    fontSize: 13,
    color: themeColors.textSecondary,
  },
  cardArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: themeColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.backgroundSecondary,
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    height: 50,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: themeColors.text,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: themeColors.text,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  chipContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: themeColors.backgroundSecondary,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  chipSelected: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  chipText: {
    ...typography.bodySmall,
    color: themeColors.text,
  },
  chipTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: spacing.xl * 2,
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: themeColors.textSecondary,
    marginTop: spacing.md,
  },
  resultsGrid: {
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: themeColors.backgroundSecondary,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  imageContainer: {
    width: 120,
    height: 180,
    position: 'relative',
  },
  itemImage: {
    width: '100%' as any,
    height: '100%' as any,
  },
  imageFallback: {
    width: '100%' as any,
    height: '100%' as any,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.sm,
  },
  fallbackTitle: {
    ...typography.bodySmall,
    color: themeColors.text,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.xs,
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
  statsOverlay: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    gap: 4,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statText: {
    ...typography.caption,
    color: '#fff',
    fontSize: 10,
  },
  itemInfo: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'center',
  },
  itemTitle: {
    ...typography.body,
    color: themeColors.text,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  itemAuthor: {
    ...typography.bodySmall,
    color: themeColors.textSecondary,
    marginBottom: spacing.xs,
  },
  itemSummary: {
    ...typography.bodySmall,
    color: themeColors.textSecondary,
    marginBottom: spacing.sm,
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  genreChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  genreChipText: {
    ...typography.caption,
    color: themeColors.text,
    fontSize: 10,
  },
  poemCard: {
    backgroundColor: themeColors.backgroundSecondary,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  poemHeader: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  poemIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: themeColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  poemHeaderInfo: {
    flex: 1,
  },
  poemTitle: {
    ...typography.body,
    color: themeColors.text,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  poemAuthor: {
    ...typography.bodySmall,
    color: themeColors.textSecondary,
  },
  poemContent: {
    ...typography.body,
    color: themeColors.text,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  poemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  poemStats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  poemStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  poemStatText: {
    ...typography.caption,
    color: themeColors.textSecondary,
  },
  emptyContainer: {
    paddingVertical: spacing.xl * 2,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.h3,
    color: themeColors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    ...typography.body,
    color: themeColors.textSecondary,
    textAlign: 'center',
  },
});

const styles = getStyles({ 
  background: '#111827',
  backgroundSecondary: '#1F2937',
  text: '#FFFFFF',
  textSecondary: '#D1D5DB',
  border: '#374151',
  primary: '#8B5CF6',
});