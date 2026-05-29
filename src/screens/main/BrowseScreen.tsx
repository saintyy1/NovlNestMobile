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
  FlatList,
  Switch,
  RefreshControl,
} from 'react-native';
import CachedImage from '../../components/CachedImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  QueryConstraint
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { Novel } from '../../types/novel';
import type { Poem } from '../../types/poem';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../theme';
import { trackSearch } from '../../utils/Analytics-utils';
import { withCache, CACHE_TTL, invalidateBrowseCache } from '../../utils/cache';
import { ErrorRetryView } from '../../components/common/ErrorRetryView';

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

const NOVEL_FILTERS = ['Trending', 'New', 'Completed'];
const POEM_FILTERS = ['Trending', 'New', 'Likes'];

type BrowseType = null | 'novels' | 'poems';

export const BrowseScreen = () => {
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const [browseType, setBrowseType] = useState<BrowseType>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('Trending');
  const [schoolOnly, setSchoolOnly] = useState(currentUser?.focusedMode || false);
  const [novels, setNovels] = useState<Novel[]>([]);
  const [poems, setPoems] = useState<Poem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isClassics, setIsClassics] = useState(false);
  const [isGenresExpanded, setIsGenresExpanded] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const genreListRef = useRef<FlatList>(null);

  const styles = getStyles(colors);

  // Get genres and filters based on browse type
  const genres = browseType === 'novels' ? NOVEL_GENRES : POEM_GENRES;
  const filters = browseType === 'novels' ? NOVEL_FILTERS : POEM_FILTERS;

  // Listen for reset param from back button
  useEffect(() => {
    const params = route.params as any;
    if (params?.resetBrowseType) {
      setBrowseType(null);
      setIsClassics(false);
      // Clear the param after resetting
      setTimeout(() => {
        navigation.setParams({ resetBrowseType: undefined } as any);
      }, 100);
    }

    // Handle genre navigation from HomeScreen
    if (params?.selectedGenre && params?.browseType) {
      setBrowseType(params.browseType);
      setSelectedGenre(params.selectedGenre);
      setIsClassics(params.isClassics || false);
      // Clear params after setting
      setTimeout(() => {
        navigation.setParams({ selectedGenre: undefined, browseType: undefined, isClassics: undefined } as any);
      }, 100);
    }
  }, [route.params]);

  // Update header based on browse type
  useEffect(() => {
    if (isClassics) {
      navigation.setOptions({
        title: 'Timeless Collection',
      });
      navigation.setParams({ showBackButton: true } as any);
    } else if (browseType === 'novels') {
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
  }, [browseType, isClassics, navigation]);

  // Reset filters when browse type changes
  useEffect(() => {
    setSelectedGenre('All');
    setSearchQuery('');
    setSelectedFilter('Trending');
  }, [browseType]);

  const [refreshing, setRefreshing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchBrowseData = async (force = false, isRetry = false) => {
    if (!browseType) return;
    setLoading(true);
    setHasError(false);
    setTimedOut(false);
    if (force) {
      if (!isRetry) {
        setRefreshing(true);
      }
      await invalidateBrowseCache();
    }
    const collectionName = browseType === 'novels' ? 'novels' : 'poems';
    const collectionRef = collection(db, collectionName);
    const queryConstraints: QueryConstraint[] = [where('published', '==', true)];

    if (isClassics) {
      queryConstraints.push(where('publicDomain', '==', true));
    }

    // Safe-Wall Filter - Blueprint Item: Localized content
    if (schoolOnly && currentUser?.schoolId) {
      queryConstraints.push(where('schoolId', '==', currentUser.schoolId));
    }

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
      case 'Completed':
        if (browseType === 'novels') {
          queryConstraints.push(where('status', '==', 'completed'));
          queryConstraints.push(orderBy('createdAt', 'desc'));
        }
        break;
    }

    const q = query(collectionRef, ...queryConstraints);
    const cacheKey = `browse_${browseType}_${isClassics}_${selectedGenre}_${selectedFilter}`;

    try {
      const rawData = await withCache(cacheKey, async () => {
        const snapshot = await getDocs(q);
        let dataList: any[] = [];

        snapshot.forEach((doc) => {
          const itemData = doc.data();
          // If browsing community content, filter out classics
          if (!isClassics && itemData.publicDomain === true) return;

          if (browseType === 'novels') {
            dataList.push({
              id: doc.id,
              title: itemData.title || 'Untitled',
              authorName: itemData.authorName || 'Unknown',
              summary: itemData.summary || '',
              coverImage: itemData.coverImage,
              coverSmallImage: itemData.coverSmallImage,
              views: itemData.views || 0,
              likes: itemData.likes || 0,
              genres: itemData.genres || [],
            } as Novel);
          } else {
            dataList.push({
              id: doc.id,
              title: itemData.title || 'Untitled',
              poetName: itemData.poetName || 'Unknown',
              coverImage: itemData.coverImage,
              coverSmallImage: itemData.coverSmallImage,
              views: itemData.views || 0,
              likes: itemData.likes || 0,
              genres: itemData.genres || [],
            } as Poem);
          }
        });
        return dataList;
      }, force ? 0 : CACHE_TTL.FEED);

      let filteredData = [...rawData];

      if (searchQuery.trim()) {
        const searchLower = searchQuery.toLowerCase();
        filteredData = filteredData.filter((item) => {
          if (browseType === 'novels') {
            return (
              item.title.toLowerCase().includes(searchLower) ||
              item.authorName.toLowerCase().includes(searchLower) ||
              item.summary.toLowerCase().includes(searchLower)
            );
          } else {
            return (
              item.title.toLowerCase().includes(searchLower) ||
              item.poetName.toLowerCase().includes(searchLower) ||
              (item.content && item.content.toLowerCase().includes(searchLower))
            );
          }
        });

        // Track search for analytics
        trackSearch({
          searchTerm: searchQuery.trim(),
          category: browseType,
          resultsCount: filteredData.length,
        });
      }

      if (browseType === 'novels') {
        setNovels(filteredData);
      } else {
        setPoems(filteredData);
      }
    } catch (error: any) {
      if (error.code !== 'permission-denied') {
        console.error(`Error fetching ${browseType}:`, error);
        setHasError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBrowseData();
  }, [browseType, isClassics, selectedGenre, selectedFilter, searchQuery, schoolOnly]);

  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        setTimedOut(true);
      }, 10000);
      return () => clearTimeout(timer);
    } else {
      setTimedOut(false);
    }
  }, [loading]);

  const getFirebaseDownloadUrl = (url: string) => {
    if (!url) return url;

    // If it's already a direct download URL, return it
    if (url.includes('firebasestorage.googleapis.com') && url.includes('alt=media')) {
      return url;
    }

    // Handle storage.googleapis.com or gs:// links
    if (url.includes('storage.googleapis.com') || url.startsWith('gs://')) {
      try {
        const urlParts = url.replace('gs://', '').split('/');
        // For storage.googleapis.com/bucket/path, bucket is parts[2]
        // For bucket/path, bucket is parts[0]
        const isGoogleApi = url.includes('storage.googleapis.com');
        const bucketName = isGoogleApi ? urlParts[3] : urlParts[0];
        const filePath = isGoogleApi ? urlParts.slice(4).join('/') : urlParts.slice(1).join('/');

        return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media`;
      } catch (error) {
        return url;
      }
    }

    return url;
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
            <CachedImage
              uri={getFirebaseDownloadUrl(novel.coverSmallImage || novel.coverImage || '')}
              style={styles.listItemImage}
              onError={() => handleImageError(novel.id)}
              contentFit="cover"
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
            <CachedImage
              uri={getFirebaseDownloadUrl(poem.coverSmallImage || poem.coverImage || '')}
              style={styles.listItemImage}
              onError={() => handleImageError(poem.id)}
              contentFit="cover"
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
            onPress={() => {
              setBrowseType('novels');
              setIsClassics(false);
            }}
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
            onPress={() => {
              setBrowseType('poems');
              setIsClassics(false);
            }}
            activeOpacity={0.85}
          >
            <View style={[styles.largeCardGradient, { backgroundColor: '#EC4899' + '20' }]}>
              <View style={styles.largeCardContent}>
                <View style={[styles.largeCardIcon, { backgroundColor: '#EC4899' }]}>
                  <Ionicons name="rose" size={28} color="#fff" />
                </View>
                <View style={styles.largeCardTextContainer}>
                  <Text style={styles.largeCardTitle}>Poems</Text>
                  <Text style={styles.largeCardSubtitle}>Beautiful community verses</Text>
                </View>
                <View style={styles.largeCardArrow}>
                  <Ionicons name="chevron-forward" size={24} color="#EC4899" />
                </View>
              </View>
            </View>
          </TouchableOpacity>

          {/* Timeless Collection Section */}
          <TouchableOpacity
            style={styles.largeCard}
            onPress={() => {
              setBrowseType('novels');
              setIsClassics(true);
            }}
            activeOpacity={0.85}
          >
            <View style={[styles.largeCardGradient, { backgroundColor: '#F59E0B' + '20' }]}>
              <View style={styles.largeCardContent}>
                <View style={[styles.largeCardIcon, { backgroundColor: '#F59E0B' }]}>
                  <Ionicons name="library" size={28} color="#fff" />
                </View>
                <View style={styles.largeCardTextContainer}>
                  <Text style={styles.largeCardTitle}>Timeless Collection</Text>
                  <Text style={styles.largeCardSubtitle}>Public domain classics</Text>
                </View>
                <View style={styles.largeCardArrow}>
                  <Ionicons name="chevron-forward" size={24} color="#F59E0B" />
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
        <TouchableOpacity
          onPress={() => {
            setBrowseType(null);
            setIsClassics(false);
          }}
          style={styles.browseHeaderButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.browseHeaderTitle}>
          {isClassics ? 'Timeless Collection' : (browseType === 'novels' ? 'Novels' : 'Poems')}
        </Text>
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

      {/* School Only Filter - Blueprint Item: Safe Wall */}
      {currentUser?.schoolId && !isClassics && (
        <View style={[styles.schoolFilterCard, { backgroundColor: schoolOnly ? colors.primary + '10' : colors.surface, borderColor: schoolOnly ? colors.primary + '30' : colors.border }]}>
          <View style={styles.schoolFilterInfo}>
            <Ionicons name="business" size={20} color={schoolOnly ? colors.primary : colors.textSecondary} />
            <View style={{ marginLeft: 12 }}>
              <Text style={[styles.schoolFilterTitle, { color: colors.text }]}>School Only Library</Text>
              <Text style={[styles.schoolFilterDesc, { color: colors.textSecondary }]}>
                {currentUser.focusedMode ? 'Locked by institution' : 'Show only work from your school'}
              </Text>
            </View>
          </View>
          <Switch
            value={schoolOnly}
            onValueChange={setSchoolOnly}
            disabled={currentUser.focusedMode}
            trackColor={{ false: '#767577', true: colors.primary }}
            thumbColor={schoolOnly ? '#fff' : '#f4f3f4'}
          />
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.browseContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchBrowseData(true)}
            tintColor={colors.primary}
          />
        }
      >
        {/* Genre Filter */}
        <View style={styles.filterSection}>
          <Text style={styles.sectionTitle}>Genres</Text>

          {isGenresExpanded ? (
            <View style={styles.genreExpandedContainer}>
              <View style={styles.genreGrid}>
                {genres.map((genre) => (
                  <TouchableOpacity
                    key={genre}
                    style={[
                      styles.genreGridItem,
                      selectedGenre === genre && styles.genreTagActive
                    ]}
                    onPress={() => {
                      setSelectedGenre(genre);
                      setIsGenresExpanded(false);
                      // Scroll horizontal list to the selected genre
                      const index = genres.indexOf(genre);
                      if (index !== -1) {
                        setTimeout(() => {
                          genreListRef.current?.scrollToIndex({
                            index,
                            animated: true,
                            viewPosition: 0 // Align to the left for "exact" focus
                          });
                        }, 100);
                      }
                    }}
                  >
                    <Text style={[
                      styles.genreTagText,
                      selectedGenre === genre && styles.genreTagTextActive
                    ]}>
                      {genre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => setIsGenresExpanded(false)}
                style={styles.expandButtonAbsolute}
              >
                <Ionicons name="chevron-up" size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.genreScrollContainer}>
              <FlatList
                ref={genreListRef}
                data={genres}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.genreScroll}
                keyExtractor={(item) => item}
                initialNumToRender={genres.length}
                onScrollToIndexFailed={(info) => {
                  genreListRef.current?.scrollToOffset({
                    offset: info.averageItemLength * info.index,
                    animated: true
                  });
                }}
                renderItem={({ item: genre }) => (
                  <TouchableOpacity
                    style={[styles.genreTag, selectedGenre === genre && styles.genreTagActive]}
                    onPress={() => {
                      setSelectedGenre(genre);
                    }}
                  >
                    <Text style={[styles.genreTagText, selectedGenre === genre && styles.genreTagTextActive]}>
                      {genre}
                    </Text>
                  </TouchableOpacity>
                )}
              />
              <TouchableOpacity
                onPress={() => setIsGenresExpanded(true)}
                style={styles.expandButtonInline}
              >
                <Ionicons name="chevron-down" size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {isClassics && (
          <View style={styles.filterSection}>
            <Text style={styles.sectionTitle}>Category</Text>
            <View style={styles.sortButtonContainer}>
              <TouchableOpacity
                style={[styles.sortButton, browseType === 'novels' && styles.sortButtonActive]}
                onPress={() => setBrowseType('novels')}
              >
                <Text style={[styles.sortButtonText, browseType === 'novels' && styles.sortButtonTextActive]}>
                  Classic Novels
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortButton, browseType === 'poems' && styles.sortButtonActive]}
                onPress={() => setBrowseType('poems')}
              >
                <Text style={[styles.sortButtonText, browseType === 'poems' && styles.sortButtonTextActive]}>
                  Classic Poems
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Sort Filter */}
        <View style={styles.filterSection}>
          <Text style={styles.sectionTitle}>Sort By</Text>
          <View style={styles.sortButtonContainer}>
            {filters.map((filter) => (
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
        {loading && !timedOut && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading {browseType}...</Text>
          </View>
        ) : (timedOut || hasError) ? (
          <ErrorRetryView onRetry={() => fetchBrowseData(true, true)} />
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
    marginBottom: spacing.md,
  },
  schoolFilterCard: {
    marginHorizontal: spacing.lg,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  schoolFilterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  schoolFilterTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  schoolFilterDesc: {
    fontSize: 12,
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
    paddingBottom: spacing.xs,
    paddingRight: 50, // Space for the arrow
  },
  genreScrollContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  genreExpandedContainer: {
    position: 'relative',
  },
  expandButtonInline: {
    position: 'absolute',
    right: 0,
    backgroundColor: themeColors.background,
    height: '100%',
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
    // Add a slight gradient-like shadow effect if possible, or just solid
    shadowColor: themeColors.background,
    shadowOffset: { width: -10, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 5,
    elevation: 5,
  },
  expandButtonAbsolute: {
    position: 'absolute',
    top: -40,
    right: 0,
    padding: spacing.xs,
  },
  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  genreGridItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 20,
    backgroundColor: themeColors.backgroundSecondary,
    borderWidth: 1,
    borderColor: themeColors.border,
    marginBottom: spacing.xs,
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