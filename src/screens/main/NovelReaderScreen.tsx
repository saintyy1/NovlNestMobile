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
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { Novel } from '../../types/novel';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
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
import { colors } from '../../theme';
import { withCache, invalidateCache, CACHE_TTL } from '../../utils/cache';
import { sendPushNotification } from '../../services/PushNotificationService';

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

const NovelReaderScreen = ({ route, navigation }: any) => {
  const { novelId, id, chapterNumber, chapterIndex, chapter } = route.params || {};
  const { currentUser, toggleFollow } = useAuth();
  const { colors } = useTheme();
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

  const initialChapter = chapterIndex !== undefined ? parseChapter(chapterIndex) : 
                        (chapterNumber !== undefined ? parseChapter(chapterNumber) : 
                        (chapter !== undefined ? parseChapter(chapter) : 0));
  const [currentChapter, setCurrentChapter] = useState<number>(initialChapter);
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

  const showCommentOptions = (comment: Comment) => {
    setSelectedCommentForOptions(comment);
    setShowOptionsModal(true);
  };
  const [isAtEnd, setIsAtEnd] = useState(false);

  const styles = getStyles(colors);
  const [showNextChapterHint, setShowNextChapterHint] = useState(false);

  // Follow states
  const [isFollowing, setIsFollowing] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const replyInputRef = useRef<TextInput>(null);

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

    const chapterIndex = readingOrderIndex - currentIndex;
    if (chapterIndex >= 0 && chapterIndex < novel.chapters.length) {
      return {
        type: 'chapter',
        chapterIndex: chapterIndex,
        content: novel.chapters[chapterIndex]?.content || '',
        title: novel.chapters[chapterIndex]?.title || `Chapter ${chapterIndex + 1}`,
      };
    }

    currentIndex += novel.chapters.length;

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
  }, [novel]);

  const currentContentInfo = getContentInfo(currentChapter);

  const getTotalReadingOrderItems = useCallback(() => {
    if (!novel) return 0;
    let count = 0;
    if (novel.authorsNote) count++;
    if (novel.prologue) count++;
    count += novel.chapters.length;
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

  useEffect(() => {
    const fetchChapterData = async () => {
      if (!novel) return;

      try {
        const chapterId = currentContentInfo.type === 'epilogue' ? 'epilogue' : currentChapter.toString();
        const chapterCacheKey = `chapter_${novel.id}_${chapterId}`;

        const chapterData = await withCache(chapterCacheKey, async () => {
          const chapterRef = doc(db, 'novels', novel.id, 'chapters', chapterId);
          const chapterDoc = await getDoc(chapterRef);

          if (chapterDoc.exists()) {
            return chapterDoc.data();
          }
          throw new Error('Chapter not found');
        }, CACHE_TTL.CONTENT);

        setChapterLiked(currentUser ? chapterData.chapterLikedBy?.includes(currentUser.uid) || false : false);
        setChapterLikes(chapterData.chapterLikes || 0);

        const allComments = chapterData.comments || [];
        const organizedComments = organizeComments(allComments);
        setComments(organizedComments);
      } catch (error: any) {
        if (error.message === 'Chapter not found') {
          setChapterLiked(false);
          setChapterLikes(0);
          setComments([]);
        } else {
          console.error('Error fetching chapter data:', error);
        }
      }
    };

    fetchChapterData();
  }, [novel, currentChapter, currentUser]);

  // Reset scroll position when chapter changes
  useEffect(() => {
    setIsAtEnd(false);
    setShowNextChapterHint(false);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });

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
  }, [currentChapter]);

  // Save reading progress to database
  useEffect(() => {
    if (novel && currentUser) {
      const saveProgress = async () => {
        await updateReadingProgress(
          currentUser.uid,
          novel.id,
          novel.title,
          novel.coverSmallImage || novel.coverImage,
          currentChapter,
          currentContentInfo.title
        );
      };

      saveProgress();

      // Also save when user leaves the screen
      return () => {
        saveProgress();
      };
    }
  }, [currentChapter, novel, currentUser, currentContentInfo.title]);

  // Track reading progress based on scroll position
  const lastProgressRef = useRef<number>(0);

  // Handle scroll to detect end of chapter
  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 50;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    // Calculate reading progress percentage
    const progressPercent = Math.min(100, Math.round((contentOffset.y + layoutMeasurement.height) / contentSize.height * 100));

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

  const goToNextChapter = () => {
    if (currentChapter >= getTotalReadingOrderItems() - 1) return;

    const screenHeight = Dimensions.get('window').height;

    // Animate slide up (out of view)
    Animated.timing(slideAnim, {
      toValue: -screenHeight,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setCurrentChapter(currentChapter + 1);
      slideAnim.setValue(screenHeight); // Position new content below
      // Animate slide in from bottom
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

  const goToPreviousChapter = () => {
    if (currentChapter <= 0) return;

    const screenHeight = Dimensions.get('window').height;

    // Animate slide down (out of view)
    Animated.timing(slideAnim, {
      toValue: screenHeight,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setCurrentChapter(currentChapter - 1);
      slideAnim.setValue(-screenHeight); // Position new content above
      // Animate slide in from top
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
      Alert.alert('Login Required', 'Please login to like chapters');
      return;
    }

    try {
      const chapterRef = doc(db, 'novels', novel.id, 'chapters', currentChapter.toString());
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

      // Invalidate chapter cache to ensure immediate update
      const chapterId = currentContentInfo.type === 'epilogue' ? 'epilogue' : currentChapter.toString();
      const chapterCacheKey = `chapter_${novel.id}_${chapterId}`;
      await invalidateCache(chapterCacheKey);
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
          `${currentUser.displayName || "Someone"} ❤️`,
          `Liked your chapter "${currentContentInfo.title}" in "${novel.title}"`,
          { url: `novlnest://novel/${novel.id}/read?chapter=${currentChapter}` }
        );
      }
    } catch (error) {
      console.error('Error updating chapter like:', error);
      setChapterLiked(!chapterLiked);
    }
  };

  const handleFollowToggle = async () => {
    if (!currentUser) {
      Alert.alert('Login Required', 'Please login to follow authors');
      return;
    }
    if (!novel?.authorId) return;

    try {
      setIsTogglingFollow(true);

      // Optimistic update to UI
      setIsFollowing(!isFollowing);

      await toggleFollow(novel.authorId, isFollowing);
      // Invalidate profile cache
      await invalidateCache(`profile_user_${novel.authorId}`);

    } catch (error) {
      console.error('Error toggling follow:', error);
      Alert.alert('Error', 'Failed to update follow status');
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
      const chapterRef = doc(db, 'novels', novel.id, 'chapters', currentChapter.toString());
      const chapterDoc = await getDoc(chapterRef);

      const comment: Comment = {
        id: Date.now().toString(),
        content: newComment.trim(),
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userPhoto: currentUser.photoURL || null,
        createdAt: new Date().toISOString(),
        likes: 0,
        likedBy: [],
      };

      let updatedComments: Comment[];

      if (!chapterDoc.exists()) {
        await setDoc(chapterRef, {
          chapterLikes: 0,
          chapterLikedBy: [],
          comments: [comment],
        });
        updatedComments = [comment];
      } else {
        const existingComments = chapterDoc.data().comments || [];
        updatedComments = [...existingComments, comment];
        await updateDoc(chapterRef, {
          comments: updatedComments,
        });
      }

      // Invalidate chapter cache
      const chapterId = currentContentInfo.type === 'epilogue' ? 'epilogue' : currentChapter.toString();
      const chapterCacheKey = `chapter_${novel.id}_${chapterId}`;
      await invalidateCache(chapterCacheKey);
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
          `${currentUser.displayName || "Someone"} 💬`,
          `Commented on your novel "${novel.title}: ${currentContentInfo.title}"`,
          { url: `novlnest://novel/${novel.id}/read?chapter=${currentChapter}` }
        );
      }

      const organizedComments = organizeComments(updatedComments);
      setComments(organizedComments);
      setNewComment('');
      // Alert.alert('Success', 'Comment posted!');
    } catch (error) {
      console.error('Error adding comment:', error);
      Alert.alert('Error', 'Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleAddReply = async (parentId: string) => {
    if (!novel?.id || !currentUser || !replyContent.trim() || submittingReply === parentId) return;

    try {
      setSubmittingReply(parentId);
      const chapterRef = doc(db, 'novels', novel.id, 'chapters', currentChapter.toString());
      const chapterDoc = await getDoc(chapterRef);

      if (!chapterDoc.exists()) return;

      const existingComments = chapterDoc.data().comments || [];
      const parentComment = existingComments.find((c: Comment) => c.id === parentId);

      const reply: Comment = {
        id: Date.now().toString(),
        content: replyContent.trim(),
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userPhoto: currentUser.photoURL || null,
        createdAt: new Date().toISOString(),
        parentId: parentId,
        likes: 0,
        likedBy: [],
      };

      const updatedComments = [...existingComments, reply];
      await updateDoc(chapterRef, {
        comments: updatedComments,
      });

      // Invalidate chapter cache
      const chapterId = currentContentInfo.type === 'epilogue' ? 'epilogue' : currentChapter.toString();
      const chapterCacheKey = `chapter_${novel.id}_${chapterId}`;
      await invalidateCache(chapterCacheKey);

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
          `${currentUser.displayName || "Someone"} 💬`,
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
          `${currentUser.displayName || "Someone"} 💬`,
          `Replied to your comment in "${novel.title}: ${currentContentInfo.title}"`,
          { url: `novlnest://novel/${novel.id}/read?chapter=${currentChapter}` }
        );
      }

      const organizedComments = organizeComments(updatedComments);
      setComments(organizedComments);
      setReplyContent('');
      setReplyingTo(null);
      setReplyingToUser('');
      // Alert.alert('Success', 'Reply posted!');
    } catch (error) {
      console.error('Error adding reply:', error);
      Alert.alert('Error', 'Failed to post reply');
    } finally {
      setSubmittingReply(null);
    }
  };

  const handleCopyComment = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Comment copied to clipboard');
  };

  const handleEditSubmit = async () => {
    if (!novel?.id || !currentUser || !editingCommentId || !editContent.trim()) return;

    try {
      setSubmittingComment(true);
      const chapterRef = doc(db, 'novels', novel.id, 'chapters', currentChapter.toString());
      const chapterDoc = await getDoc(chapterRef);

      if (!chapterDoc.exists()) return;

      const existingComments = chapterDoc.data().comments || [];
      const updatedComments = existingComments.map((comment: Comment) => {
        if (comment.id === editingCommentId) {
          return {
            ...comment,
            content: editContent.trim(),
            updatedAt: new Date().toISOString(),
          };
        }
        return comment;
      });
      await updateDoc(chapterRef, {
        comments: updatedComments,
      });

      // Invalidate chapter cache
      const chapterId = currentContentInfo.type === 'epilogue' ? 'epilogue' : currentChapter.toString();
      const chapterCacheKey = `chapter_${novel.id}_${chapterId}`;
      await invalidateCache(chapterCacheKey);

      const organizedComments = organizeComments(updatedComments);
      setComments(organizedComments);
      setEditingCommentId(null);
      setEditContent('');
      Alert.alert('Success', 'Comment updated!');
    } catch (error) {
      console.error('Error updating comment:', error);
      Alert.alert('Error', 'Failed to update comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!novel?.id || !currentUser) return;

    Alert.alert('Delete Comment', 'Are you sure you want to delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeletingComment(commentId);
            const chapterRef = doc(db, 'novels', novel.id, 'chapters', currentChapter.toString());
            const chapterDoc = await getDoc(chapterRef);

            if (!chapterDoc.exists()) return;

            const existingComments = chapterDoc.data().comments || [];
            const updatedComments = existingComments.filter(
              (c: Comment) => c.id !== commentId && c.parentId !== commentId
            );

            await updateDoc(chapterRef, {
              comments: updatedComments,
            });

            // Invalidate chapter cache
            const chapterId = currentContentInfo.type === 'epilogue' ? 'epilogue' : currentChapter.toString();
            const chapterCacheKey = `chapter_${novel.id}_${chapterId}`;
            await invalidateCache(chapterCacheKey);

            const organizedComments = organizeComments(updatedComments);
            setComments(organizedComments);
            Alert.alert('Success', 'Comment deleted!');
          } catch (error) {
            console.error('Error deleting comment:', error);
            Alert.alert('Error', 'Failed to delete comment');
          } finally {
            setDeletingComment(null);
          }
        },
      },
    ]);
  };

  const handleCommentLike = async (commentId: string, isLiked: boolean) => {
    if (!novel?.id || !currentUser) return;

    try {
      const chapterRef = doc(db, 'novels', novel.id, 'chapters', currentChapter.toString());
      const chapterDoc = await getDoc(chapterRef);

      if (!chapterDoc.exists()) return;

      const existingComments = chapterDoc.data().comments || [];
      let commentToNotify: Comment | null = null;

      const updatedComments = existingComments.map((comment: Comment) => {
        if (comment.id === commentId) {
          commentToNotify = comment;
          const likedBy = comment.likedBy || [];
          if (isLiked) {
            return {
              ...comment,
              likes: (comment.likes || 0) - 1,
              likedBy: likedBy.filter((uid: string) => uid !== currentUser.uid),
            };
          } else {
            return {
              ...comment,
              likes: (comment.likes || 0) + 1,
              likedBy: [...likedBy, currentUser.uid],
            };
          }
        }
        return comment;
      });
      await updateDoc(chapterRef, {
        comments: updatedComments,
      });

      // Invalidate chapter cache
      const chapterId = currentContentInfo.type === 'epilogue' ? 'epilogue' : currentChapter.toString();
      const chapterCacheKey = `chapter_${novel.id}_${chapterId}`;
      await invalidateCache(chapterCacheKey);
      // Invalidate novel cache for overall comment likes if displayed
      await invalidateCache(`novel_${novel.id}`);

      // Send notification for like
      if (!isLiked && commentToNotify && (commentToNotify as Comment).userId !== currentUser.uid) {
        const c = commentToNotify as Comment;
        await addDoc(collection(db, 'notifications'), {
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
        });

        // Send Push Notification
        await sendPushNotification(
          c.userId,
          `${currentUser.displayName || "Someone"} ❤️`,
          `Liked your comment in "${novel.title}: ${currentContentInfo.title}"`,
          { url: `novlnest://novel/${novel.id}/read?chapter=${currentChapter}` }
        );
      }

      const organizedComments = organizeComments(updatedComments);
      setComments(organizedComments);
    } catch (error) {
      console.error('Error updating comment like:', error);
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

  // Extract chat blocks from content
  const extractChatBlocks = (content: string): Array<{ type: 'paragraph', data: string } | { type: 'chat', data: any }> => {
    const result: Array<{ type: 'paragraph', data: string } | { type: 'chat', data: any }> = [];
    const chatRegex = /\[CHAT_START\](.*?)\[CHAT_END\]/gs;
    let lastIndex = 0;
    let match;
    while ((match = chatRegex.exec(content)) !== null) {
      // Add paragraphs before chat block
      if (match.index > lastIndex) {
        const before = content.substring(lastIndex, match.index);
        splitIntoSmartParagraphs(before).forEach(p => {
          result.push({ type: 'paragraph', data: p });
        });
      }
      // Add chat block
      try {
        const chatJson = match[1];
        const messages = JSON.parse(chatJson);
        result.push({ type: 'chat', data: messages });
      } catch (e) {
        result.push({ type: 'paragraph', data: match[0] });
      }
      lastIndex = match.index + match[0].length;
    }
    // Add remaining paragraphs after last chat block
    if (lastIndex < content.length) {
      const after = content.substring(lastIndex);
      splitIntoSmartParagraphs(after).forEach(p => {
        result.push({ type: 'paragraph', data: p });
      });
    }
    return result;
  };

  // Smart paragraph splitting function
  const splitIntoSmartParagraphs = (content: string): string[] => {
    // First, split by explicit paragraph breaks (double newlines)
    const explicitParagraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);

    const smartParagraphs: string[] = [];

    for (const para of explicitParagraphs) {
      // Clean up the paragraph
      // If it starts with a dot and then text, it's likely an artifact of splitting
      let cleanPara = para.trim();
      if (cleanPara.startsWith('.') || cleanPara.startsWith(':')) {
        cleanPara = cleanPara.substring(1).trim();
      }

      if (!cleanPara) continue;

      // Special handling for the very first part of a chapter content
      // If it's a short line that might be a subtitle, don't merge it
      const lines = para.split('\n').filter(l => l.trim().length > 0);
      if (lines.length > 1 && lines[0].length < 60 && /^[A-Z0-9\W]+$/.test(lines[0].trim())) {
        // First line looks like a title (short and mostly caps)
        smartParagraphs.push(lines[0].trim());
        // Process the rest as a separate paragraph
        const rest = lines.slice(1).join(' ');
        if (rest.trim()) {
          smartParagraphs.push(rest.trim());
        }
        continue;
      }

      // Replace single newlines with spaces for regular paragraphs
      cleanPara = cleanPara.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

      // If paragraph is short enough, keep as is
      if (cleanPara.length < 400) {
        smartParagraphs.push(cleanPara);
        continue;
      }

      // Split long paragraphs by sentences
      // Match sentence endings: . ! ? followed by space and capital letter, or end of string
      const sentences = cleanPara.match(/[^.!?]*[.!?]+(?:\s+|$)|[^.!?]+$/g) || [cleanPara];

      let currentParagraph = '';
      const targetLength = 350; // Target paragraph length in characters
      const minLength = 150; // Minimum paragraph length

      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();

        if (!sentence) continue;

        // If adding this sentence would make paragraph too long
        if (currentParagraph.length > 0 && currentParagraph.length + sentence.length > targetLength) {
          // Only split if current paragraph is long enough
          if (currentParagraph.length >= minLength) {
            smartParagraphs.push(currentParagraph.trim());
            currentParagraph = sentence;
          } else {
            currentParagraph += ' ' + sentence;
          }
        } else {
          currentParagraph += (currentParagraph ? ' ' : '') + sentence;
        }

        // Check for natural break points (dialogue, scene changes)
        const hasDialogueEnd = sentence.endsWith('"') || sentence.endsWith('"');
        const nextIsDialogue = i < sentences.length - 1 &&
          (sentences[i + 1].trim().startsWith('"') || sentences[i + 1].trim().startsWith('"'));

        // Create paragraph break after dialogue or at natural scene breaks
        if (currentParagraph.length >= minLength && (hasDialogueEnd && nextIsDialogue)) {
          smartParagraphs.push(currentParagraph.trim());
          currentParagraph = '';
        }
      }

      // Add any remaining content
      if (currentParagraph.trim()) {
        smartParagraphs.push(currentParagraph.trim());
      }
    }

    return smartParagraphs;
  };

  const handleProfileNavigation = (userId: string) => {
    setShowComments(false);
    navigation.navigate('Profile', { userId });
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
                  size={16}
                  color={comment.likedBy?.includes(currentUser?.uid || '') ? '#EF4444' : '#9CA3AF'}
                />
                <Text style={[styles.commentLikeCount, { color: colors.textSecondary }]}>{comment.likes || 0}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {comment.replies && comment.replies.length > 0 && (
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
          <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.primary }]} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.topBarButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="chevron-back" size={28} color="#8B5CF6" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{currentContentInfo.title}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {currentChapter + 1} / {getTotalReadingOrderItems()}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleShare}
          style={styles.topBarButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="share-outline" size={24} color="#8B5CF6" />
        </TouchableOpacity>
      </View>

      {/* Scrollable Content */}
      <Animated.View style={[styles.readerContainer, { transform: [{ translateY: slideAnim }] }]}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.contentScroll}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={true}
          onScroll={handleScroll}
          onScrollEndDrag={handleScrollEndDrag}
          scrollEventThrottle={16}
        >
          {extractChatBlocks(currentContentInfo.content).map((block, idx) => {
            if (block.type === 'paragraph') {
              return (
                <Text
                  key={idx}
                  style={[styles.paragraph, { color: colors.text }]}
                >
                  {parseFormattedText(block.data)}
                </Text>
              );
            } else if (block.type === 'chat') {
              return (
                <View key={idx} style={{ marginVertical: 16 }}>
                  {block.data.map((msg: any, mIdx: number) => (
                    <View
                      key={mIdx}
                      style={{
                        alignSelf: msg.sender === novel?.authorName ? 'flex-end' : 'flex-start',
                        backgroundColor: msg.sender === novel?.authorName ? colors.primary : colors.surface,
                        borderRadius: 16,
                        padding: 12,
                        marginBottom: 8,
                        maxWidth: '80%',
                      }}
                    >
                      <Text style={{
                        color: msg.sender === novel?.authorName ? '#fff' : colors.text,
                        fontWeight: '600',
                        marginBottom: 2,
                      }}>{msg.sender}</Text>
                      <Text style={{ color: msg.sender === novel?.authorName ? '#fff' : colors.text }}>{msg.text}</Text>
                    </View>
                  ))}
                </View>
              );
            }
            return null;
          })}

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
                onPress={goToNextChapter}
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
                onPress={goToPreviousChapter}
              >
                <Ionicons name="chevron-back" size={20} color={colors.text} />
                <Text style={[styles.prevChapterButtonText, { color: colors.text }]}>
                  Previous: {getContentInfo(currentChapter - 1).title}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </Animated.View>

      {/* Floating Actions */}
      <View style={styles.floatingActions}>
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
      </View>

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
                    maxLength={500}
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


    </SafeAreaView>
  );
};

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
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
    paddingBottom: 100,
  },
  chapterEndContainer: {
    marginTop: 40,
    alignItems: 'center',
    paddingBottom: 40,
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
    bottom: 20,
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
    bottom: 40,
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
});

export default NovelReaderScreen;
