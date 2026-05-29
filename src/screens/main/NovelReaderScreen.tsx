import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  AlertButton,
  StatusBar,
  Image,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Dimensions,
  Animated,
  Share as RNShare,
  Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import CachedImage from '../../components/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Icon from '@expo/vector-icons/Ionicons';
import {
  doc,
  getDoc,
  updateDoc,
  increment,
  arrayUnion,
  arrayRemove,
  setDoc,
  addDoc,
  collection,
  writeBatch,
  deleteField,
  query,
  orderBy,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Novel } from '../../types/novel';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../contexts/AlertContext';
import {
  trackNovelRead,
  trackChapterStart,
  trackChapterComplete,
  trackReadingProgress,
  trackContentInteraction,
  trackShare,
  getCurrentReadingTime,
} from '../../utils/Analytics-utils';
import { updateReadingProgress } from '../../services/readingProgressService';
import { withCache, invalidateCache, CACHE_TTL } from '../../utils/cache';
import { sendPushNotification } from '../../services/PushNotificationService';
import { hydrateComments } from '../../utils/commentUtils';
import { useReaderSettings } from '../../contexts/ReaderSettingsContext';
import ReaderSettingsModal from '../../components/ReaderSettingsModal';
import { useReadingSession } from '../../hooks/useReadingSession';

interface Comment {
  id: string;
  content?: string;
  text?: string;
  userId: string;
  userName: string;
  userPhoto?: string | null;
  createdAt: string;
  parentId?: string;
  replies?: Comment[];
  likes?: number;
  likedBy?: string[];
}

const InlineImageBlock = ({ uri, maxHeight }: { uri: string; maxHeight: number }) => {
  const [aspectRatio, setAspectRatio] = useState<number>(16 / 9);

  return (
    <View style={{ width: '100%', marginVertical: 32, alignItems: 'center' }}>
      <CachedImage
        uri={uri}
        style={{
          width: '100%',
          aspectRatio,
          maxHeight,
          borderRadius: 8,
        }}
        contentFit="contain"
        onLoad={(e) => {
          if (e.source?.width && e.source?.height) {
            setAspectRatio(e.source.width / e.source.height);
          }
        }}
      />
    </View>
  );
};

const NovelReaderScreen = ({ route, navigation }: any) => {
  const { novelId, id, chapterNumber, chapterIndex, chapter } = route.params || {};
  const { currentUser, toggleFollow } = useAuth();
  const { colors } = useTheme();
  const { showAlert, showToast } = useAlert();
  const insets = useSafeAreaInsets()

  const [novel, setNovel] = useState<Novel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const resolvedNovelId = novelId || id;
  const parseChapter = (val: any) => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  const hasRelativeParam = chapterIndex !== undefined || chapter !== undefined;
  const relativeValue = chapterIndex !== undefined ? parseChapter(chapterIndex) : (chapter !== undefined ? parseChapter(chapter) : 0);

  const initialChapter = chapterNumber !== undefined ? parseChapter(chapterNumber) :
    (hasRelativeParam ? relativeValue : 0);

  const [currentChapter, setCurrentChapter] = useState<number>(initialChapter);
  const [pendingRelativeIndex, setPendingRelativeIndex] = useState<number | null>(
    (chapterNumber === undefined && hasRelativeParam) ? relativeValue : null
  );
  const [showComments, setShowComments] = useState(false);
  const [chapterLiked, setChapterLiked] = useState(false);
  const [chapterLikes, setChapterLikes] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyingToUser, setReplyingToUser] = useState<string>('');
  const [replyContent, setReplyContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [selectedCommentForOptions, setSelectedCommentForOptions] = useState<Comment | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [showReaderSettings, setShowReaderSettings] = useState(false);
  const [showChapterList, setShowChapterList] = useState(false);
  const [isUIHidden, setIsUIHidden] = useState(false);
  const [activeChapterContent, setActiveChapterContent] = useState<{ title: string, content: string, index: number } | null>(null);
  const [contentHeight, setContentHeight] = useState(0);

  const uiOpacity = useRef(new Animated.Value(1)).current;
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const floatingTranslateY = useRef(new Animated.Value(0)).current;

  const { fontSize, fontFamily, readerColors, isPagingEnabled } = useReaderSettings();

  const showCommentOptions = (comment: Comment) => {
    setSelectedCommentForOptions(comment);
    setShowOptionsModal(true);
  };
  const [isAtEnd, setIsAtEnd] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [requestedPage, setRequestedPage] = useState(0);
  const [isMigrating, setIsMigrating] = useState(false);

  const migrateLegacyComments = async (novelId: string, chapterId: string, legacyComments: any[]) => {
    if (!legacyComments || legacyComments.length === 0 || isMigrating) return;

    try {
      setIsMigrating(true);
      console.log(`[Migration] Moving ${legacyComments.length} comments to subcollection for chapter ${chapterId}`);

      const commentsSubRef = collection(db, 'novels', novelId, 'chapters', chapterId, 'comments');
      const batch = writeBatch(db);

      legacyComments.forEach((comment) => {
        const commentDocRef = doc(commentsSubRef, comment.id);
        batch.set(commentDocRef, {
          ...comment,
          migrated: true,
          migratedAt: new Date().toISOString(),
        });
      });

      // Clear legacy array and set initial count
      const chapterRef = doc(db, 'novels', novelId, 'chapters', chapterId);
      batch.update(chapterRef, {
        comments: deleteField(),
        commentCount: legacyComments.length
      });

      await batch.commit();
      console.log('[Migration] Success');

      // Invalidate cache so next fetch sees clean subcollection
      await invalidateCache(`engagement_${novelId}_${chapterId}`);
    } catch (error) {
      console.error('[Migration] Failed:', error);
    } finally {
      setIsMigrating(false);
    }
  };

  const styles = getStyles(colors, insets, fontSize);
  const [showNextChapterHint, setShowNextChapterHint] = useState(false);

  // Precision Cache for paged content
  const pagedCache = useRef<Record<string, any[][]>>({});

  // Clear cache on layout changes
  useEffect(() => {
    pagedCache.current = {};
  }, [fontSize, insets, isPagingEnabled]);

  // Follow states
  const [isFollowing, setIsFollowing] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const replyInputRef = useRef<TextInput>(null);
  const lastChapterRef = useRef<number>(currentChapter);

  // Progress tracking state
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [pageIndex, setPageIndex] = useState<number>(0);
  const lastSavedAtRef = useRef<number>(0);
  const pendingScrollRestorePercentRef = useRef<number | null>(null);
  const restoredProgressRef = useRef<Record<string, boolean>>({});
  const isProgressRestoredRef = useRef<boolean>(false);
  const contentHeightRef = useRef<number>(0);
  const totalPagesRef = useRef<number>(0);
  const viewportHeightRef = useRef<number>(Dimensions.get('window').height - 150);
  const scrollOffsetYRef = useRef<number>(0);
  const SAVE_INTERVAL = 3000; // ms throttle for writes

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Attempt to restore vertical scroll position, retrying until content is measured.
  // Prefers raw offset (pixel-perfect); falls back to percent-based estimation.
  const attemptRestoreScroll = async (
    toPercent: number | null,
    savedOffset?: number | null,
    savedContentHeight?: number | null,
  ) => {
    if (toPercent === null || toPercent === undefined) return false;
    const maxAttempts = 12;
    const delayMs = 200;
    for (let i = 0; i < maxAttempts; i++) {
      if (contentHeightRef.current > 0 && scrollViewRef.current) {
        try {
          let y: number;
          if (typeof savedOffset === 'number' && savedOffset > 0 && typeof savedContentHeight === 'number' && savedContentHeight > 0) {
            // Pixel-perfect: scale the saved offset proportionally if content height changed (e.g. font size)
            const ratio = contentHeightRef.current / savedContentHeight;
            y = Math.max(0, Math.round(savedOffset * ratio));
          } else {
            // Fallback: invert the save formula => offset = (percent/100 * contentSize) - viewport
            y = Math.max(0, Math.round(((toPercent / 100) * contentHeightRef.current) - viewportHeightRef.current));
          }
          scrollViewRef.current?.scrollTo({ y, animated: false });
          console.log('[Reader] Restored vertical scroll to y=', y, 'for percent', toPercent,
            savedOffset != null ? `(from saved offset ${savedOffset})` : '(from percent fallback)');
          return true;
        } catch (e) {
          console.log('[Reader] scrollTo failed:', e);
        }
      }
      await sleep(delayMs);
    }
    console.log('[Reader] Failed to restore vertical scroll (no content height), ref height:', contentHeightRef.current);
    return false;
  };

  // Attempt to restore paginated page index, retrying until FlatList is ready
  const attemptRestorePage = async (idx: number | null) => {
    if (idx === null || idx === undefined) return false;
    const maxAttempts = 12;
    const delayMs = 150;
    for (let i = 0; i < maxAttempts; i++) {
      if (flatListRef.current && totalPagesRef.current > 0) {
        try {
          flatListRef.current?.scrollToIndex({ index: Math.min(Math.max(0, idx), totalPagesRef.current - 1), animated: false });
          console.log('[Reader] Restored paged index to', idx);
          return true;
        } catch (e) {
          // scrollToIndex can fail if layout not ready; ignore and retry
          try {
            const width = Dimensions.get('window').width;
            flatListRef.current?.scrollToOffset({ offset: idx * width, animated: false });
            console.log('[Reader] Restored paged offset to', idx);
            return true;
          } catch (e2) {
            // ignore
          }
        }
      }
      await sleep(delayMs);
    }
    console.log('[Reader] Failed to restore page index, ref total pages:', totalPagesRef.current);
    return false;
  };

  // Initialize reading session tracking
  const { onUserActivity, markAsCompleted } = useReadingSession(
    currentUser?.uid,
    resolvedNovelId,
    novel?.title || 'Unknown Novel',
    currentChapter.toString(),
    'novel'
  );

  // Keep follow state in sync with AuthContext
  useEffect(() => {
    if (currentUser && novel?.authorId) {
      setIsFollowing(currentUser.following?.includes(novel.authorId) || false);
    }
  }, [currentUser?.following, novel?.authorId]);

  const getContentInfo = useCallback((readingOrderIndex: number) => {
    if (!novel) return { type: 'none', chapterIndex: -1, content: '', title: '' };

    let currentIndex = 0;

    if (novel.authorsNote) {
      if (readingOrderIndex === currentIndex) {
        return { type: 'authors-note', chapterIndex: -1, content: novel.authorsNote, title: "Author's Note" };
      }
      currentIndex++;
    }

    if (novel.prologue) {
      if (readingOrderIndex === currentIndex) {
        return { type: 'prologue', chapterIndex: -1, content: novel.prologue, title: 'Prologue' };
      }
      currentIndex++;
    }

    if (novel.characters && novel.characters.length > 0) {
      if (readingOrderIndex === currentIndex) {
        return { type: 'characters', chapterIndex: -1, content: '', title: 'Cast of Characters' };
      }
      currentIndex++;
    }

    const chaptersCount = novel.chapterCount ?? 0;
    const chapterIndex = readingOrderIndex - currentIndex;

    if (chapterIndex >= 0 && chapterIndex < chaptersCount) {

      // If we have activeChapterContent (New architecture, loaded async)
      if (activeChapterContent && activeChapterContent.index === readingOrderIndex) {
        return {
          type: 'chapter',
          chapterIndex: chapterIndex,
          content: activeChapterContent.content,
          title: activeChapterContent.title,
        };
      }

      // Placeholder while loading
      return {
        type: 'chapter',
        chapterIndex: chapterIndex,
        content: '',
        title: novel.chapterTitles ? novel.chapterTitles[chapterIndex] : `Chapter ${chapterIndex + 1}`,
      };
    }

    currentIndex += novel.chapterCount ?? 0;

    if (novel.epilogue) {
      if (readingOrderIndex === currentIndex) {
        return {
          type: 'epilogue',
          chapterIndex: -1,
          content: novel.epilogue.content,
          title: novel.epilogue.title || 'Epilogue'
        };
      }
    }

    return { type: 'none', chapterIndex: -1, content: '', title: '' };
  }, [novel, activeChapterContent, currentChapter]);

  const currentContentInfo = getContentInfo(currentChapter);

  const getChapterDocId = () => {
    if (currentContentInfo.type === 'authors-note') return 'authorsNote';
    if (currentContentInfo.type === 'prologue') return 'prologue';
    if (currentContentInfo.type === 'characters') return 'characters';
    if (currentContentInfo.type === 'epilogue') return 'epilogue';
    return currentContentInfo.chapterIndex.toString();
  };

  // Extract content blocks (paragraphs, chats, images) from content
  const extractChatBlocks = (content: string): Array<{ type: 'paragraph' | 'chat' | 'image', data: any }> => {
    if (!content) return [];
    const result: Array<{ type: 'paragraph' | 'chat' | 'image', data: any }> = [];
    const combinedRegex = /(\[CHAT_START\].*?\[CHAT_END\]|\[IMAGE:.*?\])/gs;
    let lastIndex = 0;
    let match;

    while ((match = combinedRegex.exec(content)) !== null) {
      // Add paragraphs before this block
      if (match.index > lastIndex) {
        const textBefore = content.substring(lastIndex, match.index);
        splitIntoSmartParagraphs(textBefore).forEach(p => {
          result.push({ type: 'paragraph', data: p });
        });
      }

      const matchText = match[0];
      if (matchText.startsWith('[IMAGE:')) {
        // Image block
        const imageUrl = matchText.replace(/\[IMAGE:|\]/g, '');
        result.push({ type: 'image', data: imageUrl });
      }

      lastIndex = combinedRegex.lastIndex;
    }

    // Add remaining paragraphs
    if (lastIndex < content.length) {
      const remainingText = content.substring(lastIndex);
      splitIntoSmartParagraphs(remainingText).forEach(p => {
        result.push({ type: 'paragraph', data: p });
      });
    }

    return result;
  };

  // Smart paragraph splitting function
  const splitIntoSmartParagraphs = (content: string): string[] => {
    const explicitParagraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
    const smartParagraphs: string[] = [];

    for (const para of explicitParagraphs) {
      let cleanPara = para.trim();
      if (cleanPara.startsWith('.') || cleanPara.startsWith(':')) {
        cleanPara = cleanPara.substring(1).trim();
      }
      if (!cleanPara) continue;

      const lines = para.split('\n').filter(l => l.trim().length > 0);
      if (lines.length > 1 && lines[0].length < 60 && /^[A-Z0-9\W]+$/.test(lines[0].trim())) {
        smartParagraphs.push(lines[0].trim());
        const rest = lines.slice(1).join(' ');
        if (rest.trim()) {
          smartParagraphs.push(rest.trim());
        }
        continue;
      }

      cleanPara = cleanPara.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanPara.length < 400) {
        smartParagraphs.push(cleanPara);
        continue;
      }

      const sentences = cleanPara.match(/[^.!?]*[.!?]+(?:\s+|$)|[^.!?]+$/g) || [cleanPara];
      let currentParagraph = '';
      const targetLength = 350;

      for (let i = 0; i < sentences.length; i++) {
        currentParagraph += (currentParagraph ? ' ' : '') + sentences[i].trim();
        if (currentParagraph.length >= targetLength || i === sentences.length - 1) {
          smartParagraphs.push(currentParagraph);
          currentParagraph = '';
        }
      }
    }
    return smartParagraphs;
  };

  const getPagedContent = (chapterIdx: number) => {
    if (!novel) return [];

    const cacheKey = `${novel.id}_${chapterIdx}_${fontSize}_${insets.top}_${insets.bottom}_${novel.updatedAt}`;
    if (pagedCache.current[cacheKey]) return pagedCache.current[cacheKey];

    const contentInfo = getContentInfo(chapterIdx);

    // Cast of Characters — paginate using the same method as chapters
    if (contentInfo.type === 'characters') {
      const chars = novel.characters || [];
      if (chars.length === 0) {
        pagedCache.current[cacheKey] = [];
        return [];
      }

      // Convert characters into blocks: character_header (avatar+name) + paragraph (description)
      const charBlocks: any[] = [];
      chars.forEach((char: any, charIdx: number) => {
        // Avatar (80px) + gap (12px) + name (~30px) + margin ≈ 130px of vertical space
        charBlocks.push({ type: 'character_header', data: charIdx });
        if (char.description) {
          charBlocks.push({ type: 'paragraph', data: char.description });
        }
      });

      // Use the exact same pagination logic as chapters
      const availableWidth = Dimensions.get('window').width - 48;
      const approxLineHeight = Math.round(fontSize * 1.6);
      const availableHeight = Dimensions.get('window').height - (insets.top + insets.bottom + 160);
      const maxLinesPerPage = Math.floor(availableHeight / approxLineHeight);
      const charsPerLine = Math.floor(availableWidth / (fontSize * 0.45));

      const charPages: any[][] = [];
      let currentPage: any[] = [];
      let currentLinesOnPage = 0;

      charBlocks.forEach((block: any) => {
        if (block.type === 'paragraph') {
          let text = block.data;
          while (text.length > 0) {
            const lines = Math.ceil(text.length / charsPerLine);
            const remainingLines = maxLinesPerPage - currentLinesOnPage;

            if (lines <= remainingLines) {
              currentPage.push({ type: 'paragraph', data: text });
              currentLinesOnPage += lines + 1;
              text = "";
            } else if (remainingLines > 3) {
              const splitPoint = Math.floor(remainingLines * charsPerLine * 0.9);
              let breakIdx = text.lastIndexOf(' ', splitPoint);
              if (breakIdx === -1) breakIdx = splitPoint;

              currentPage.push({ type: 'paragraph', data: text.substring(0, breakIdx).trim() });
              charPages.push(currentPage);
              currentPage = [];
              currentLinesOnPage = 0;
              text = text.substring(breakIdx).trim();
            } else {
              if (currentPage.length > 0) charPages.push(currentPage);
              currentPage = [];
              currentLinesOnPage = 0;
            }
          }
        } else {
          // character_header block — avatar (80px) + name (~30px) + spacing ≈ 130px
          const blockWeight = Math.ceil(130 / approxLineHeight);
          if (currentLinesOnPage + blockWeight > maxLinesPerPage) {
            if (currentPage.length > 0) charPages.push(currentPage);
            currentPage = [block];
            currentLinesOnPage = blockWeight;
          } else {
            currentPage.push(block);
            currentLinesOnPage += blockWeight;
          }
        }
      });

      if (currentPage.length > 0) charPages.push(currentPage);
      pagedCache.current[cacheKey] = charPages;
      return charPages;
    }

    if (!contentInfo.content) return [];
    const pages: any[][] = [];
    let currentPage: any[] = [];

    const availableWidth = Dimensions.get('window').width - 48;
    const approxLineHeight = Math.round(fontSize * 1.6);
    const availableHeight = Dimensions.get('window').height - (insets.top + insets.bottom + 160);
    const maxLinesPerPage = Math.floor(availableHeight / approxLineHeight);

    const charsPerLine = Math.floor(availableWidth / (fontSize * 0.45));
    let currentLinesOnPage = 0;

    const allBlocks = extractChatBlocks(contentInfo.content);

    allBlocks.forEach((block: any) => {
      if (block.type === 'paragraph') {
        let text = block.data;
        while (text.length > 0) {
          const lines = Math.ceil(text.length / charsPerLine);
          const remainingLines = maxLinesPerPage - currentLinesOnPage;

          if (lines <= remainingLines) {
            currentPage.push({ type: 'paragraph', data: text });
            currentLinesOnPage += lines + 1;
            text = "";
          } else if (remainingLines > 3) {
            const splitPoint = Math.floor(remainingLines * charsPerLine * 0.9);
            let breakIdx = text.lastIndexOf(' ', splitPoint);
            if (breakIdx === -1) breakIdx = splitPoint;

            currentPage.push({ type: 'paragraph', data: text.substring(0, breakIdx).trim() });
            pages.push(currentPage);
            currentPage = [];
            currentLinesOnPage = 0;
            text = text.substring(breakIdx).trim();
          } else {
            if (currentPage.length > 0) pages.push(currentPage);
            currentPage = [];
            currentLinesOnPage = 0;
          }
        }
      } else {
        const blockWeight = block.type === 'chat' ? (block.data.length * 2) : 10;
        if (currentLinesOnPage + blockWeight > maxLinesPerPage) {
          if (currentPage.length > 0) pages.push(currentPage);
          currentPage = [block];
          currentLinesOnPage = blockWeight;
        } else {
          currentPage.push(block);
          currentLinesOnPage += blockWeight;
        }
      }
    });

    if (currentPage.length > 0) pages.push(currentPage);
    pagedCache.current[cacheKey] = pages;
    return pages;
  };

  const availableHeight_ = Dimensions.get('window').height - insets.top - insets.bottom;
  const approxLineHeight_ = Math.round(fontSize * 1.6);
  const targetContentHeight = availableHeight_ * 0.65;
  const pageHeight = Math.floor(targetContentHeight / approxLineHeight_) * approxLineHeight_;
  const topPadding = (availableHeight_ - pageHeight) * 0.35;

  const pagedContent = getPagedContent(currentChapter);
  const totalPages = pagedContent.length;
  totalPagesRef.current = totalPages;

  // Update percent when paginated content becomes available or when a requested page is set
  useEffect(() => {
    if (isPagingEnabled && pagedContent.length > 0) {
      const idx = Math.min(Math.max(0, requestedPage !== 0 ? requestedPage : pageIndex), pagedContent.length - 1);
      setPageIndex(idx);
      const percent = Math.round(((idx + 1) / pagedContent.length) * 100) || 0;
      setProgressPercent(percent);
    }
  }, [isPagingEnabled, pagedContent.length, requestedPage]);

  const getTotalReadingOrderItems = useCallback(() => {
    if (!novel) return 0;
    let count = 0;
    if (novel.authorsNote) count++;
    if (novel.prologue) count++;
    if (novel.characters && novel.characters.length > 0) count++;
    count += novel.chapterCount ?? 0;
    if (novel.epilogue) count++;
    return count;
  }, [novel]);

  useEffect(() => {
    const fetchNovel = async () => {
      if (!resolvedNovelId) return;

      try {
        setLoading(true);
        const novelData = await withCache(`novel_${resolvedNovelId}`, async () => {
          const novelDoc = await getDoc(doc(db, 'novels', resolvedNovelId));
          if (novelDoc.exists()) {
            return { id: novelDoc.id, ...novelDoc.data() } as Novel;
          }
          throw new Error('Novel not found');
        }, CACHE_TTL.CONTENT);

        setNovel(novelData);
        // Clear paging cache because the content might have changed
        pagedCache.current = {};

        // Apply relative offset if needed
        if (pendingRelativeIndex !== null) {
          const offset = (novelData.authorsNote ? 1 : 0) + (novelData.prologue ? 1 : 0) + ((novelData.characters && novelData.characters.length > 0) ? 1 : 0);
          setCurrentChapter(offset + pendingRelativeIndex);
          setPendingRelativeIndex(null);
        }

        if (currentUser) {
          await updateDoc(doc(db, 'novels', resolvedNovelId), {
            views: increment(1),
          });
          // Invalidate novel cache to ensure overview shows fresh view count
          await invalidateCache(`novel_${resolvedNovelId}`);
        }
      } catch (err: any) {
        if (err.message === 'Novel not found') {
          setError('Novel not found');
        } else {
          console.error('Error fetching novel:', err);
          setError('Failed to load novel');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchNovel();
  }, [novelId, currentUser]);

  useFocusEffect(
    useCallback(() => {
      if (novel) {
        // Re-fetch to check for updates (this will use cache unless invalidated by editor)
        const fetchUpdates = async () => {
          try {
            const novelData = await withCache(`novel_${resolvedNovelId}`, async () => {
              const novelDoc = await getDoc(doc(db, 'novels', resolvedNovelId));
              if (novelDoc.exists()) {
                return { id: novelDoc.id, ...novelDoc.data() } as Novel;
              }
              throw new Error('Novel not found');
            }, CACHE_TTL.CONTENT);

            if (novelData.updatedAt !== novel?.updatedAt) {
              setNovel(novelData);
              pagedCache.current = {}; // Hard clear paging cache on update
            }
          } catch (e) {
            console.log("Silent update fetch failed:", e);
          }
        };
        fetchUpdates();
      }
    }, [resolvedNovelId, novel?.updatedAt])
  );

  useEffect(() => {
    const fetchChapterData = async () => {
      if (!novel) return;

      // Reset restored flag to false to prevent race conditions during chapter loading/restoration
      isProgressRestoredRef.current = false;
      contentHeightRef.current = 0;
      setContentHeight(0);

      // Clear previous content immediately to avoid showing stale content while loading
      setActiveChapterContent(null);

      try {
        const isChapter = currentContentInfo.type === 'chapter';
        const isEpilogue = currentContentInfo.type === 'epilogue';
        const isSpecialPart = ['authors-note', 'prologue', 'characters'].includes(currentContentInfo.type);

        let chapterData: any = null;

        if (isEpilogue) {
          // Epilogue is in the main document (Legacy/Small structure)
          chapterData = novel.epilogue;
        } else if (isSpecialPart) {
          // Special parts already have their content in currentContentInfo
          chapterData = {
            title: currentContentInfo.title,
            content: currentContentInfo.content,
          };
        } else {
          // Regular chapter - fetch from sub-collection
          const chapterId = currentContentInfo.chapterIndex.toString();
          const chapterCacheKey = `chapter_${novel.id}_${chapterId}`;

          chapterData = await withCache(chapterCacheKey, async () => {
            const chapterRef = doc(db, 'novels', novel.id, 'chapters', chapterId);
            const chapterDoc = await getDoc(chapterRef);

            if (chapterDoc.exists()) {
              return chapterDoc.data();
            }
            return { _notFound: true };
          }, CACHE_TTL.CONTENT);
        }

        if (!chapterData || chapterData._notFound) {
          throw new Error('Chapter not found');
        }

        // --- NEW ENGAGEMENT FETCH LOGIC (Subcollection Support) ---
        const engagementDocId = getChapterDocId();
        const engagementCacheKey = `engagement_${novel.id}_${engagementDocId}`;
        const engagementData = await withCache(engagementCacheKey, async () => {
          const engRef = doc(db, 'novels', novel.id, 'chapters', engagementDocId);
          const engDoc = await getDoc(engRef);

          let chapterLikes = 0;
          let chapterLikedBy: string[] = [];
          let comments: any[] = [];
          let fromLegacyArray = false;

          if (engDoc.exists()) {
            const data = engDoc.data();
            chapterLikes = data.chapterLikes || 0;
            chapterLikedBy = data.chapterLikedBy || [];

            // Check for legacy comments
            if (data.comments && data.comments.length > 0) {
              comments = data.comments;
              fromLegacyArray = true;
            }
          }

          // ALWAYS fetch from subcollection to see new comments
          try {
            const commentsQuery = query(
              collection(db, 'novels', novel.id, 'chapters', engagementDocId, 'comments'),
              orderBy('createdAt', 'desc')
            );
            const commentsSnapshot = await getDocs(commentsQuery);
            const subcollectionComments: any[] = [];
            commentsSnapshot.forEach(doc => {
              subcollectionComments.push({ id: doc.id, ...doc.data() });
            });

            // Merge them: Subcollection comments take priority if IDs match (rare but safe)
            const subIds = new Set(subcollectionComments.map(c => c.id));
            comments = [...subcollectionComments, ...comments.filter(c => !subIds.has(c.id))];
          } catch (e) {
            console.log("Error fetching chapter comments subcollection:", e);
          }

          return { chapterLikes, chapterLikedBy, comments, fromLegacyArray };
        }, CACHE_TTL.CONTENT);

        // --- TRIGGER MIGRATION (Outside Cache Block) ---
        // Even if data is from cache, if we are the author and see unmigrated comments, trigger it.
        const hasUnmigrated = engagementData.comments && engagementData.comments.some((c: any) => !c.migrated);

        if (hasUnmigrated && currentUser && currentUser.uid === novel.authorId) {
          migrateLegacyComments(novel.id, engagementDocId, engagementData.comments);
        }

        // Merge engagement into chapterData
        chapterData = { ...chapterData, ...engagementData };

        // Set active chapter content for the reader
        if (isChapter || isEpilogue) {
          setActiveChapterContent({
            title: chapterData.title || currentContentInfo.title,
            content: chapterData.content || '',
            index: currentChapter,
          });
        } else {
          setActiveChapterContent(null);
        }

        // Attempt to restore saved progress for this chapter.
        // Prefer a local AsyncStorage copy (fast / offline) and fall back to Firestore.
        // Allow restoration when the route explicitly provided savedPage/savedPercent params,
        // or when the user didn't explicitly request a chapter.
        const hasExplicitChapter = chapterNumber !== undefined || chapterIndex !== undefined || chapter !== undefined;
        const hasSavedParam = (route && (route.params?.savedPage !== undefined || route.params?.savedPercent !== undefined));
        // Always attempt to restore saved progress for this chapter (Continue Reading supplies chapterNumber)
        if (currentUser && novel) {
          const restoreKey = `${novel.id}_${currentChapter}`;
          if (!restoredProgressRef.current[restoreKey]) {
            try {
              const storageKey = `reading_progress_${currentUser.uid}_${novel.id}`;

              // Load local and remote in parallel
              let localProg: any = null;
              try {
                const raw = await AsyncStorage.getItem(storageKey);
                if (raw) localProg = JSON.parse(raw);
              } catch (e) {
                // ignore local read errors
              }

              let remoteProg: any = null;
              try {
                const progRef = doc(db, 'readingProgress', `${currentUser.uid}_${novel.id}`);
                const progSnap = await getDoc(progRef);
                if (progSnap.exists()) remoteProg = progSnap.data();
              } catch (e) {
                // ignore remote read errors
              }

              // Normalize timestamps and pick freshest
              const localTime = localProg?.updatedAt || 0;
              let remoteTime = 0;
              if (remoteProg && remoteProg.updatedAt) {
                if (typeof remoteProg.updatedAt === 'number') remoteTime = remoteProg.updatedAt;
                else if (remoteProg.updatedAt?.toMillis) remoteTime = remoteProg.updatedAt.toMillis();
              }

              const prog = (localTime >= remoteTime && localProg) ? localProg : remoteProg || localProg;

              if (prog && typeof prog.chapterIndex === 'number' && prog.chapterIndex === currentChapter) {
                console.log('[Reader] Restoring progress for', novel.id, 'chapter', currentChapter, 'prog:', prog);
                // Allow route params to override stored progress when present
                const routeSavedPage = route?.params?.savedPage;
                const routeSavedPercent = route?.params?.savedPercent;
                const usePage = (routeSavedPage !== undefined && routeSavedPage !== null) ? routeSavedPage : (typeof prog.pageIndex === 'number' ? prog.pageIndex : null);
                const usePercent = (routeSavedPercent !== undefined && routeSavedPercent !== null) ? routeSavedPercent : (typeof prog.progressPercent === 'number' ? prog.progressPercent : null);

                if (isPagingEnabled && usePage !== null) {
                  setRequestedPage(usePage as number);
                  setPageIndex(usePage as number);
                  // Try restoring page after FlatList mounts; helper will retry until ready
                  attemptRestorePage(usePage as number).then((ok) => {
                    if (!ok) console.log('[Reader] Page restore attempt failed, will rely on initialScrollIndex or later retries.');
                  });
                } else if (!isPagingEnabled && usePercent !== null) {
                  pendingScrollRestorePercentRef.current = usePercent as number;
                  // Pass saved raw offset for pixel-perfect restoration (local records only)
                  const savedOffset = typeof prog.scrollOffsetY === 'number' ? prog.scrollOffsetY : null;
                  const savedContentHeight = typeof prog.scrollContentHeight === 'number' ? prog.scrollContentHeight : null;
                  attemptRestoreScroll(usePercent as number, savedOffset, savedContentHeight).then((ok) => {
                    if (!ok) console.log('[Reader] Vertical restore attempt failed, will retry later on layout.');
                    pendingScrollRestorePercentRef.current = null;
                  });
                }
              }
            } catch (e) {
              console.log('Error restoring reading progress:', e);
            }
            restoredProgressRef.current[restoreKey] = true;
          }
        }

        setChapterLiked(currentUser ? chapterData.chapterLikedBy?.includes(currentUser.uid) || false : false);
        setChapterLikes(chapterData.chapterLikes || 0);

        const allComments = (chapterData.comments || []) as Comment[];
        const hydratedComments = await hydrateComments<Comment>(allComments);
        const organizedComments = organizeComments(hydratedComments);
        setComments(organizedComments);

        // Predictive Prefetching: Pre-calculate paging and pre-load metadata for neighbors
        const prefetch = async (idx: number) => {
          if (!novel || idx < 0 || idx >= getTotalReadingOrderItems()) return;

          // 1. Pre-calculate paging (CPU bound)
          getPagedContent(idx);

          // 2. Pre-load chapter metadata (Network bound)
          const info = getContentInfo(idx);
          if (info.type !== 'chapter') return; // Epilogue/Others are already in 'novel'

          const id = info.chapterIndex.toString();
          const key = `chapter_${novel.id}_${id}`;
          try {
            await withCache(key, async () => {
              const ref = doc(db, 'novels', novel.id, 'chapters', id);
              const d = await getDoc(ref);
              return d.exists() ? d.data() : { _notFound: true };
            }, CACHE_TTL.CONTENT);
          } catch (e) {
            // Ignore prefetch errors
          }
        };

        // Run in background
        setTimeout(() => {
          prefetch(currentChapter + 1);
          prefetch(currentChapter - 1);
        }, 500);

      } catch (error: any) {
        if (error.message === 'Chapter not found') {
          setChapterLiked(false);
          setChapterLikes(0);
          setComments([]);
        } else {
          console.error('Error fetching chapter data:', error);
        }
      } finally {
        isProgressRestoredRef.current = true;
      }
    };

    fetchChapterData();
  }, [novel, currentChapter, currentUser]);

  // Reset scroll position when chapter changes
  useEffect(() => {
    setIsAtEnd(false);
    setShowNextChapterHint(false);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });

    const chapterChanged = lastChapterRef.current !== currentChapter;
    lastChapterRef.current = currentChapter;

    // Reset scroll position ONLY on chapter transition if no specific page is requested
    if (chapterChanged && requestedPage === 0) {
      flatListRef.current?.scrollToIndex({ index: 0, animated: false });
    }
    // Just reset the requested page state if it was consumed by initialScrollIndex
    else if (requestedPage !== 0 && pagedContent.length > 0) {
      setRequestedPage(0);
    }

    // Track chapter start for analytics
    if (novel && currentContentInfo.type === 'chapter') {
      trackChapterStart({
        novelId: novel.id,
        novelTitle: novel.title,
        chapterNumber: currentContentInfo.chapterIndex + 1,
        chapterTitle: currentContentInfo.title,
        userId: currentUser?.uid,
      });

      trackNovelRead({
        novelId: novel.id,
        novelTitle: novel.title,
        chapterNumber: currentContentInfo.chapterIndex + 1,
        userId: currentUser?.uid,
        isAnonymous: !currentUser,
      });
    }
  }, [currentChapter, pagedContent.length, requestedPage]);

  // Persist reading progress helper (throttled)
  const persistReadingProgress = useCallback(async (force: boolean = false) => {
    if (!novel || !currentUser) return;
    if (!isProgressRestoredRef.current) {
      console.log('[Reader] Skipping progress save: progress has not been restored yet.');
      return;
    }
    try {
      const storageKey = `reading_progress_${currentUser.uid}_${novel.id}`;

      // Read existing local copy
      let existingLocal: any = null;
      try {
        const rawLocal = await AsyncStorage.getItem(storageKey);
        if (rawLocal) existingLocal = JSON.parse(rawLocal);
      } catch (e) {
        existingLocal = null;
      }

      // Read existing remote copy to avoid overwriting fresher/better progress
      let existingRemote: any = null;
      try {
        const progRef = doc(db, 'readingProgress', `${currentUser.uid}_${novel.id}`);
        const progSnap = await getDoc(progRef);
        if (progSnap.exists()) existingRemote = progSnap.data();
      } catch (e) {
        existingRemote = null;
      }

      // Decide whether to write local: avoid overwriting a richer recent record with a lower/zero progress
      const newPercent = typeof progressPercent === 'number' ? progressPercent : null;
      const newPage = typeof pageIndex === 'number' ? pageIndex : null;
      let shouldWriteLocal = true;

      if (existingLocal && existingLocal.progressPercent != null && newPercent != null) {
        const localAge = Date.now() - (existingLocal.updatedAt || 0);
        if (existingLocal.progressPercent > newPercent && localAge < 15000) {
          shouldWriteLocal = false;
        }
      }

      if (shouldWriteLocal && existingRemote && existingRemote.progressPercent != null && newPercent != null) {
        let remoteTime = 0;
        if (existingRemote.updatedAt) {
          if (typeof existingRemote.updatedAt === 'number') remoteTime = existingRemote.updatedAt;
          else if (existingRemote.updatedAt?.toMillis) remoteTime = existingRemote.updatedAt.toMillis();
        }
        const remoteAge = Date.now() - (remoteTime || 0);
        if (existingRemote.progressPercent > newPercent && remoteAge < 15000) {
          shouldWriteLocal = false;
        }
      }

      if (shouldWriteLocal) {
        try {
          const localObj = {
            chapterIndex: currentChapter,
            chapterTitle: currentContentInfo.title,
            progressPercent: newPercent,
            pageIndex: newPage,
            scrollOffsetY: scrollOffsetYRef.current,
            scrollContentHeight: contentHeightRef.current,
            updatedAt: Date.now(),
          };
          await AsyncStorage.setItem(storageKey, JSON.stringify(localObj));
          console.log('[Reader] Saved local progress', storageKey, localObj);
        } catch (e) {
          // ignore local write errors
        }
      } else {
        console.log('[Reader] Skipped local overwrite (existing local/remote fresher or higher)');
      }

      // Remote save (Firestore)
      await updateReadingProgress(
        currentUser.uid,
        novel.id,
        novel.title,
        novel.coverSmallImage || novel.coverImage,
        currentChapter,
        currentContentInfo.title,
        progressPercent,
        pageIndex
      );

      console.log('[Reader] Persisted progress remote', { novelId: novel.id, chapter: currentChapter, progressPercent, pageIndex });

      lastSavedAtRef.current = Date.now();
    } catch (err) {
      console.error('Error persisting reading progress:', err);
    }
  }, [novel, currentUser, currentChapter, currentContentInfo.title, progressPercent, pageIndex]);

  // Save reading progress when chapter changes and when leaving the screen
  useEffect(() => {
    if (novel && currentUser) {
      // Save immediately for chapter changes
      persistReadingProgress();

      // Also save on cleanup (leaving screen)
      return () => {
        persistReadingProgress();
      };
    }
  }, [currentChapter, novel, currentUser, currentContentInfo.title, persistReadingProgress]);

  // Track reading progress based on scroll position
  const lastProgressRef = useRef<number>(0);

  // Handle scroll to detect end of chapter
  const handleScroll = (event: any) => {
    // Notify session tracker of activity
    onUserActivity();

    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 50;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    // Keep refs in sync for scroll restoration
    viewportHeightRef.current = layoutMeasurement.height;
    contentHeightRef.current = contentSize.height;
    scrollOffsetYRef.current = contentOffset.y;

    // Calculate reading progress percentage
    const progressPercent = Math.min(100, Math.round((contentOffset.y + layoutMeasurement.height) / contentSize.height * 100));

    // Update UI state
    setProgressPercent(progressPercent);

    // Persist periodically (throttled)
    if (Date.now() - lastSavedAtRef.current > SAVE_INTERVAL) {
      persistReadingProgress();
    }

    // Track progress at milestones (25%, 50%, 75%, 100%)
    if (novel && currentContentInfo.type === 'chapter') {
      const currentMilestone = Math.floor(progressPercent / 25) * 25;
      const lastMilestone = Math.floor(lastProgressRef.current / 25) * 25;

      if (currentMilestone > lastMilestone && currentMilestone > 0) {
        trackReadingProgress({
          novelId: novel.id,
          chapterNumber: currentContentInfo.chapterIndex + 1,
          progressPercent: currentMilestone,
        });
      }
      lastProgressRef.current = progressPercent;
    }

    if (isCloseToBottom && !isAtEnd) {
      setIsAtEnd(true);
      if (currentChapter < getTotalReadingOrderItems() - 1) {
        setShowNextChapterHint(true);
      }

      // Mark session as completed
      markAsCompleted();

      // Track chapter complete when reaching end
      if (novel && currentContentInfo.type === 'chapter') {
        trackChapterComplete({
          novelId: novel.id,
          novelTitle: novel.title,
          chapterNumber: currentContentInfo.chapterIndex + 1,
          chapterTitle: currentContentInfo.title,
          userId: currentUser?.uid,
        });
      }
    } else if (!isCloseToBottom && isAtEnd) {
      setIsAtEnd(false);
      setShowNextChapterHint(false);
    }
  };

  // Handle swipe up at end to go to next chapter
  const handleScrollEndDrag = (event: any) => {
    if (!isAtEnd || currentChapter >= getTotalReadingOrderItems() - 1) return;

    const { velocity } = event.nativeEvent;
    // If user swipes up with enough velocity at the end
    if (velocity && velocity.y < -0.5) {
      goToNextChapter();
    }
  };

  const goToNextChapter = (startAtPage: number = 0) => {
    if (currentChapter >= getTotalReadingOrderItems() - 1) return;

    const screenHeight = Dimensions.get('window').height;

    Animated.timing(slideAnim, {
      toValue: -screenHeight,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setRequestedPage(startAtPage);
      setCurrentChapter(currentChapter + 1);
      slideAnim.setValue(screenHeight);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleShare = async () => {
    try {
      const chapterInfo = currentContentInfo.type === 'chapter'
        ? `Chapter ${currentContentInfo.chapterIndex + 1}: ${currentContentInfo.title}`
        : currentContentInfo.title;

      await RNShare.share({
        message: `I'm reading "${chapterInfo}" from "${novel?.title}" by ${novel?.authorName} on NovlNest! Check it out: https://novlnest.com/novel/${novel?.id}/read?chapter=${currentChapter}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const goToPreviousChapter = (startAtPage: number = 0) => {
    if (currentChapter <= 0) return;

    const screenHeight = Dimensions.get('window').height;

    Animated.timing(slideAnim, {
      toValue: screenHeight,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setRequestedPage(startAtPage);
      setCurrentChapter(currentChapter - 1);
      slideAnim.setValue(-screenHeight);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });
  };

  function organizeComments(allComments: Comment[]): Comment[] {
    const topLevel = allComments.filter((c) => !c.parentId);

    const buildReplies = (parentId: string): Comment[] => {
      return allComments
        .filter((c) => c.parentId === parentId)
        .map((reply) => ({
          ...reply,
          replies: buildReplies(reply.id),
        }));
    };

    return topLevel.map((comment) => ({
      ...comment,
      replies: buildReplies(comment.id),
    }));
  }

  function getTotalCommentsCount(commentList: Comment[]): number {
    return commentList.reduce((acc, comment) => {
      const replyCount = comment.replies ? getTotalCommentsCount(comment.replies) : 0;
      return acc + 1 + replyCount;
    }, 0);
  }

  const handleChapterLike = async () => {
    if (!novel?.id || !currentUser) {
      showAlert({
        title: 'Login Required',
        message: 'Please login to like chapters',
        type: 'info',
        useNative: true
      });
      return;
    }

    try {
      const chapterId = getChapterDocId();
      const chapterRef = doc(db, 'novels', novel.id, 'chapters', chapterId);
      const chapterDoc = await getDoc(chapterRef);
      const newLikeStatus = !chapterLiked;

      setChapterLiked(newLikeStatus);
      setChapterLikes((prev) => (newLikeStatus ? prev + 1 : prev - 1));

      if (!chapterDoc.exists()) {
        await setDoc(chapterRef, {
          chapterLikes: newLikeStatus ? 1 : 0,
          chapterLikedBy: newLikeStatus ? [currentUser.uid] : [],
          comments: [],
        });
      } else {
        await updateDoc(chapterRef, {
          chapterLikes: increment(newLikeStatus ? 1 : -1),
          chapterLikedBy: newLikeStatus ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid),
        });
      }

      // Invalidate chapter and engagement caches to ensure immediate update
      const chapterCacheKey = `chapter_${novel.id}_${chapterId}`;
      const engagementCacheKey = `engagement_${novel.id}_${chapterId}`;
      await invalidateCache(chapterCacheKey);
      await invalidateCache(engagementCacheKey);
      // Invalidate novel cache in case overview aggregates chapter likes
      await invalidateCache(`novel_${novel.id}`);

      if (newLikeStatus && novel.authorId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: novel.authorId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || 'Anonymous',
          type: 'chapter_like',
          novelId: novel.id,
          novelTitle: novel.title,
          chapterNumber: currentChapter + 1,
          chapterTitle: currentContentInfo.title,
          createdAt: new Date().toISOString(),
          read: false,
        });

        // Send Push Notification
        await sendPushNotification(
          novel.authorId,
          `${currentUser.displayName || "Someone"}`,
          `Liked your chapter "${currentContentInfo.title}" in "${novel.title}"`,
          { url: `novlnest://novel/${novel.id}/read?chapter=${currentChapter}` }
        );
      }
    } catch (error) {
      console.error('Error updating chapter like:', error);
      setChapterLiked(!chapterLiked);
      showAlert({ message: 'Failed to update like status', type: 'error', useNative: true });
    }
  };

  const handleFollowToggle = async () => {
    if (!currentUser) {
      showAlert({
        title: 'Login Required',
        message: 'Please login to follow authors',
        type: 'info',
        useNative: true
      });
      return;
    }
    if (!novel?.authorId) return;

    try {
      setIsTogglingFollow(true);

      // Optimistic update to UI
      setIsFollowing(!isFollowing);

      await toggleFollow(novel.authorId, isFollowing);

      // Send Push Notification
      await sendPushNotification(
        novel.authorId,
        `${currentUser.displayName || "Someone"} 👤`,
        `Started following you`,
        { url: `novlnest://profile/${currentUser.uid}` }
      )
      // Invalidate profile cache
      await invalidateCache(`profile_user_${novel.authorId}`);

    } catch (error) {
      console.error('Error toggling follow:', error);
      showAlert({ message: 'Failed to update follow status', type: 'error', useNative: true });
      // Revert on error
      setIsFollowing(isFollowing);
    } finally {
      setIsTogglingFollow(false);
    }
  };

  const handleAddComment = async () => {
    if (!novel?.id || !currentUser || !newComment.trim() || submittingComment) return;

    try {
      setSubmittingComment(true);
      const chapterId = getChapterDocId();
      const chapterRef = doc(db, 'novels', novel.id, 'chapters', chapterId);
      const chapterDoc = await getDoc(chapterRef);

      const commentId = Date.now().toString();
      const commentSubRef = doc(db, 'novels', novel.id, 'chapters', chapterId, 'comments', commentId);

      const comment: Comment = {
        id: commentId,
        content: newComment.trim(),
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userPhoto: currentUser.photoURL || null,
        createdAt: new Date().toISOString(),
        likes: 0,
        likedBy: [],
      };

      await setDoc(commentSubRef, comment);

      // Update lightweight count in chapter doc
      await updateDoc(chapterRef, {
        commentCount: increment(1)
      });

      // Invalidate engagement cache
      const engagementCacheKey = `engagement_${novel.id}_${chapterId}`;
      await invalidateCache(engagementCacheKey);
      // Invalidate novel cache to refresh comment stats on overview
      await invalidateCache(`novel_${novel.id}`);

      if (novel.authorId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: novel.authorId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || 'Anonymous',
          type: 'novel_comment',
          novelId: novel.id,
          novelTitle: novel.title,
          commentContent: newComment.trim(),
          chapterNumber: currentChapter + 1,
          chapterTitle: currentContentInfo.title,
          createdAt: new Date().toISOString(),
          read: false,
        });

        // Send Push Notification
        await sendPushNotification(
          novel.authorId,
          `${currentUser.displayName || "Someone"}`,
          `Commented on your novel "${novel.title}: ${currentContentInfo.title}"`,
          { url: `novlnest://novel/${novel.id}/read?chapter=${currentChapter}` }
        );
      }

      // Update local state optimistically
      setComments(prev => organizeComments([...(prev.flatMap(c => [c, ...(c.replies || [])])), comment]));
      setNewComment('');
      showAlert({ title: 'Success', message: 'Comment posted successfully!', type: 'info', useNative: true });
    } catch (error) {
      console.error('Error adding comment:', error);
      showAlert({ message: 'Failed to post comment', type: 'error', useNative: true });
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleAddReply = async (parentId: string) => {
    if (!novel?.id || !currentUser || !replyContent.trim() || submittingReply === parentId) return;

    try {
      setSubmittingReply(parentId);
      const chapterId = getChapterDocId();
      const chapterRef = doc(db, 'novels', novel.id, 'chapters', chapterId);
      const chapterDoc = await getDoc(chapterRef);

      if (!chapterDoc.exists()) return;

      const existingComments = chapterDoc.data().comments || [];
      const parentComment = existingComments.find((c: Comment) => c.id === parentId);

      const replyId = Date.now().toString();
      const replySubRef = doc(db, 'novels', novel.id, 'chapters', chapterId, 'comments', replyId);

      const reply: Comment = {
        id: replyId,
        content: replyContent.trim(),
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userPhoto: currentUser.photoURL || null,
        createdAt: new Date().toISOString(),
        parentId: parentId,
        likes: 0,
        likedBy: [],
      };

      await setDoc(replySubRef, reply);

      // Update lightweight count in chapter doc
      await updateDoc(chapterRef, {
        commentCount: increment(1)
      });

      // Invalidate engagement cache
      const engagementCacheKey = `engagement_${novel.id}_${chapterId}`;
      await invalidateCache(engagementCacheKey);

      if (novel.authorId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: novel.authorId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || 'Anonymous',
          type: 'novel_reply',
          novelId: novel.id,
          novelTitle: novel.title,
          commentContent: replyContent.trim(),
          parentId: parentId,
          chapterNumber: currentChapter + 1,
          chapterTitle: currentContentInfo.title,
          createdAt: new Date().toISOString(),
          read: false,
        });

        // Send Push Notification
        await sendPushNotification(
          novel.authorId,
          `${currentUser.displayName || "Someone"}`,
          `Replied to a comment in "${novel.title}: ${currentContentInfo.title}"`,
          { url: `novlnest://novel/${novel.id}/read?chapter=${currentChapter}` }
        );
      }

      if (parentComment && parentComment.userId !== novel.authorId && parentComment.userId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: parentComment.userId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || 'Anonymous',
          type: 'comment_reply',
          novelId: novel.id,
          novelTitle: novel.title,
          commentContent: replyContent.trim(),
          parentId: parentId,
          chapterNumber: currentChapter + 1,
          chapterTitle: currentContentInfo.title,
          createdAt: new Date().toISOString(),
          read: false,
        });

        // Send Push Notification
        await sendPushNotification(
          parentComment.userId,
          `${currentUser.displayName || "Someone"}`,
          `Replied to your comment in "${novel.title}: ${currentContentInfo.title}"`,
          { url: `novlnest://novel/${novel.id}/read?chapter=${currentChapter}` }
        );
      }

      // Update local state optimistically
      setComments(prev => organizeComments([...(prev.flatMap(c => [c, ...(c.replies || [])])), reply]));
      setReplyContent('');
      setReplyingTo(null);
      setReplyingToUser('');
      showAlert({ title: 'Success', message: 'Reply posted successfully!', type: 'info', useNative: true });
    } catch (error) {
      console.error('Error adding reply:', error);
      showAlert({ message: 'Failed to post reply', type: 'error', useNative: true });
    } finally {
      setSubmittingReply(null);
    }
  };

  const handleCopyComment = async (text: string) => {
    await Clipboard.setStringAsync(text);
    showAlert({ message: 'Comment copied to clipboard', type: 'info', useNative: true });
  };

  const handleEditSubmit = async () => {
    if (!novel?.id || !currentUser || !editingCommentId || !editContent.trim()) return;

    try {
      setSubmittingComment(true);
      const chapterId = getChapterDocId();
      const chapterRef = doc(db, 'novels', novel.id, 'chapters', chapterId);
      const chapterDoc = await getDoc(chapterRef);

      if (!chapterDoc.exists()) return;

      const commentRef = doc(db, 'novels', novel.id, 'chapters', chapterId, 'comments', editingCommentId);

      await updateDoc(commentRef, {
        content: editContent.trim(),
        updatedAt: new Date().toISOString(),
      });

      // Invalidate engagement cache
      const engagementCacheKey = `engagement_${novel.id}_${chapterId}`;
      await invalidateCache(engagementCacheKey);

      // Update local state optimistically
      setComments(prev => prev.map(c => {
        if (c.id === editingCommentId) return { ...c, content: editContent.trim() };
        if (c.replies) {
          return { ...c, replies: c.replies.map(r => r.id === editingCommentId ? { ...r, content: editContent.trim() } : r) };
        }
        return c;
      }));
      setEditingCommentId(null);
      setEditContent('');
      showAlert({ title: 'Success', message: 'Comment updated successfully!', type: 'info', useNative: true });
    } catch (error) {
      console.error('Error updating comment:', error);
      showAlert({ message: 'Failed to update comment', type: 'error', useNative: true });
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!novel?.id || !currentUser) return;

    showAlert({
      title: 'Delete Comment',
      message: 'Are you sure you want to delete this comment?',
      type: 'warning',
      useNative: true,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingComment(commentId);
              const chapterId = getChapterDocId();
              const commentRef = doc(db, 'novels', novel.id, 'chapters', chapterId, 'comments', commentId);

              // We'll use a batch to delete the comment and its immediate replies (if any)
              const batch = writeBatch(db);
              batch.delete(commentRef);

              // Note: For deep nesting, we'd need a more complex recursive delete, 
              // but for now we'll just delete the targeted comment.

              await batch.commit();

              // Update lightweight count in chapter doc
              const chapterRef = doc(db, 'novels', novel.id, 'chapters', chapterId);
              await updateDoc(chapterRef, {
                commentCount: increment(-1)
              });

              // Invalidate engagement cache
              const engagementCacheKey = `engagement_${novel.id}_${chapterId}`;
              await invalidateCache(engagementCacheKey);

              setComments(prev => prev.filter(c => c.id !== commentId).map(c => ({
                ...c,
                replies: c.replies?.filter(r => r.id !== commentId)
              })));
              showAlert({ title: 'Success', message: 'Comment deleted successfully!', type: 'info', useNative: true });
            } catch (error) {
              console.error('Error deleting comment:', error);
              showAlert({ message: 'Failed to delete comment', type: 'error', useNative: true });
            } finally {
              setDeletingComment(null);
            }
          },
        },
      ],
    });
  };

  const handleCommentLike = async (commentId: string, isLiked: boolean) => {
    if (!novel?.id || !currentUser) return;

    // Store previous organized state for reversal
    const previousComments = [...comments];

    // Define recursive function to update the comment in the organized tree
    const updateCommentInTree = (list: Comment[]): Comment[] => {
      return list.map((c) => {
        if (c.id === commentId) {
          const likedBy = c.likedBy || [];
          const newLikedBy = isLiked
            ? likedBy.filter((uid: string) => uid !== currentUser.uid)
            : [...likedBy, currentUser.uid];

          return {
            ...c,
            likes: newLikedBy.length,
            likedBy: newLikedBy,
          };
        }
        if (c.replies && c.replies.length > 0) {
          return {
            ...c,
            replies: updateCommentInTree(c.replies),
          };
        }
        return c;
      });
    };

    // Apply optimistic update to UI state immediately
    setComments((prev) => updateCommentInTree(prev));

    try {
      const chapterId = getChapterDocId();
      const commentRef = doc(db, 'novels', novel.id, 'chapters', chapterId, 'comments', commentId);

      if (isLiked) {
        await updateDoc(commentRef, {
          likes: increment(-1),
          likedBy: arrayRemove(currentUser.uid),
        });
      } else {
        await updateDoc(commentRef, {
          likes: increment(1),
          likedBy: arrayUnion(currentUser.uid),
        });
      }

      // Find the comment to notify from our organized tree
      const findInTree = (list: Comment[]): Comment | null => {
        for (const c of list) {
          if (c.id === commentId) return c;
          if (c.replies) {
            const found = findInTree(c.replies);
            if (found) return found;
          }
        }
        return null;
      };

      const commentToNotify = findInTree(previousComments);

      // Invalidate engagement cache
      const engagementCacheKey = `engagement_${novel.id}_${chapterId}`;
      await invalidateCache(engagementCacheKey);

      if (!isLiked && commentToNotify && (commentToNotify as Comment).userId !== currentUser.uid) {
        const c = commentToNotify as Comment;
        addDoc(collection(db, 'notifications'), {
          toUserId: c.userId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || 'Anonymous',
          type: 'comment_like',
          novelId: novel.id,
          novelTitle: novel.title,
          commentId: commentId,
          commentContent: c.content || c.text || '',
          chapterNumber: currentChapter + 1,
          chapterTitle: currentContentInfo.title,
          createdAt: new Date().toISOString(),
          read: false,
        }).catch(err => console.error("Error creating notification:", err));

        sendPushNotification(
          c.userId,
          `${currentUser.displayName || "Someone"}`,
          `Liked your comment in "${novel.title}: ${currentContentInfo.title}"`,
          { url: `novlnest://novel/${novel.id}/read?chapter=${currentChapter}` }
        ).catch(err => console.error("Error sending push notification:", err));
      }
    } catch (error) {
      console.error('Error updating comment like:', error);
      // Revert organized state if backend fails
      setComments(previousComments);
      showAlert({ message: 'Failed to update like status', type: 'error', useNative: true });
    }
  };

  const canDeleteComment = (comment: Comment) => {
    if (!currentUser || !novel) return false;
    return comment.userId === currentUser.uid || novel.authorId === currentUser.uid;
  };

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;
    return date.toLocaleDateString();
  };

  const parseFormattedText = (text: string) => {
    const elements: React.ReactNode[] = [];
    let currentIndex = 0;
    let key = 0;

    // Regex to match: ****bold****, **bold**, *italic*, or # headings at start of line
    const formatRegex = /(\*{4}[^\*]+\*{4}|\*{2}[^\*]+\*{2}|\*[^\*]+\*|^#{1,6}\s+.+$)/gm;

    const matches = [...text.matchAll(formatRegex)];

    if (matches.length === 0) {
      return <Text>{text}</Text>;
    }

    matches.forEach((match) => {
      const matchText = match[0];
      const matchIndex = match.index!;

      // Add text before the match
      if (matchIndex > currentIndex) {
        elements.push(
          <Text key={`text-${key++}`}>{text.substring(currentIndex, matchIndex)}</Text>
        );
      }

      // Process the matched formatting
      if (matchText.startsWith('****') && matchText.endsWith('****')) {
        // Bold text (****text****)
        const content = matchText.slice(4, -4);
        elements.push(
          <Text key={`bold-${key++}`} style={styles.boldText}>
            {content}
          </Text>
        );
      } else if (matchText.startsWith('**') && matchText.endsWith('**')) {
        // Bold text (**text**)
        const content = matchText.slice(2, -2);
        elements.push(
          <Text key={`bold-${key++}`} style={styles.boldText}>
            {content}
          </Text>
        );
      } else if (matchText.startsWith('*') && matchText.endsWith('*')) {
        // Italic text (*text*)
        const content = matchText.slice(1, -1);
        elements.push(
          <Text key={`italic-${key++}`} style={styles.italicText}>
            {content}
          </Text>
        );
      } else if (matchText.startsWith('#')) {
        // Heading
        const hashCount = matchText.match(/^#+/)?.[0].length || 1;
        const content = matchText.replace(/^#+\s+/, '');
        const headingSize = Math.max(24, 32 - (hashCount * 2));
        elements.push(
          <Text key={`heading-${key++}`} style={[styles.headingText, { fontSize: headingSize }]}>
            {content}
          </Text>
        );
      }

      currentIndex = matchIndex + matchText.length;
    });

    // Add remaining text
    if (currentIndex < text.length) {
      elements.push(
        <Text key={`text-${key++}`}>{text.substring(currentIndex)}</Text>
      );
    }

    return <>{elements}</>;
  };
  const handleProfileNavigation = (userId: string) => {
    setShowComments(false);
    navigation.navigate('Profile', { userId });
  };
  const toggleReplies = (commentId: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const getParentCommentData = (parentId: string | undefined): { userName: string; userId: string } | null => {
    if (!parentId) return null;

    const findCommentById = (commentsList: Comment[], id: string): Comment | null => {
      for (const c of commentsList) {
        if (c.id === id) return c;
        if (c.replies) {
          const found = findCommentById(c.replies, id);
          if (found) return found;
        }
      }
      return null;
    };

    const parentComment = findCommentById(comments, parentId);
    if (!parentComment) return null;

    return {
      userName: parentComment.userName,
      userId: parentComment.userId,
    };
  };

  const renderComment = (comment: Comment, isReply: boolean = false) => {
    const parentData = isReply ? getParentCommentData(comment.parentId) : null;
    const isExpanded = expandedComments.has(comment.id);

    return (
      <View key={comment.id} style={[
        isReply ? styles.replyItem : [styles.commentItem, { borderBottomColor: colors.border }],
      ]}>
        <View style={styles.commentContainer}>
          {/* Left Side: Avatar */}
          <TouchableOpacity onPress={() => handleProfileNavigation(comment.userId)}>
            {comment.userPhoto ? (
              <CachedImage uri={comment.userPhoto} style={styles.commentAvatar} />
            ) : (
              <View style={[styles.commentAvatarPlaceholder, { backgroundColor: colors.primary }]}>
                <Text style={styles.commentAvatarText}>{getUserInitials(comment.userName)}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Middle/Right: Main Content Area */}
          <View style={styles.commentContentWrapper}>
            <View style={styles.commentMainArea}>
              {/* Header: Name/Tags */}
              <View style={styles.commentHeader}>
                {isReply && parentData ? (
                  <View style={styles.replyHeader}>
                    <TouchableOpacity onPress={() => handleProfileNavigation(comment.userId)}>
                      <Text style={[styles.commentUserName, { color: colors.text }]}>{comment.userName}</Text>
                    </TouchableOpacity>
                    <Text style={[styles.replyArrow, { color: colors.textSecondary }]}> {'>'} </Text>
                    <TouchableOpacity onPress={() => handleProfileNavigation(parentData.userId)}>
                      <Text style={[styles.commentUserName, { color: colors.text }]}>{parentData.userName}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => handleProfileNavigation(comment.userId)}>
                    <Text style={[styles.commentUserName, { color: colors.text }]}>{comment.userName}</Text>
                  </TouchableOpacity>
                )}
                {comment.userId === novel?.authorId && (
                  <View style={[styles.authorBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.authorBadgeText}>Author</Text>
                  </View>
                )}
              </View>

              {/* Comment Text with Long Press */}
              <Pressable
                onLongPress={() => showCommentOptions(comment)}
                delayLongPress={300}
                style={({ pressed }) => [
                  styles.commentTextContainer,
                  pressed && styles.commentTextPressed
                ]}
              >
                <Text style={[styles.commentText, { color: colors.text }]}>
                  {comment.content || comment.text}
                </Text>
              </Pressable>

              {/* Action Row */}
              <View style={styles.commentActionsRow}>
                <Text style={[styles.commentDate, { color: colors.textSecondary }]}>{formatDate(comment.createdAt)}</Text>

                <TouchableOpacity onPress={() => {
                  setReplyingTo(comment.id);
                  setReplyingToUser(comment.userName);
                  replyInputRef.current?.focus();
                }}>
                  <Text style={[styles.commentActionText, { color: colors.textSecondary }]}>Reply</Text>
                </TouchableOpacity>
              </View>

              {/* View Replies Button */}
              {!isReply && comment.replies && comment.replies.length > 0 && (
                <TouchableOpacity
                  style={styles.viewRepliesButton}
                  onPress={() => toggleReplies(comment.id)}
                >
                  <View style={styles.viewRepliesContent}>
                    <View style={[styles.repliesIndicatorLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.viewRepliesText, { color: colors.textSecondary }]}>
                      {isExpanded ? 'Hide replies' : `View ${comment.replies.length} ${comment.replies.length === 1 ? 'reply' : 'replies'}`}
                    </Text>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={colors.textSecondary}
                      style={{ marginLeft: 4 }}
                    />
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* Far Right: Like Button */}
            <View style={styles.commentLikeContainer}>
              <TouchableOpacity
                onPress={() => handleCommentLike(comment.id, comment.likedBy?.includes(currentUser?.uid || '') || false)}
                disabled={!currentUser}
                style={styles.commentLikeAction}
              >
                <Ionicons
                  name={comment.likedBy?.includes(currentUser?.uid || '') ? 'heart' : 'heart-outline'}
                  size={24}
                  color={comment.likedBy?.includes(currentUser?.uid || '') ? '#EF4444' : '#9CA3AF'}
                />
                <Text style={[styles.commentLikeCount, { color: colors.textSecondary }]}>{comment.likes || 0}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {comment.replies && comment.replies.length > 0 && isExpanded && (
          <View style={styles.repliesContainer}>
            {comment.replies.map((reply) => renderComment(reply, true))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading chapter...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !novel) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={60} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.text }]}>{error || 'Novel not found'}</Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.replace('MainTabs');
              }
            }}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const toggleUI = () => {
    const nextHidden = !isUIHidden;
    setIsUIHidden(nextHidden);

    Animated.parallel([
      Animated.timing(uiOpacity, {
        toValue: nextHidden ? 0 : 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(headerTranslateY, {
        toValue: nextHidden ? -100 : 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(floatingTranslateY, {
        toValue: nextHidden ? 100 : 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const renderBlocks = (blocks: any[]) => {
    return blocks.map((block, idx) => {
      const fontStyle = {
        fontFamily: Platform.OS === 'ios' ? fontFamily : (
          fontFamily === 'Courier' ? 'monospace' :
            ['Georgia', 'Times New Roman', 'Baskerville', 'Charter', 'Palatino', 'Iowan Old Style'].includes(fontFamily) ? 'serif' :
              'sans-serif'
        )
      };

      const approxLineHeight = Math.round(fontSize * 1.6);

      if (block.type === 'paragraph') {
        return (
          <Text
            key={idx}
            style={[
              styles.paragraph,
              {
                color: readerColors.text,
                fontSize: fontSize,
                lineHeight: approxLineHeight,
                marginBottom: approxLineHeight,
                ...fontStyle
              }
            ]}
          >
            {parseFormattedText(block.data)}
          </Text>
        );
      } else if (block.type === 'chat') {
        return (
          <View key={idx} style={{ marginVertical: approxLineHeight }}>
            {block.data.map((msg: any, mIdx: number) => (
              <View
                key={mIdx}
                style={{
                  alignSelf: msg.sender === novel?.authorName ? 'flex-end' : 'flex-start',
                  backgroundColor: msg.sender === novel?.authorName ? '#8B5CF6' : readerColors.border,
                  borderRadius: 16,
                  padding: 12,
                  marginBottom: approxLineHeight / 2, // Half grid for messages
                  maxWidth: '80%',
                }}
              >
                <Text style={{
                  color: msg.sender === novel?.authorName ? '#fff' : readerColors.text,
                  fontWeight: '700',
                  marginBottom: 2,
                  fontSize: fontSize - 4,
                  ...fontStyle
                }}>{msg.sender}</Text>
                <Text style={{
                  color: msg.sender === novel?.authorName ? '#fff' : readerColors.text,
                  fontSize: fontSize,
                  ...fontStyle
                }}>{msg.text}</Text>
              </View>
            ))}
          </View>
        );
      } else if (block.type === 'image') {
        return (
          <InlineImageBlock
            key={idx}
            uri={block.data}
            maxHeight={Dimensions.get('window').height * 0.55}
          />
        );
      } else if (block.type === 'character_header') {
        // Pagination mode: renders a single character's avatar + name
        const charIdx = block.data;
        const char = novel?.characters?.[charIdx];
        if (!char) return null;
        return (
          <View key={idx} style={styles.characterListItem}>
            {char.imageUrl ? (
              <CachedImage uri={char.imageUrl} style={styles.characterListAvatar} />
            ) : (
              <View style={[styles.characterListAvatar, { backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 24 }}>{char.name.charAt(0)}</Text>
              </View>
            )}
            <Text style={[styles.characterListName, { color: readerColors.text }]}>{char.name}</Text>
          </View>
        );
      }
      return null;
    });
  };


  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: readerColors.background }]}
      onStartShouldSetResponderCapture={() => {
        onUserActivity();
        return false;
      }}
      onMoveShouldSetResponderCapture={() => {
        onUserActivity();
        return false;
      }}
    >
      <StatusBar barStyle={readerColors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} backgroundColor={readerColors.background} />

      {/* Hidden Measure View to get accurate content height */}
      <View style={{ position: 'absolute', opacity: 0, width: Dimensions.get('window').width - 48, zIndex: -1000 }} pointerEvents="none">
        <View onLayout={(e) => {
          const height = e.nativeEvent.layout.height;
          setContentHeight(height);
          contentHeightRef.current = height;
        }}>
          {renderBlocks(extractChatBlocks(currentContentInfo.content))}
        </View>
      </View>

      {/* Header */}
      <Animated.View
        style={[
          styles.header,
          {
            backgroundColor: readerColors.background,
            borderBottomColor: readerColors.border,
            opacity: uiOpacity,
            transform: [{ translateY: headerTranslateY }]
          }
        ]}
        pointerEvents={isUIHidden ? 'none' : 'auto'}
      >
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.replace('MainTabs');
            }
          }}
          style={styles.topBarButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color="#8B5CF6" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <TouchableOpacity onPress={() => setShowChapterList(true)} style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: readerColors.text }]} numberOfLines={1}>
              {currentContentInfo.title}
            </Text>
            <Ionicons name="chevron-down" size={14} color="#8B5CF6" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
          <Text style={[styles.headerSubtitle, { color: readerColors.textSecondary }]}>
            {currentChapter + 1} / {getTotalReadingOrderItems()}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setShowReaderSettings(true)}
          style={styles.topBarButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="settings-outline" size={24} color="#8B5CF6" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleShare}
          style={[styles.topBarButton, { marginLeft: 8 }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="share-outline" size={24} color="#8B5CF6" />
        </TouchableOpacity>

        {/* Progress bar */}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 }}>
          <View style={{ position: 'absolute', left: 0, bottom: 0, height: '100%', width: `${progressPercent}%`, backgroundColor: colors.primary }} />
        </View>
      </Animated.View>

      {/* Scrollable Content */}
      <Animated.View style={[styles.readerContainer, { transform: [{ translateY: slideAnim }] }]}>
        {!isPagingEnabled ? (
          <ScrollView
            ref={scrollViewRef}
            style={styles.contentScroll}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
            onScrollBeginDrag={onUserActivity}
            onScroll={handleScroll}
            onScrollEndDrag={handleScrollEndDrag}
            scrollEventThrottle={16}
          >
            <Pressable onPress={toggleUI}>
              {renderBlocks(extractChatBlocks(currentContentInfo.content))}

              {currentContentInfo.type === 'characters' && (
                <View style={styles.charactersContainer}>
                  {novel.characters?.map((char) => (
                    <View key={char.id} style={styles.characterListItem}>
                      {char.imageUrl ? (
                        <CachedImage uri={char.imageUrl} style={styles.characterListAvatar} />
                      ) : (
                        <View style={[styles.characterListAvatar, { backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 24 }}>{char.name.charAt(0)}</Text>
                        </View>
                      )}
                      <View style={styles.characterListInfo}>
                        <Text style={[styles.characterListName, { color: readerColors.text }]}>{char.name}</Text>
                        <Text style={[styles.characterListDesc, { color: readerColors.textSecondary }]}>{char.description}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* End of chapter indicator */}
              <View style={styles.chapterEndContainer}>
                <View style={[styles.chapterEndLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.chapterEndText, { color: colors.textSecondary }]}>
                  End of {currentContentInfo.title}
                </Text>

                {/* Follow Prompt */}
                {currentUser && novel?.authorId !== currentUser.uid && !isFollowing && !novel.publicDomain && (
                  <View style={[styles.followPromptContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.followPromptText, { color: colors.textSecondary }]}>
                      Enjoying the story? Follow <Text style={[styles.followPromptAuthor, { color: colors.text }]}>{novel?.authorName}</Text>
                    </Text>
                    <TouchableOpacity
                      style={[styles.followPromptButton, { backgroundColor: colors.primary }]}
                      onPress={handleFollowToggle}
                      disabled={isTogglingFollow}
                    >
                      {isTogglingFollow ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="person-add" size={16} color="#fff" />
                          <Text style={styles.followPromptButtonText}>Follow</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* End of Story Message */}
                {currentChapter === getTotalReadingOrderItems() - 1 && novel.status === 'completed' && (
                  <View style={styles.completedContainer}>
                    <Ionicons name="checkmark-done-circle" size={60} color="#10B981" />
                    <Text style={[styles.completedTitle, { color: colors.text }]}>THE END</Text>
                    <Text style={[styles.completedSubtitle, { color: colors.textSecondary }]}>
                      You've reached the end of this journey. Thank you for reading!
                    </Text>
                  </View>
                )}

                {/* Navigation Buttons */}
                {currentChapter < getTotalReadingOrderItems() - 1 ? (
                  <TouchableOpacity
                    style={[styles.nextChapterButton, { backgroundColor: colors.primary }]}
                    onPress={() => goToNextChapter(0)}
                  >
                    <Text style={styles.nextChapterButtonText}>
                      Next: {getContentInfo(currentChapter + 1).title}
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.noMoreChaptersText, { color: colors.textSecondary }]}>
                    You've reached the end of the story
                  </Text>
                )}

                {currentChapter > 0 && (
                  <TouchableOpacity
                    style={[styles.prevChapterButton, { borderColor: colors.border }]}
                    onPress={() => goToPreviousChapter(0)}
                  >
                    <Ionicons name="chevron-back" size={20} color={colors.text} />
                    <Text style={[styles.prevChapterButtonText, { color: colors.text }]}>
                      Previous: {getContentInfo(currentChapter - 1).title}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </Pressable>
          </ScrollView>
        ) : totalPages > 0 ? (
          <FlatList
            key={`chapter-${currentChapter}-${fontSize}`}
            ref={flatListRef}
            data={Array.from({ length: totalPages })}
            initialScrollIndex={requestedPage === -1 ? Math.max(0, totalPages - 1) : requestedPage}
            keyExtractor={(_, index) => `page-${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScrollBeginDrag={onUserActivity}
            onScrollEndDrag={(e) => {
              const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
              const threshold = 40;

              // Forward past end
              if (contentOffset.x + layoutMeasurement.width > contentSize.width + threshold) {
                markAsCompleted();
                goToNextChapter(0);
              }
              // Backward past start
              else if (contentOffset.x < -threshold) {
                goToPreviousChapter(-1); // -1 means go to the LAST page of prev chapter
              }
            }}
            onMomentumScrollEnd={(e) => {
              const offsetX = e.nativeEvent.contentOffset.x;
              const width = Dimensions.get('window').width;
              const idx = Math.round(offsetX / width);
              setPageIndex(idx);
              const percent = totalPages > 0 ? Math.round(((idx + 1) / totalPages) * 100) : 0;
              setProgressPercent(percent);
              if (Date.now() - lastSavedAtRef.current > SAVE_INTERVAL) {
                persistReadingProgress();
              }
            }}
            getItemLayout={(_, index) => ({
              length: Dimensions.get('window').width,
              offset: Dimensions.get('window').width * index,
              index,
            })}
            renderItem={({ index }: any) => (
              <View
                style={{
                  width: Dimensions.get('window').width,
                  height: '100%',
                  backgroundColor: readerColors.background
                }}
              >
                <Pressable onPress={toggleUI} style={{ flex: 1 }}>
                  <View style={{
                    height: pageHeight,
                    marginTop: topPadding + insets.top,
                    marginHorizontal: 24,
                  }}>
                    {renderBlocks(pagedContent[index])}
                  </View>

                  {/* Page Indicator */}
                  <View style={{
                    position: 'absolute',
                    bottom: insets.bottom + 10,
                    width: '100%',
                    alignItems: 'center'
                  }}>
                    <Text style={{ color: readerColors.textSecondary, fontSize: 10, opacity: 0.5 }}>
                      {index + 1} / {totalPages}
                    </Text>
                  </View>

                  {index === totalPages - 1 && (
                    <View style={{ position: 'absolute', bottom: insets.bottom + 40, width: '100%', paddingHorizontal: 24 }}>
                      <View style={{ gap: 12, width: '100%', alignItems: 'center' }}>
                        {currentChapter < getTotalReadingOrderItems() - 1 ? (
                          <TouchableOpacity
                            style={[styles.nextChapterButton, { backgroundColor: colors.primary, width: '100%' }]}
                            onPress={() => {
                              markAsCompleted();
                              goToNextChapter(0);
                            }}
                          >
                            <Text style={styles.nextChapterButtonText}>Next Chapter</Text>
                            <Ionicons name="chevron-forward" size={20} color="#fff" />
                          </TouchableOpacity>
                        ) : (
                          <Text style={[styles.noMoreChaptersText, { color: colors.textSecondary }]}>
                            {novel.status === 'completed' ? 'End of story' : "You've reached the current end"}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                </Pressable>
              </View>
            )}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: readerColors.background }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      </Animated.View>

      <ReaderSettingsModal
        isVisible={showReaderSettings}
        onClose={() => setShowReaderSettings(false)}
      />

      {/* Floating Actions */}
      <Animated.View
        style={[
          styles.floatingActions,
          {
            opacity: uiOpacity,
            transform: [{ translateY: floatingTranslateY }]
          }
        ]}
        pointerEvents={isUIHidden ? 'none' : 'auto'}
      >
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={handleChapterLike}>
          <Ionicons name={chapterLiked ? 'heart' : 'heart-outline'} size={24} color={chapterLiked ? colors.error : colors.text} />
          <Text style={[styles.actionButtonText, { color: colors.text }]}>{chapterLikes}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
          <Text style={[styles.actionButtonText, { color: colors.text }]}>
            {getTotalCommentsCount(comments)}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      <Modal
        visible={showComments}
        animationType="slide"
        transparent={false}
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={() => setShowComments(false)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 45 : 0}
        >
          <View style={[
            styles.modalHeader,
            {
              borderBottomColor: colors.border,
              paddingTop: Platform.OS === 'ios' ? 16 : Math.max(insets.top, 16)
            }
          ]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {(() => {
                const total = getTotalCommentsCount(comments);
                return `${total} ${total === 1 ? 'Comment' : 'Comments'}`;
              })()}
            </Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowComments(false)}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {comments.length === 0 ? (
            <View style={styles.emptyComments}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyCommentsText, { color: colors.textSecondary }]}>No comments yet</Text>
              <Text style={[styles.emptyCommentsSubtext, { color: colors.textSecondary }]}>Be the first to share your thoughts!</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.commentsList}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {comments.map((comment) => renderComment(comment))}
            </ScrollView>
          )}

          {currentUser && (
            <View style={[styles.commentInputArea, { paddingBottom: Math.max(insets.bottom, 25) }]}>
              {currentUser.photoURL ? (
                <CachedImage uri={currentUser.photoURL} style={styles.commentInputAvatar} />
              ) : (
                <View style={[styles.commentInputAvatarPlaceholder, { backgroundColor: colors.primary }]}>
                  <Text style={styles.commentInputAvatarText}>{getUserInitials(currentUser.displayName || 'U')}</Text>
                </View>
              )}
              <View style={styles.commentInputWrapperWrapper}>
                {replyingTo && !editingCommentId && (
                  <View style={styles.replyingToBanner}>
                    <Text style={[styles.replyingToText, { color: colors.textSecondary }]}>Replying to {replyingToUser}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setReplyingTo(null);
                        setReplyingToUser('');
                        setReplyContent('');
                      }}
                      style={styles.replyingToCancel}
                    >
                      <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                )}
                {editingCommentId && (
                  <View style={styles.replyingToBanner}>
                    <Text style={[styles.replyingToText, { color: colors.textSecondary }]}>Editing Comment</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingCommentId(null);
                        setEditContent('');
                      }}
                      style={styles.replyingToCancel}
                    >
                      <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                )}
                <View style={[styles.commentInputWrapper, { borderColor: colors.border }]}>
                  <TextInput
                    ref={replyInputRef}
                    value={editingCommentId ? editContent : (replyingTo ? replyContent : newComment)}
                    onChangeText={editingCommentId ? setEditContent : (replyingTo ? setReplyContent : setNewComment)}
                    placeholder={editingCommentId ? "Edit comment..." : (replyingTo ? "Write a reply..." : "Add a comment...")}
                    placeholderTextColor="#9CA3AF"
                    style={[styles.commentInput, { color: colors.text }]}
                    multiline
                    maxLength={1000}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      if (editingCommentId) {
                        handleEditSubmit();
                      } else if (replyingTo) {
                        handleAddReply(replyingTo);
                      } else {
                        handleAddComment();
                      }
                    }}
                    disabled={(editingCommentId ? !editContent.trim() : (replyingTo ? !replyContent.trim() : !newComment.trim())) || submittingComment || !!submittingReply}
                    style={styles.commentSubmitBtn}
                  >
                    {(submittingComment || submittingReply) ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons
                        name={editingCommentId ? "checkmark" : "send"}
                        size={20}
                        color={(editingCommentId ? editContent.trim() : (replyingTo ? replyContent.trim() : newComment.trim())) ? colors.primary : '#9CA3AF'}
                      />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>

        {/* Comment Options Bottom Sheet (Nested) */}
        <Modal
          visible={showOptionsModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowOptionsModal(false)}
        >
          <TouchableOpacity
            style={styles.optionsModalOverlay}
            activeOpacity={1}
            onPress={() => setShowOptionsModal(false)}
          >
            <View style={styles.optionsSheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Comment Options</Text>

              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => {
                  if (selectedCommentForOptions) {
                    setReplyingTo(selectedCommentForOptions.id);
                    setReplyingToUser(selectedCommentForOptions.userName);
                    setShowOptionsModal(false);
                    setTimeout(() => replyInputRef.current?.focus(), 100);
                  }
                }}
              >
                <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
                <Text style={styles.sheetOptionText}>Reply</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => {
                  if (selectedCommentForOptions) {
                    handleCopyComment(selectedCommentForOptions.content || selectedCommentForOptions.text || '');
                    setShowOptionsModal(false);
                  }
                }}
              >
                <Ionicons name="copy-outline" size={24} color={colors.text} />
                <Text style={styles.sheetOptionText}>Copy</Text>
              </TouchableOpacity>

              {selectedCommentForOptions && currentUser && currentUser.uid === selectedCommentForOptions.userId && (
                <TouchableOpacity
                  style={styles.sheetOption}
                  onPress={() => {
                    setEditingCommentId(selectedCommentForOptions.id);
                    setEditContent(selectedCommentForOptions.content || selectedCommentForOptions.text || '');
                    setShowOptionsModal(false);
                    setTimeout(() => replyInputRef.current?.focus(), 100);
                  }}
                >
                  <Ionicons name="create-outline" size={24} color={colors.text} />
                  <Text style={styles.sheetOptionText}>Edit Comment</Text>
                </TouchableOpacity>
              )}

              {selectedCommentForOptions && canDeleteComment(selectedCommentForOptions) && (
                <TouchableOpacity
                  style={styles.sheetOption}
                  onPress={() => {
                    handleDeleteComment(selectedCommentForOptions.id);
                    setShowOptionsModal(false);
                  }}
                >
                  <Ionicons name="trash-outline" size={24} color="#EF4444" />
                  <Text style={[styles.sheetOptionText, { color: '#EF4444' }]}>Delete Comment</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.sheetOption, styles.sheetCancelOption]}
                onPress={() => setShowOptionsModal(false)}
              >
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </Modal>

      <Modal
        visible={showChapterList}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setShowChapterList(false)}
      >
        <View style={[styles.tocModalContainer, { backgroundColor: '#000' }]}>
          <StatusBar barStyle="light-content" />

          {/* Header Actions */}
          <View style={styles.tocModalHeader}>
            <TouchableOpacity
              onPress={() => setShowChapterList(false)}
              style={styles.tocCloseButton}
            >
              <Ionicons name="close" size={32} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Novel Info Section */}
          <View style={styles.tocNovelInfo}>
            <View style={styles.tocCoverContainer}>
              {novel?.coverSmallImage || novel?.coverImage ? (
                <CachedImage
                  uri={novel.coverSmallImage || novel.coverImage!}
                  style={styles.tocCoverImage}
                />
              ) : (
                <View style={[styles.tocCoverImage, { backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="book" size={40} color={colors.primary} />
                </View>
              )}
            </View>
            <View style={styles.tocTextInfo}>
              <Text style={styles.tocNovelTitle}>{novel?.title.toUpperCase()}</Text>
              <Text style={styles.tocAuthorName}>By {novel?.authorName}</Text>
            </View>
          </View>

          <ScrollView
            style={styles.tocListScroll}
            contentContainerStyle={styles.tocListContent}
          >
            {(() => {
              const items = [];
              let currentIndex = 0;
              const formatDate = (dateStr: string | undefined) => {
                if (!dateStr) return '';
                return new Date(dateStr).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                });
              };

              if (novel?.authorsNote) {
                items.push({
                  id: 'authors-note',
                  type: 'authors-note',
                  title: "Author's Note",
                  index: currentIndex,
                  date: formatDate(novel.createdAt)
                });
                currentIndex++;
              }
              if (novel?.prologue) {
                items.push({
                  id: 'prologue',
                  type: 'prologue',
                  title: 'Prologue',
                  index: currentIndex,
                  date: formatDate(novel.createdAt)
                });
                currentIndex++;
              }
              if (novel?.characters && novel.characters.length > 0) {
                items.push({
                  id: 'characters',
                  type: 'characters',
                  title: 'Cast of Characters',
                  index: currentIndex,
                  date: formatDate(novel.createdAt)
                });
                currentIndex++;
              }
              const chaptersCount = novel?.chapterCount ?? 0;
              const titles = novel?.chapterTitles || [];

              Array.from({ length: chaptersCount }).forEach((_, idx) => {
                items.push({
                  id: `chapter-${idx}`,
                  type: 'chapter',
                  title: titles[idx] || `Chapter ${idx + 1}`,
                  index: currentIndex,
                  date: formatDate(novel?.updatedAt)
                });
                currentIndex++;
              });
              if (novel?.epilogue) {
                items.push({
                  id: 'epilogue',
                  type: 'epilogue',
                  title: novel.epilogue.title || 'Epilogue',
                  index: currentIndex,
                  date: formatDate(novel.updatedAt)
                });
              }

              return items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.tocItemRow}
                  onPress={() => {
                    setCurrentChapter(item.index);
                    setShowChapterList(false);
                  }}
                >
                  <Text style={[
                    styles.tocItemTitle,
                    { color: currentChapter === item.index ? colors.primary : '#fff' }
                  ]}>
                    {item.title}
                  </Text>
                  <Text style={styles.tocItemDate}>{item.date}</Text>
                </TouchableOpacity>
              ));
            })()}
            <View style={{ height: 40 + (insets?.bottom || 0) }} />
          </ScrollView>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const getStyles = (themeColors: any, insets: any, fontSize: number) => StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? insets.top + 8 : insets.top + 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    backgroundColor: themeColors.background,
  },
  topBarButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '70%',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    flexShrink: 1,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  readerContainer: {
    flex: 1,
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingTop: 40 + insets.top,
    paddingBottom: 100,
  },
  chapterEndContainer: {
    marginTop: Math.round(fontSize * 1.6) * 2,
    alignItems: 'center',
    paddingBottom: Math.round(fontSize * 1.6) * 2,
  },
  chapterEndLine: {
    width: 100,
    height: 1,
    backgroundColor: themeColors.border,
    marginBottom: 16,
  },
  chapterEndText: {
    fontSize: 14,
    color: themeColors.textSecondary,
    marginBottom: 24,
  },
  nextChapterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: themeColors.primary,
    marginBottom: 12,
  },
  nextChapterButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  prevChapterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  prevChapterButtonText: {
    fontSize: 14,
    color: themeColors.text,
    marginLeft: 4,
  },
  noMoreChaptersText: {
    fontSize: 14,
    color: themeColors.textSecondary,
    fontStyle: 'italic',
  },
  followPromptContainer: {
    width: '100%',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.backgroundSecondary,
    alignItems: 'center',
    marginBottom: 24,
  },
  followPromptText: {
    fontSize: 15,
    color: themeColors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  followPromptAuthor: {
    fontWeight: 'bold',
  },
  followPromptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: themeColors.primary,
    gap: 8,
  },
  followPromptButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  swipeHint: {
    position: 'absolute',
    bottom: 20 + insets.bottom,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: themeColors.primary,
    opacity: 0.9,
  },
  swipeHintText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  loadingPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageContainer: {
    flex: 1,
  },
  pageContent: {
    padding: 24,
  },
  chapterTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: themeColors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  authorName: {
    fontSize: 14,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 24,
    textAlign: 'center',
  },
  paragraph: {
    fontSize: 18,
    color: themeColors.text,
    textAlign: 'left',
    lineHeight: 28,
    marginBottom: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  boldText: {
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  italicText: {
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  headingText: {
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: themeColors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: themeColors.primary,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  floatingActions: {
    position: 'absolute',
    bottom: 40 + insets.bottom,
    right: 20,
    gap: 12,
    zIndex: 5,
  },
  actionButton: {
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.surface,
  },
  actionButtonText: {
    fontSize: 10,
    marginTop: 2,
    color: themeColors.textSecondary,
  },
  repliesContainer: {
    marginTop: 8,
  },
  emptyComments: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyCommentsText: {
    fontSize: 14,
    marginTop: 12,
    color: themeColors.textSecondary,
  },
  emptyCommentsSubtext: {
    fontSize: 12,
    marginTop: 4,
    color: themeColors.textSecondary,
  },
  commentItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  replyItem: {
    marginTop: 8,
  },
  commentContainer: {
    flexDirection: 'row',
  },
  commentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  commentAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: themeColors.border,
  },
  commentAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  commentContentWrapper: {
    flex: 1,
    flexDirection: 'row',
  },
  commentMainArea: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 8,
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyArrow: {
    fontSize: 14,
    marginHorizontal: 4,
  },
  commentUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.text,
  },
  commentDate: {
    fontSize: 12,
    color: themeColors.textSecondary,
  },
  authorBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  authorBadgeText: {
    color: '#fff',
    fontSize: 10,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
    color: themeColors.text,
  },
  commentActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  viewRepliesButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  viewRepliesContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  repliesIndicatorLine: {
    width: 30,
    height: 1,
    marginRight: 10,
  },
  viewRepliesText: {
    fontSize: 14,
    fontWeight: '700',
  },
  commentActionText: {
    fontSize: 14,
    fontWeight: 'bold' as const,
    color: themeColors.textSecondary,
  },
  commentLikeContainer: {
    alignItems: 'center',
    marginLeft: 12,
    marginTop: 4,
  },
  commentLikeAction: {
    alignItems: 'center',
  },
  commentLikeCount: {
    fontSize: 12,
    marginTop: 2,
    color: themeColors.textSecondary,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    backgroundColor: themeColors.background,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: themeColors.text,
  },
  modalCloseButton: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  commentsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  commentInputArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 25,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
    backgroundColor: themeColors.background,
  },
  commentInputAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  commentInputAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentInputAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  commentInputWrapperWrapper: {
    flex: 1,
    marginLeft: 12,
  },
  commentInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: themeColors.border,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    minHeight: 40,
  },
  commentInput: {
    flex: 1,
    fontSize: 14,
    paddingTop: 0,
    paddingBottom: 0,
  },
  commentSubmitBtn: {
    padding: 6,
    marginLeft: 4,
  },
  replyingToBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  replyingToText: {
    fontSize: 12,
    color: themeColors.textSecondary,
  },
  replyingToCancel: {
    padding: 2,
  },
  // Completion Styles
  completedContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    marginTop: 40,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  completedTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  completedSubtitle: {
    fontSize: 16,
    color: themeColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 24,
  },
  optionsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  optionsSheet: {
    backgroundColor: themeColors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: themeColors.border,
    borderRadius: 2,
    marginVertical: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.text,
    marginBottom: 16,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: themeColors.border,
    gap: 12,
  },
  sheetOptionText: {
    fontSize: 16,
    color: themeColors.text,
    fontWeight: '500',
  },
  sheetCancelOption: {
    borderBottomWidth: 0,
    justifyContent: 'center',
    marginTop: 8,
  },
  sheetCancelText: {
    fontSize: 16,
    color: themeColors.textSecondary,
    fontWeight: '600',
  },
  commentTextContainer: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginHorizontal: -8,
  },
  commentTextPressed: {
    backgroundColor: themeColors.border,
    opacity: 0.8,
  },
  inlineImageContainer: {
    marginVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  inlineImage: {
    width: '100%',
    height: Dimensions.get('window').height * 0.55,
  },
  charactersContainer: {
    paddingTop: 16,
    paddingBottom: 100,
  },
  characterListItem: {
    flexDirection: 'column',
    marginBottom: 40,
    alignItems: 'center',
    gap: 12,
  },
  characterListAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  characterListInfo: {
    width: '100%',
    marginTop: 8,
  },
  characterListName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  characterListDesc: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'left',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  tocModalContainer: {
    flex: 1,
  },
  tocModalHeader: {
    paddingHorizontal: 16,
    paddingTop: insets.top + 12,
    paddingBottom: 12,
  },
  tocCloseButton: {
    padding: 8,
    marginLeft: -8,
  },
  tocNovelInfo: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 16,
  },
  tocCoverContainer: {
    width: 100,
    height: 150,
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  tocCoverImage: {
    width: '100%',
    height: '100%',
  },
  tocTextInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  tocNovelTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
    marginBottom: 6,
  },
  tocAuthorName: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  tocListScroll: {
    flex: 1,
    marginTop: 20,
  },
  tocListContent: {
    paddingHorizontal: 24,
  },
  tocItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tocItemTitle: {
    fontSize: 17,
    fontWeight: '500',
    flex: 1,
    marginRight: 16,
  },
  tocItemDate: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
});

export default NovelReaderScreen;
