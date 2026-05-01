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
import ClassicsBadge from '../../components/ClassicsBadge';
import { Ionicons } from '@expo/vector-icons';

import { collection, query, orderBy, limit, getDocs, where, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { Novel } from '../../types/novel';
import type { Poem } from '../../types/poem';
import HeroBanner from '../../components/HeroBanner';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../theme';
import { sendPromotionEndedNotification } from "../../services/notificationServices";
import { getReadingProgress, ReadingProgress, deleteReadingProgress } from '../../services/readingProgressService';
import { useAuth } from '../../contexts/AuthContext';
import { useAlert } from '../../contexts/AlertContext';
import { withCache, CACHE_TTL } from '../../utils/cache';
import { recoverCrashedSession } from '../../services/readingAnalyticsService';
import { ReadingActivityDashboard } from '../../components/ReadingActivityDashboard';

interface BannerSlide {
  id: string
  imageUrl: string
  novelId?: string
  externalLink?: string
  title?: string
  alt?: string
}

// Helper to check if a user is within the 24-hour verification grace period
const isGracePeriodActive = (createdAt: string | undefined): boolean => {
  if (!createdAt) return true
  const createdDate = new Date(createdAt)
  const now = new Date()
  const diffInMs = now.getTime() - createdDate.getTime()
  return diffInMs < 24 * 60 * 60 * 1000
}

export const HomeScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const [promotedNovels, setPromotedNovels] = useState<Novel[]>([]);
  const [trendingNovels, setTrendingNovels] = useState<Novel[]>([]);
  const [trendingPoems, setTrendingPoems] = useState<Poem[]>([]);
  const [newReleases, setNewReleases] = useState<Novel[]>([]);
  const [timelessStories, setTimelessStories] = useState<Novel[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingNewReleases, setLoadingNewReleases] = useState(true);
  const [loadingTimeless, setLoadingTimeless] = useState(true);
  const [loadingPoems, setLoadingPoems] = useState(true);
  const [loadingPromoted, setLoadingPromoted] = useState(true);
  const [loadingBanners, setLoadingBanners] = useState(true);

  const loading = loadingTrending || loadingNewReleases || loadingTimeless || loadingPoems || loadingPromoted || loadingBanners;

  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [banners, setBanners] = useState<BannerSlide[]>([]);
  const [readingProgress, setReadingProgress] = useState<ReadingProgress[]>([]);
  const { currentUser, sendEmailVerificationLink, refreshUser } = useAuth();
  const { showAlert, showToast } = useAlert();
  const [isSendingVerification, setIsSendingVerification] = useState(false);

  const styles = getStyles(colors);

  useEffect(() => {
    // Recover any unfinished reading sessions from previous crashes
    recoverCrashedSession();

    const fetchBanners = async () => {
      try {
        const bannersData = await withCache('home_banners', async () => {
          const q = query(
            collection(db, "banners"),
            where("isActive", "==", true),
            orderBy("priority", "asc")
          )
          const snapshot = await getDocs(q)
          return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as BannerSlide[]
        }, CACHE_TTL.FEED)

        setBanners(bannersData)
      } catch (error: any) {
        if (error.code !== 'permission-denied') console.error('Error fetching banners:', error)
      } finally {
        setLoadingBanners(false)
      }
    }
    fetchBanners()
  }, [])

  useEffect(() => {
    if (!currentUser) {
      setReadingProgress([]);
      return;
    }

    const progressRef = collection(db, 'readingProgress');
    const q = query(
      progressRef,
      where('userId', '==', currentUser.uid),
      orderBy('updatedAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const finishedIds = currentUser.finishedReads || [];
      const rawProgress = snapshot.docs.map(doc => ({ ...doc.data() } as ReadingProgress));

      const filteredProgress = rawProgress.filter(p => !finishedIds.includes(p.novelId));

      if (filteredProgress.length === 0) {
        setReadingProgress([]);
        return;
      }

      const novelIds = [...new Set(filteredProgress.map(p => p.novelId))];

      try {
        const novelsRef = collection(db, 'novels');
        const novelsQuery = query(novelsRef, where('__name__', 'in', novelIds));
        const novelsSnapshot = await getDocs(novelsQuery);

        const existingNovelIds = new Set(
          novelsSnapshot.docs
            .filter(doc => doc.data()?.published === true)
            .map(doc => doc.id)
        );

        const finalProgress = filteredProgress.filter(p => existingNovelIds.has(p.novelId));

        // Clean up deleted/unpublished novels from DB
        const missingIds = novelIds.filter(id => !existingNovelIds.has(id));
        for (const missingId of missingIds) {
          // Fire and forget deletion
          deleteReadingProgress(currentUser.uid, missingId).catch(err =>
            console.error('Error auto-cleaning progress:', err)
          );
        }

        setReadingProgress(finalProgress);
      } catch (error) {
        console.error('Error checking novels availability:', error);
        setReadingProgress(filteredProgress);
      }
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.log('Permission denied in reading progress listener (likely logout)');
      } else {
        console.error('Error listening to reading progress:', error);
      }
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

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


  useEffect(() => {
    const fetchPromoted = async () => {
      try {
        const promotionalData = await withCache('home_promotional', async () => {
          const novelsRef = collection(db, 'novels');
          const q = query(
            novelsRef,
            where('isPromoted', '==', true),
            where('published', '==', true),
            orderBy("createdAt", "desc"),
            limit(7)
          );
          const snapshot = await getDocs(q);
          const dataList: Novel[] = [];
          const now = new Date();

          for (const docSnap of snapshot.docs) {
            const data = docSnap.data() as any;
            const endDate = data.promotionEndDate?.toDate?.() || data.promotionEndDate;

            if (endDate && endDate < now) {
              if (!data.promotionEndNotificationSent) {
                try {
                  await sendPromotionEndedNotification(data.authorId, docSnap.id, data.title);
                } catch (error) { }
              }
              await updateDoc(docSnap.ref, {
                isPromoted: false,
                promotionStartDate: null,
                promotionEndDate: null,
                reference: null,
                promotionPlan: null,
                promotionEndNotificationSent: true
              });
            } else {
              dataList.push({ id: docSnap.id, ...data } as Novel);
            }
          }
          return dataList.map(item => {
            const { chapters, ...rest } = item as any;
            return rest as Novel;
          });
        }, CACHE_TTL.FEED);
        setPromotedNovels(promotionalData);
      } catch (error: any) {
        if (error.code !== 'permission-denied') console.error('Error fetching promoted:', error);
      } finally {
        setLoadingPromoted(false);
      }
    };
    fetchPromoted();
  }, []);

  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const trendingData = await withCache('home_trending', async () => {
          const novelsRef = collection(db, 'novels');
          const q = query(
            novelsRef,
            where('published', '==', true),
            orderBy('views', 'desc')
          );
          const snapshot = await getDocs(q);
          const novels: Novel[] = [];
          snapshot.forEach((doc) => {
            const novelData = { id: doc.id, ...doc.data() } as Novel;
            if (!novelData.isPromoted && !novelData.publicDomain) {
              novels.push(novelData);
            }
          });
          return novels.slice(0, 7).map(item => {
            const { chapters, ...rest } = item as any;
            return rest as Novel;
          });
        }, CACHE_TTL.FEED);
        setTrendingNovels(trendingData);
      } catch (error: any) {
        if (error.code !== 'permission-denied') console.error('Error fetching trending novels:', error);
      } finally {
        setLoadingTrending(false);
      }
    };
    fetchTrending();
  }, []);

  useEffect(() => {
    const fetchNewReleases = async () => {
      try {
        const newReleasesData = await withCache('home_new_releases', async () => {
          const novelsRef = collection(db, 'novels');
          const q = query(novelsRef, where('published', '==', true), where('publicDomain', '==', false), orderBy('createdAt', 'desc'), limit(7));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(doc => {
            const { chapters, ...rest } = doc.data() as any;
            return { id: doc.id, ...rest } as Novel;
          });
        }, CACHE_TTL.FEED);
        setNewReleases(newReleasesData);
      } catch (error: any) {
        if (error.code !== 'permission-denied') console.error('Error fetching new releases:', error);
      } finally {
        setLoadingNewReleases(false);
      }
    };
    fetchNewReleases();
  }, []);

  // For Timeless Stories
  useEffect(() => {
    const fetchTimeless = async () => {
      try {
        const timelessData = await withCache('home_timeless', async () => {
          const novelsRef = collection(db, 'novels');
          const q = query(novelsRef, where('published', '==', true), where('publicDomain', '==', true), orderBy('createdAt', 'desc'), limit(7));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(doc => {
            const { chapters, ...rest } = doc.data() as any;
            return { id: doc.id, ...rest } as Novel;
          });
        }, CACHE_TTL.FEED);
        setTimelessStories(timelessData);
      } catch (error: any) {
        if (error.code !== 'permission-denied') console.error('Error fetching timeless stories:', error);
      } finally {
        setLoadingTimeless(false);
      }
    };
    fetchTimeless();
  }, []);

  useEffect(() => {
    const fetchPoems = async () => {
      try {
        const poemsData = await withCache('home_trending_poems', async () => {
          const poemsRef = collection(db, 'poems');
          const q = query(
            poemsRef,
            where('published', '==', true),
            orderBy('views', 'desc'),
            limit(7)
          );
          const snapshot = await getDocs(q);
          return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              title: data.title || 'Untitled',
              poetName: data.poetName || 'Unknown',
              description: data.description || '',
              genres: data.genres || [],
              poetId: data.poetId || '',
              published: data.published || false,
              createdAt: data.createdAt || '',
              updatedAt: data.updatedAt || '',
              likes: data.likes || 0,
              views: data.views || 0,
              coverImage: data.coverImage,
              coverSmallImage: data.coverSmallImage,
            } as Poem;
          });
        }, CACHE_TTL.FEED);
        setTrendingPoems(poemsData);
      } catch (error: any) {
        if (error.code !== 'permission-denied') console.error('Error fetching trending poems:', error);
      } finally {
        setLoadingPoems(false);
      }
    };
    fetchPoems();
  }, []);

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
        onPress={() => { navigation.navigate('NovelOverview', { novelId: novel.id }); }}
      >
        <View>
          {hasImage ? (
            <CachedImage
              uri={getFirebaseDownloadUrl(novel.coverSmallImage || novel.coverImage || '')}
              style={styles.novelCover}
              onError={() => handleImageError(novel.id)}
              contentFit="cover"
              placeholderColor={colors.backgroundSecondary}
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
          {novel.publicDomain && (
            <ClassicsBadge style={styles.cardBadge} />
          )}
        </View>
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
          navigation.navigate('PoemOverview', { poemId: poem.id });
        }}
      >
        <View>
          {hasImage ? (
            <CachedImage
              uri={getFirebaseDownloadUrl(poem.coverSmallImage || poem.coverImage || '')}
              style={styles.novelCover}
              onError={() => handleImageError(poem.id)}
              contentFit="cover"
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
          {poem.publicDomain && (
            <ClassicsBadge style={styles.cardBadge} />
          )}
        </View>
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

  const handleRemoveProgress = (novelId: string, novelTitle: string) => {
    if (!currentUser) return;

    showAlert({
      title: 'Remove from Continue Reading',
      message: `Are you sure you want to remove "${novelTitle}" from your reading list?`,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReadingProgress(currentUser.uid, novelId);
              showToast({ message: 'Removed from list', type: 'success' });
            } catch (error) {
              console.error('Error removing progress:', error);
            }
          },
        },
      ]
    });
  };

  const renderProgressCard = (progress: ReadingProgress) => {
    const hasImage = progress.novelCover && !imageErrors[progress.novelId];

    return (
      <TouchableOpacity
        key={progress.novelId}
        style={styles.novelCard}
        onPress={() => {
          navigation.navigate('NovelReader', {
            novelId: progress.novelId,
            chapterNumber: progress.chapterIndex,
          });
        }}
        onLongPress={() => handleRemoveProgress(progress.novelId, progress.novelTitle)}
      >
        {hasImage ? (
          <CachedImage
            uri={getFirebaseDownloadUrl(progress.novelCover || '')}
            style={styles.novelCover}
            onError={() => handleImageError(progress.novelId)}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.novelCover, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={styles.fallbackTitle} numberOfLines={3}>
              {progress.novelTitle}
            </Text>
          </View>
        )}
        <Text style={styles.progressChapterText} numberOfLines={1}>
          {progress.chapterTitle}
        </Text>
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

      {/* Verification Banner */}
      {currentUser && !currentUser.emailVerified && isGracePeriodActive(currentUser.createdAt) && (
        <View style={[styles.bannerContainer, { backgroundColor: colors.secondary + '15', borderBottomColor: colors.border }]}>
          <Ionicons name="mail-unread-outline" size={18} color={colors.secondary} />
          <Text style={[styles.bannerText, { color: colors.text }]}>
            Verify your email within 24 hours to keep access.
          </Text>
          <View style={styles.bannerButtons}>
            <TouchableOpacity
              onPress={async () => {
                setIsSendingVerification(true);
                try {
                  await sendEmailVerificationLink();
                  showToast({ message: "Verification email sent! Check your inbox.", type: "success" });
                } catch (error: any) {
                  showToast({ message: error.message || "Failed to send email.", type: "error" });
                } finally {
                  setIsSendingVerification(false);
                }
              }}
              disabled={isSendingVerification}
              style={[styles.bannerButton, { backgroundColor: colors.secondary }]}
            >
              {isSendingVerification ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.bannerButtonText}>Resend</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                setIsSendingVerification(true);
                try {
                  await refreshUser();
                  // No need for alert if it works, the banner will just disappear
                } catch (error: any) {
                  showToast({ message: "Failed to refresh status. Please try again.", type: "error" });
                } finally {
                  setIsSendingVerification(false);
                }
              }}
              disabled={isSendingVerification}
              style={[styles.bannerButton, { backgroundColor: colors.primary, marginLeft: 8 }]}
            >
              <Text style={styles.bannerButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Hero Banner Section */}
      {banners.length > 0 && (
        <HeroBanner slides={banners} autoSlideInterval={5000} />
      )}

      {/* Reading Activity Dashboard */}
      <ReadingActivityDashboard />

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

      {readingProgress.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Continue Reading</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {readingProgress.map(renderProgressCard)}
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
          <Text style={styles.sectionTitle}>Timeless Stories</Text>
        </View>
        {timelessStories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {timelessStories.map(renderNovelCard)}
          </ScrollView>
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptyText}>No timeless stories at the moment</Text>
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
  cardBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 1,
    transform: [{ scale: 0.8 }],
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
  progressChapterText: {
    ...typography.caption,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginTop: spacing.xs,
    textAlign: 'center',
    fontWeight: '600',
  },
  fallbackAuthor: {
    ...typography.caption,
    color: themeColors.textSecondary,
    opacity: 0.75,
    textAlign: 'center',
    display: 'flex',
  },
  // Verification Banner Styles
  bannerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  bannerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    marginHorizontal: 10,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  bannerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  bannerButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
