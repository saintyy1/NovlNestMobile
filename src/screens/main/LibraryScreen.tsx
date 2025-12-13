// src/screens/main/LibraryScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing, typography } from '../../theme';
import { Novel } from '../../types/novel';
import { Poem } from '../../types/poem';

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
    // Novel genres
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
    // Poem genres
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

export const LibraryScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const { currentUser, loading: authLoading } = useAuth();
  const [likedNovels, setLikedNovels] = useState<Novel[]>([]);
  const [finishedNovels, setFinishedNovels] = useState<Novel[]>([]);
  const [likedPoems, setLikedPoems] = useState<Poem[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const styles = getStyles(colors);

  useEffect(() => {
    const fetchUserLibrary = async () => {
      if (authLoading || !currentUser) {
        setLoading(false);
        setLikedNovels([]);
        setFinishedNovels([]);
        setLikedPoems([]);
        return;
      }

      setLoading(true);
      try {
        const likedNovelIds = currentUser.library || [];
        const finishedNovelIds = currentUser.finishedReads || [];
        const likedPoemIds = currentUser.poemLibrary || [];

        const allNovelIds = Array.from(new Set([...likedNovelIds, ...finishedNovelIds]));

        const novelPromises = allNovelIds.map((novelId) => getDoc(doc(db, 'novels', novelId)));
        const poemPromises = likedPoemIds.map((poemId) => getDoc(doc(db, 'poems', poemId)));

        const [novelDocs, poemDocs] = await Promise.all([
          Promise.all(novelPromises),
          Promise.all(poemPromises),
        ]);

        const fetchedLikedNovels: Novel[] = [];
        const fetchedFinishedNovels: Novel[] = [];
        const fetchedLikedPoems: Poem[] = [];

        novelDocs.forEach((novelDoc) => {
          if (novelDoc.exists()) {
            const novel = { id: novelDoc.id, ...novelDoc.data() } as Novel;
            if (likedNovelIds.includes(novel.id)) {
              fetchedLikedNovels.push(novel);
            }
            if (finishedNovelIds.includes(novel.id)) {
              fetchedFinishedNovels.push(novel);
            }
          }
        });

        poemDocs.forEach((poemDoc) => {
          if (poemDoc.exists()) {
            const poem = { id: poemDoc.id, ...poemDoc.data() } as Poem;
            fetchedLikedPoems.push(poem);
          }
        });

        setLikedNovels(fetchedLikedNovels);
        setFinishedNovels(fetchedFinishedNovels);
        setLikedPoems(fetchedLikedPoems);
      } catch (err) {
        console.error('Error fetching user library:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUserLibrary();
  }, [currentUser, authLoading]);

  const handleImageError = (id: string) => {
    setImageErrors((prev) => ({ ...prev, [id]: true }));
  };

  const renderNovelCard = (novel: Novel, isFinished: boolean) => {
    const hasImage = (novel.coverSmallImage || novel.coverImage) && !imageErrors[novel.id];

    return (
      <TouchableOpacity
        key={novel.id}
        style={styles.card}
        onPress={() => navigation.navigate('NovelOverview', { novelId: novel.id })}
      >
        <View style={styles.cardImageContainer}>
          {hasImage ? (
            <Image
              source={{ uri: getFirebaseDownloadUrl(novel.coverSmallImage || novel.coverImage || '') }}
              style={styles.cardImage}
              onError={() => handleImageError(novel.id)}
            />
          ) : (
            <View style={[styles.cardImageFallback, { backgroundColor: getGenreColor(novel.genres) }]}>
              <Text style={styles.fallbackTitle} numberOfLines={3}>
                {novel.title}
              </Text>
              <View style={styles.fallbackDivider} />
              <Text style={styles.fallbackAuthor} numberOfLines={1}>
                {novel.authorName}
              </Text>
            </View>
          )}

          {/* Stats Overlay */}
          <View style={styles.statsOverlay}>
            <View style={styles.statItem}>
              <Ionicons name="eye" size={12} color="#fff" />
              <Text style={styles.statText}>{(novel.views)}</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="heart" size={12} color="#fff" />
              <Text style={styles.statText}>{(novel.likes)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {novel.title}
          </Text>
          <Text style={styles.cardAuthor} numberOfLines={1}>
            by {novel.authorName}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPoemCard = (poem: Poem) => {
    const hasImage = (poem.coverSmallImage || poem.coverImage) && !imageErrors[poem.id];

    return (
      <TouchableOpacity
        key={poem.id}
        style={styles.card}
        onPress={() => navigation.navigate('PoemOverview', { poemId: poem.id })}
      >
        <View style={styles.cardImageContainer}>
          {hasImage ? (
            <Image
              source={{ uri: getFirebaseDownloadUrl(poem.coverSmallImage || poem.coverImage || '') }}
              style={styles.cardImage}
              onError={() => handleImageError(poem.id)}
            />
          ) : (
            <View style={[styles.cardImageFallback, { backgroundColor: getGenreColor(poem.genres) }]}>
              <Ionicons name="rose" size={32} color="rgba(255, 255, 255, 0.4)" style={{ marginBottom: 8 }} />
              <Text style={styles.fallbackTitle} numberOfLines={3}>
                {poem.title}
              </Text>
              <View style={styles.fallbackDivider} />
              <Text style={[styles.fallbackAuthor, { fontStyle: 'italic' }]} numberOfLines={1}>
                by {poem.poetName}
              </Text>
            </View>
          )}

          {/* Stats Overlay */}
          <View style={styles.statsOverlay}>
            <View style={styles.statItem}>
              <Ionicons name="eye" size={12} color="#fff" />
              <Text style={styles.statText}>{(poem.views)}</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="heart" size={12} color="#fff" />
              <Text style={styles.statText}>{(poem.likes)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {poem.title}
          </Text>
          <Text style={[styles.cardAuthor, { fontStyle: 'italic' }]} numberOfLines={1}>
            by {poem.poetName}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (authLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading library...</Text>
      </View>
    );
  }

  if (!currentUser) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="log-in-outline" size={64} color={colors.textSecondary} />
        <Text style={styles.emptyTitle}>Please log in</Text>
        <Text style={styles.emptyText}>Log in to view your library</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Currently Reading Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="book-outline" size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>Currently Reading</Text>
        </View>

        {likedNovels.length === 0 ? (
          <View style={styles.emptySection}>
            <Ionicons name="book-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptySectionTitle}>Your reading list is empty</Text>
            <Text style={styles.emptySectionText}>Start liking novels to add them here!</Text>
            <TouchableOpacity style={styles.browseButton} onPress={() => navigation.navigate('Browse')}>
              <Text style={styles.browseButtonText}>Browse Novels</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.grid}>
            {likedNovels.map((novel) => renderNovelCard(novel, false))}
          </View>
        )}
      </View>

      {/* Finished Reads Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="checkmark-circle-outline" size={24} color={colors.success} />
          <Text style={styles.sectionTitle}>Finished Reads</Text>
        </View>

        {finishedNovels.length === 0 ? (
          <View style={styles.emptySection}>
            <Ionicons name="checkmark-circle-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptySectionTitle}>No finished novels yet</Text>
            <Text style={styles.emptySectionText}>Mark novels as finished to see them here!</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {finishedNovels.map((novel) => renderNovelCard(novel, true))}
          </View>
        )}
      </View>

      {/* Poetry Collection Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="rose-outline" size={24} color="#EC4899" />
          <Text style={styles.sectionTitle}>Poetry Collection</Text>
        </View>

        {likedPoems.length === 0 ? (
          <View style={styles.emptySection}>
            <Ionicons name="rose-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptySectionTitle}>No poems in your collection yet</Text>
            <Text style={styles.emptySectionText}>Start liking poems to add them here!</Text>
            <TouchableOpacity style={styles.browseButton} onPress={() => navigation.navigate('Browse')}>
              <Text style={styles.browseButtonText}>Browse Poems</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.grid}>
            {likedPoems.map((poem) => renderPoemCard(poem))}
          </View>
        )}
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
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: themeColors.background,
  },
  emptyTitle: {
    ...typography.h2,
    color: themeColors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    ...typography.body,
    color: themeColors.textSecondary,
    textAlign: 'center',
  },
  section: {
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.h2,
    color: themeColors.text,
  },
  emptySection: {
    backgroundColor: themeColors.backgroundSecondary,
    borderRadius: 12,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptySectionTitle: {
    ...typography.h3,
    color: themeColors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptySectionText: {
    ...typography.body,
    color: themeColors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  browseButton: {
    backgroundColor: themeColors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    marginTop: spacing.sm,
  },
  browseButtonText: {
    ...typography.body,
    color: '#fff',
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    width: '47%',
    marginBottom: spacing.md,
  },
  cardImageContainer: {
    width: '100%',
    aspectRatio: 0.7,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageFallback: {
    width: '100%',
    height: '100%',
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
  cardInfo: {
    marginTop: spacing.sm,
  },
  cardTitle: {
    ...typography.body,
    color: themeColors.text,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  cardAuthor: {
    ...typography.bodySmall,
    color: themeColors.textSecondary,
  },
  bottomSpacing: {
    height: spacing.lg,
  },
});

const styles = getStyles({ 
  background: '#111827',
  backgroundSecondary: '#1F2937',
  text: '#FFFFFF',
  textSecondary: '#D1D5DB',
  border: '#374151',
  primary: '#8B5CF6',
  success: '#10B981',
});