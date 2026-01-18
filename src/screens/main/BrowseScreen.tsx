// src/screens/main/BrowseScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
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
import { trackSearch } from '../../utils/Analytics-utils';

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

const FILTERS = ['Trending', 'New', 'Likes'];

type BrowseType = null | 'novels' | 'poems';

export const BrowseScreen = () => {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const [browseType, setBrowseType] = useState<BrowseType>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [selectedFilter, setSelectedFilter] = useState('Trending');
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
    setSelectedFilter('Trending');
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
        case 'Trending':
          queryConstraints.push(orderBy('views', 'desc'));
          break;
        case 'New':
          queryConstraints.push(orderBy('createdAt', 'desc'));
          break;
        case 'Likes':
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
        
        // Track search for analytics
        trackSearch({
          searchTerm: searchQuery.trim(),
          category: 'novels',
          resultsCount: novelsData.length,
        });
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
        case 'Trending':
          queryConstraints.push(orderBy('views', 'desc'));
          break;
        case 'New':
          queryConstraints.push(orderBy('createdAt', 'desc'));
          break;
        case 'Likes':
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
        
        // Track search for analytics
        trackSearch({
          searchTerm: searchQuery.trim(),
          category: 'poems',
          resultsCount: poemsData.length,
        });
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
        style={styles.listItem}
        onPress={() => (navigation as any).navigate('NovelOverview', { novelId: novel.id })}
        activeOpacity={0.85}
      >
        <View style={styles.listItemCover}>
          {hasImage ? (
            <Image
              source={{ uri: getFirebaseDownloadUrl(novel.coverSmallImage || novel.coverImage || '') }}
              style={styles.listItemImage}
              onError={() => handleImageError(novel.id)}
            />
          ) : (
            <View style={[styles.listItemImageFallback, { backgroundColor: getGenreColor(novel.genres) }]}>
              <Text style={styles.listItemFallbackText} numberOfLines={2}>
                {novel.title}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.listItemContent}>
          <Text style={styles.listItemTitle} numberOfLines={2}>
            {novel.title}
          </Text>
          <Text style={styles.listItemAuthor} numberOfLines={1}>
            {novel.authorName}
          </Text>
          <View style={styles.listItemGenres}>
            {novel.genres.slice(0, 2).map((genre, index) => (
              <Text key={index} style={styles.genreLabel}>
                {genre}
              </Text>
            ))}
            {novel.genres.length > 2 && <Text style={styles.genreLabel}>+{novel.genres.length - 2}</Text>}
          </View>
          <View style={styles.listItemStats}>
            <View style={styles.listItemStat}>
              <Ionicons name="eye" size={13} color={colors.textSecondary} />
              <Text style={styles.listItemStatText}>{(novel.views || 0) > 1000 ? ((novel.views || 0) / 1000).toFixed(1) + 'K' : (novel.views || 0)}</Text>
            </View>
            <View style={styles.listItemStat}>
              <Ionicons name="heart" size={13} color={colors.textSecondary} />
              <Text style={styles.listItemStatText}>{(novel.likes || 0) > 1000 ? ((novel.likes || 0) / 1000).toFixed(1) + 'K' : (novel.likes || 0)}</Text>
            </View>
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
        style={styles.listItem}
        onPress={() => (navigation as any).navigate('PoemOverview', { poemId: poem.id })}
        activeOpacity={0.85}
      >
        <View style={styles.listItemCover}>
          {hasImage ? (
            <Image
              source={{ uri: getFirebaseDownloadUrl(poem.coverSmallImage || poem.coverImage || '') }}
              style={styles.listItemImage}
              onError={() => handleImageError(poem.id)}
            />
          ) : (
            <View style={[styles.listItemImageFallback, { backgroundColor: getGenreColor(poem.genres) }]}>
              <Text style={styles.listItemFallbackText} numberOfLines={2}>
                {poem.title}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.listItemContent}>
          <Text style={styles.listItemTitle} numberOfLines={2}>
            {poem.title}
          </Text>
          <Text style={styles.listItemAuthor} numberOfLines={1}>
            {poem.poetName}
          </Text>
          <View style={styles.listItemGenres}>
            {poem.genres.slice(0, 2).map((genre, index) => (
              <Text key={index} style={styles.genreLabel}>
                {genre}
              </Text>
            ))}
            {poem.genres.length > 2 && <Text style={styles.genreLabel}>+{poem.genres.length - 2}</Text>}
          </View>
          <View style={styles.listItemStats}>
            <View style={styles.listItemStat}>
              <Ionicons name="eye" size={13} color={colors.textSecondary} />
              <Text style={styles.listItemStatText}>{(poem.views || 0) > 1000 ? ((poem.views || 0) / 1000).toFixed(1) + 'K' : (poem.views || 0)}</Text>
            </View>
            <View style={styles.listItemStat}>
              <Ionicons name="heart" size={13} color={colors.textSecondary} />
              <Text style={styles.listItemStatText}>{(poem.likes || 0) > 1000 ? ((poem.likes || 0) / 1000).toFixed(1) + 'K' : (poem.likes || 0)}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Initial selection screen
  if (browseType === null) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.selectionContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={styles.selectionHeaderSection}>
            <Text style={styles.selectionMainTitle}>What are you reading?</Text>
            <Text style={styles.selectionHeaderDesc}>Discover stories and poems tailored to your taste</Text>
          </View>

          {/* Novels Section */}
          <TouchableOpacity
            style={styles.largeCard}
            onPress={() => setBrowseType('novels')}
            activeOpacity={0.85}
          >
            <View style={[styles.largeCardGradient, { backgroundColor: colors.primary + '20' }]}>
              <View style={styles.largeCardContent}>
                <View style={[styles.largeCardIcon, { backgroundColor: colors.primary }]}>
                  <Ionicons name="book" size={28} color="#fff" />
                </View>
                <View style={styles.largeCardTextContainer}>
                  <Text style={styles.largeCardTitle}>Novels</Text>
                  <Text style={styles.largeCardSubtitle}>Full-length stories</Text>
                </View>
                <View style={styles.largeCardArrow}>
                  <Ionicons name="chevron-forward" size={24} color={colors.primary} />
                </View>
              </View>
            </View>
          </TouchableOpacity>

          {/* Poems Section */}
          <TouchableOpacity
            style={styles.largeCard}
            onPress={() => setBrowseType('poems')}
            activeOpacity={0.85}
          >
            <View style={[styles.largeCardGradient, { backgroundColor: '#EC4899' + '20' }]}>
              <View style={styles.largeCardContent}>
                <View style={[styles.largeCardIcon, { backgroundColor: '#EC4899' }]}>
                  <Ionicons name="rose" size={28} color="#fff" />
                </View>
                <View style={styles.largeCardTextContainer}>
                  <Text style={styles.largeCardTitle}>Poems</Text>
                  <Text style={styles.largeCardSubtitle}>Beautiful verses</Text>
                </View>
                <View style={styles.largeCardArrow}>
                  <Ionicons name="chevron-forward" size={24} color="#EC4899" />
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Browse interface
  const items = browseType === 'novels' ? novels : poems;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Header */}
      <View style={styles.browseHeader}>
        <TouchableOpacity onPress={() => setBrowseType(null)} style={styles.browseHeaderButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.browseHeaderTitle}>{browseType === 'novels' ? 'Novels' : 'Poems'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search Bar */}
      <View style={styles.browseSearchContainer}>
        <Ionicons name="search" size={18} color={colors.textSecondary} style={styles.browseSearchIcon} />
        <TextInput
          style={styles.browseSearchInput}
          placeholder={`Search ${browseType}...`}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={colors.textSecondary}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.browseContent}>
        {/* Genre Filter */}
        <View style={styles.filterSection}>
          <Text style={styles.sectionTitle}>Genres</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genreScroll}
          >
            {genres.map((genre) => (
              <TouchableOpacity
                key={genre}
                style={[styles.genreTag, selectedGenre === genre && styles.genreTagActive]}
                onPress={() => setSelectedGenre(genre)}
              >
                <Text style={[styles.genreTagText, selectedGenre === genre && styles.genreTagTextActive]}>
                  {genre}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Sort Filter */}
        <View style={styles.filterSection}>
          <Text style={styles.sectionTitle}>Sort By</Text>
          <View style={styles.sortButtonContainer}>
            {FILTERS.map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[styles.sortButton, selectedFilter === filter && styles.sortButtonActive]}
                onPress={() => setSelectedFilter(filter)}
              >
                <Text style={[styles.sortButtonText, selectedFilter === filter && styles.sortButtonTextActive]}>
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Results Header */}
        {items.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>{items.length} {browseType === 'novels' ? 'Stories' : 'Poems'}</Text>
          </View>
        )}

        {/* Results */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading {browseType}...</Text>
          </View>
        ) : items.length > 0 ? (
          <View style={styles.resultsContainer}>
            {browseType === 'novels'
              ? novels.map(renderNovelCard)
              : poems.map(renderPoemCard)}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons 
              name={browseType === 'novels' ? 'book-outline' : 'rose-outline'} 
              size={56} 
              color={colors.textSecondary} 
            />
            <Text style={styles.emptyText}>No {browseType} found</Text>
            <Text style={styles.emptySubtext}>Try adjusting your search or filters</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  
  // ===== SELECTION SCREEN =====
  selectionContainer: {
    flexGrow: 1,
    padding: spacing.lg,
    justifyContent: 'flex-start',
  },
  selectionHeaderSection: {
    marginBottom: spacing.xl * 1.5,
    marginTop: spacing.md,
  },
  selectionMainTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    color: themeColors.text,
    marginBottom: spacing.sm,
    letterSpacing: -0.5,
  },
  selectionHeaderDesc: {
    fontSize: 16,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    lineHeight: 22,
  },
  largeCard: {
    marginBottom: spacing.lg,
    borderRadius: 16,
    overflow: 'hidden',
  },
  largeCardGradient: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  largeCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  largeCardIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  largeCardTextContainer: {
    flex: 1,
  },
  largeCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    color: themeColors.text,
    marginBottom: spacing.xs,
  },
  largeCardSubtitle: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    color: themeColors.textSecondary,
  },
  largeCardArrow: {
    marginLeft: spacing.md,
  },

  // ===== BROWSE SCREEN =====
  browseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingTop: spacing.md,
  },
  browseHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: themeColors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  browseHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  browseSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: themeColors.backgroundSecondary,
    borderRadius: 12,
    height: 44,
  },
  browseSearchIcon: {
    marginRight: spacing.sm,
  },
  browseSearchInput: {
    flex: 1,
    fontSize: 16,
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  browseContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },

  // ===== FILTERS =====
  filterSection: {
    marginBottom: spacing.lg,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.text,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  
  genreScroll: {
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  genreTag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: themeColors.backgroundSecondary,
    borderWidth: 1,
    borderColor: themeColors.border,
    marginRight: spacing.sm,
  },
  genreTagActive: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  genreTagText: {
    fontSize: 13,
    fontWeight: '500',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  genreTagTextActive: {
    color: '#fff',
    fontWeight: '600',
  },

  sortButtonContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sortButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    backgroundColor: themeColors.backgroundSecondary,
    borderWidth: 1,
    borderColor: themeColors.border,
    alignItems: 'center',
  },
  sortButtonActive: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  sortButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: spacing.md,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    paddingHorizontal: spacing.sm,
  },
  
  carouselContainer: {
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
  },
  
  carouselCover: {
    width: 140,
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: themeColors.backgroundSecondary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  
  carouselImage: {
    width: '100%',
    height: '100%',
  },
  
  carouselImageFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.sm,
  },
  
  carouselFallbackText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },

  listItem: {
    flexDirection: 'row',
    paddingBottom: spacing.lg,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  
  listItemCover: {
    width: 100,
    height: 150,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: themeColors.backgroundSecondary,
    marginRight: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  
  listItemImage: {
    width: '100%',
    height: '100%',
  },
  
  listItemImageFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.sm,
  },
  
  listItemFallbackText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  
  listItemContent: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  
  listItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: spacing.xs,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  
  listItemAuthor: {
    fontSize: 14,
    color: themeColors.textSecondary,
    marginBottom: spacing.sm,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  
  listItemGenres: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  
  genreLabel: {
    fontSize: 13,
    color: themeColors.textSecondary,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  
  listItemStats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  
  listItemStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  
  listItemStatText: {
    fontSize: 14,
    color: themeColors.textSecondary,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  // ===== MODERN CARDS =====
  resultsContainer: {
    marginBottom: spacing.lg,
  },
  
  novelItem: {
    marginBottom: spacing.lg,
  },
  
  coverContainer: {
    width: '100%',
    height: 280,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: themeColors.backgroundSecondary,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  
  coverImage: {
    width: '100%',
    height: '100%',
  },
  
  coverFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  
  coverFallbackText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  
  itemMetadata: {
    paddingHorizontal: spacing.sm,
  },
  
  itemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: spacing.xs,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  itemAuthor: {
    fontSize: 13,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    fontSize: 12,
    color: themeColors.textSecondary,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  // ===== EMPTY & LOADING =====
  loadingContainer: {
    paddingVertical: spacing.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: themeColors.textSecondary,
    marginTop: spacing.md,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  emptyContainer: {
    paddingVertical: spacing.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: themeColors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  emptySubtext: {
    fontSize: 14,
    color: themeColors.textSecondary,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
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