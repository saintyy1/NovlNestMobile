import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  AlertButton,
  Share as RNShare,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import CachedImage from '../../components/CachedImage';
import ClassicsBadge from '../../components/ClassicsBadge';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import {
  doc,
  getDoc,
  updateDoc,
  increment,
  arrayUnion,
  arrayRemove,
  collection,
  deleteField,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  deleteDoc,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Novel } from '../../types/novel';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { trackNovelView, trackContentInteraction, trackShare } from '../../utils/Analytics-utils';
import { withCache, CACHE_TTL, invalidateCache, invalidateByPrefix } from '../../utils/cache';
import { sendPushNotification } from '../../services/PushNotificationService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Comment {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  content: string;
  createdAt: string;
  likes: number;
  likedBy: string[];
  parentId?: string;
  replies?: Comment[];
}

interface AuthorData {
  supportLink?: string;
}

const NovelOverviewScreen = ({ route, navigation }: any) => {
  const { novelId: novelIdParam, id } = route.params;
  const novelId = novelIdParam || id;
  const { currentUser, updateUserLibrary, toggleFollow } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [novel, setNovel] = useState<Novel | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [totalCommentsCount, setTotalCommentsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [error, setError] = useState('');
  const [liked, setLiked] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [authorData, setAuthorData] = useState<AuthorData | null>(null);
  const [relatedNovels, setRelatedNovels] = useState<Novel[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // Follow states
  const [isFollowing, setIsFollowing] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  // Keep follow state in sync with AuthContext
  useEffect(() => {
    if (currentUser && novel?.authorId) {
      setIsFollowing(currentUser.following?.includes(novel.authorId) || false);
    }
  }, [currentUser?.following, novel?.authorId]);

  // Comment states
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyingToUser, setReplyingToUser] = useState<string>('');
  const [replyContent, setReplyContent] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [selectedCommentForOptions, setSelectedCommentForOptions] = useState<Comment | null>(null);

  const showCommentOptions = (comment: Comment) => {
    setSelectedCommentForOptions(comment);
    setShowOptionsModal(true);
  };
  const commentRefs = useRef<Record<string, View | null>>({});
  const activeLikeRequests = useRef(0);
  const replyInputRef = useRef<TextInput>(null);

  const [showTipModal, setShowTipModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);

  const styles = getStyles(colors);

  const buildCommentTree = useCallback((allComments: Comment[], parentId: string | null = null): Comment[] => {
    const children: Comment[] = [];
    allComments.forEach((comment) => {
      if (comment.parentId === parentId) {
        const nestedReplies = buildCommentTree(allComments, comment.id);
        children.push({ ...comment, replies: nestedReplies });
      }
    });
    return children.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, []);

  // Fetch novel data
  useEffect(() => {
    const fetchNovel = async () => {
      if (!novelId) {
        setError('Novel ID is missing');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const novelDocRef = doc(db, 'novels', novelId);


        const novelData = await withCache(`novel_${novelId}`, async () => {
          const novelDoc = await getDoc(novelDocRef);
          if (novelDoc.exists()) {
            return { id: novelDoc.id, ...novelDoc.data() } as Novel;
          }
          throw new Error('Novel not found');
        }, CACHE_TTL.CONTENT);

        setNovel(novelData);

        // Track novel view for analytics
        trackNovelView({
          novelId: novelData.id,
          title: novelData.title,
          authorId: novelData.authorId,
          authorName: novelData.authorName,
          genres: novelData.genres,
        });

        if (currentUser) {
          // Increment view count only once per user
          const viewKey = `novel_view_${novelId}_${currentUser.uid}`;
          const hasViewed = await AsyncStorage.getItem(viewKey);

          if (!hasViewed) {
            try {
              await updateDoc(novelDocRef, { views: increment(1) });
              await AsyncStorage.setItem(viewKey, 'true');
              // Invalidate cache immediately so return visits show updated view count
              await invalidateCache(`novel_${novelId}`);
              setNovel(prev => prev ? { ...prev, views: (prev.views || 0) + 1 } : null);
            } catch (error) {
              console.error('Error incrementing view count:', error);
            }
          }
        }
      } catch (error: any) {
        if (error.message === 'Novel not found') {
          setError('Novel not found');
        } else {
          console.error('Error fetching novel:', error);
          setError('Failed to load novel');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchNovel();
  }, [novelId]); // Removed currentUser dependency

  // Handle user-specific state (liked, isFollowing)
  useEffect(() => {
    if (novel && currentUser) {
      setLiked(novel.likedBy?.includes(currentUser.uid) || false);
      setIsFollowing(currentUser.following?.includes(novel.authorId) || false);
    } else if (!currentUser) {
      setLiked(false);
      setIsFollowing(false);
    }
  }, [novel?.id, currentUser?.uid, currentUser?.following]);

  // Fetch author data
  useEffect(() => {
    const fetchAuthorData = async () => {
      if (novel?.authorId) {
        try {
          const authorDoc = await getDoc(doc(db, 'users', novel.authorId));
          if (authorDoc.exists()) {
            setAuthorData(authorDoc.data() as AuthorData);
          }
        } catch (error) {
          console.error('Error fetching author data:', error);
        }
      }
    };

    fetchAuthorData();
  }, [novel?.authorId]);

  // Fetch comments
  useEffect(() => {
    if (!novelId) return;

    const commentsQuery = query(
      collection(db, 'comments'),
      where('novelId', '==', novelId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(commentsQuery, async (snapshot) => {
      setCommentsLoading(true);
      const commentsData: Comment[] = [];
      const uniqueUserIds = new Set<string>();

      snapshot.forEach((doc) => {
        const comment = { id: doc.id, ...doc.data() } as Comment;
        commentsData.push(comment);
        uniqueUserIds.add(comment.userId);
      });

      // Fetch user data for comments
      const usersMap = new Map<string, { displayName: string; photoURL?: string }>();
      const userPromises = Array.from(uniqueUserIds).map(async (uid) => {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          usersMap.set(uid, {
            displayName: userData.displayName || 'Anonymous',
            photoURL: userData.photoURL,
          });
        } else {
          usersMap.set(uid, { displayName: 'Deleted User' });
        }
      });

      await Promise.all(userPromises);

      const enrichedComments = commentsData.map((comment) => {
        const userData = usersMap.get(comment.userId);
        return {
          ...comment,
          userName: userData?.displayName || comment.userName,
          userPhoto: userData?.photoURL || comment.userPhoto,
        };
      });

      const topLevelComments = enrichedComments.filter((comment) => !comment.parentId);
      const organizedComments = topLevelComments.map((comment) => ({
        ...comment,
        replies: buildCommentTree(enrichedComments, comment.id),
      }));

      setComments(organizedComments);
      setTotalCommentsCount(commentsData.length);
      setCommentsLoading(false);
    });

    return () => unsubscribe();
  }, [novelId, buildCommentTree]);

  // Fetch related novels
  useEffect(() => {
    const fetchRelatedNovels = async () => {
      if (!novel?.id) return;

      try {
        setLoadingRelated(true);
        const cacheKey = `related_novels_${novel.id}`;

        const relatedItems = await withCache(cacheKey, async () => {
          let items: Novel[] = [];
          const seenIds = new Set<string>();
          seenIds.add(novel.id);

          // 1. Try fetching by same genre
          if (novel.genres && novel.genres.length > 0) {
            const primaryGenre = novel.genres[0];
            const genreQuery = query(
              collection(db, 'novels'),
              where('published', '==', true),
              where('genres', 'array-contains', primaryGenre),
              limit(12)
            );
            const genreSnapshot = await getDocs(genreQuery);
            const userGenreItems: Novel[] = [];
            const classicGenreItems: Novel[] = [];

            genreSnapshot.forEach((doc) => {
              const data = { id: doc.id, ...doc.data() } as Novel;
              if (!seenIds.has(data.id)) {
                if (data.publicDomain) {
                  classicGenreItems.push(data);
                } else {
                  userGenreItems.push(data);
                }
                seenIds.add(data.id);
              }
            });
            items.push(...userGenreItems, ...classicGenreItems);
          }

          // 2. Fallback: fetch latest published novels if we don't have enough
          if (items.length < 5) {
            const latestQuery = query(
              collection(db, 'novels'),
              where('published', '==', true),
              orderBy('createdAt', 'desc'),
              limit(12)
            );
            const latestSnapshot = await getDocs(latestQuery);
            const userLatestItems: Novel[] = [];
            const classicLatestItems: Novel[] = [];

            latestSnapshot.forEach((doc) => {
              const data = { id: doc.id, ...doc.data() } as Novel;
              if (!seenIds.has(data.id)) {
                if (data.publicDomain) {
                  classicLatestItems.push(data);
                } else {
                  userLatestItems.push(data);
                }
                seenIds.add(data.id);
              }
            });
            items.push(...userLatestItems, ...classicLatestItems);
          }

          return items.slice(0, 7);
        }, CACHE_TTL.FEED);

        setRelatedNovels(relatedItems);
      } catch (error) {
        console.error('Error fetching related novels:', error);
      } finally {
        setLoadingRelated(false);
      }
    };

    fetchRelatedNovels();
  }, [novel?.id, novel?.genres]);

  const handleLike = async () => {
    if (!novel?.id || !currentUser) {
      Alert.alert('Error', 'Please login to like novels');
      return;
    }

    const previousNovel = novel;
    const previousLiked = liked;
    const newLikeStatus = !liked;
    
    activeLikeRequests.current++;

    try {
      const novelRef = doc(db, 'novels', novel.id);
      
      // Full optimistic update
      setLiked(newLikeStatus);
      setNovel(prev => {
        if (!prev) return null;
        const newLikedBy = newLikeStatus 
          ? [...(prev.likedBy || []), currentUser.uid]
          : (prev.likedBy || []).filter(id => id !== currentUser.uid);
        return { ...prev, likes: newLikedBy.length, likedBy: newLikedBy };
      });

      await updateDoc(novelRef, {
        likes: newLikeStatus ? (novel.likedBy?.length || 0) + 1 : Math.max(0, (novel.likedBy?.length || 0) - 1),
        likedBy: newLikeStatus ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid),
      });

      await updateUserLibrary(novel.id, newLikeStatus, novel.title, novel.authorId);

      // Verify with server ONLY if this is the last pending request
      activeLikeRequests.current--;
      
      if (activeLikeRequests.current === 0) {
        const updatedNovelDoc = await getDoc(novelRef);
        if (updatedNovelDoc.exists() && activeLikeRequests.current === 0) {
          const serverData = { ...updatedNovelDoc.data(), id: novel.id } as Novel;
          
          // Double verify server sync: if likes field doesn't match likedBy length, fix it
          if (serverData.likes !== (serverData.likedBy?.length || 0)) {
            await updateDoc(novelRef, { likes: serverData.likedBy?.length || 0 });
            serverData.likes = serverData.likedBy?.length || 0;
          }
          
          setNovel(serverData);
          
          // After successful update, invalidate relevant caches to ensure fresh data app-wide
          await invalidateCache(`novel_${novel.id}`);
          await invalidateByPrefix("home_");
          await invalidateByPrefix("browse_");
        }
      }
    } catch (error) {
      console.error('Error updating likes:', error);
      activeLikeRequests.current = Math.max(0, activeLikeRequests.current - 1);
      if (activeLikeRequests.current === 0) {
        setLiked(previousLiked);
        setNovel(previousNovel);
      }
      Alert.alert('Error', 'Failed to update like status');
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

      // Optimistic updateto UI
      setIsFollowing(!isFollowing);

      await toggleFollow(novel.authorId, isFollowing);

    } catch (error) {
      console.error('Error toggling follow:', error);
      Alert.alert('Error', 'Failed to update follow status');
      // Revert on error
      setIsFollowing(isFollowing);
    } finally {
      setIsTogglingFollow(false);
    }
  };

  const handleCommentSubmit = async () => {
    if (!newComment.trim() || !currentUser || !novel) return;

    try {
      setSubmittingComment(true);
      const commentRef = await addDoc(collection(db, 'comments'), {
        novelId: novel.id,
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userPhoto: currentUser.photoURL || null,
        content: newComment.trim(),
        createdAt: new Date().toISOString(),
        likes: 0,
        likedBy: [],
      });

      if (novel.authorId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: novel.authorId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || "Anonymous User",
          type: "novel_comment",
          novelId: novel.id,
          novelTitle: novel.title,
          commentContent: newComment.trim(),
          createdAt: new Date().toISOString(),
          read: false,
        });

        // Send Push Notification
        await sendPushNotification(
          novel.authorId,
          "New Comment! 💬",
          `${currentUser.displayName || "Someone"} commented on your novel "${novel.title}".`,
          { url: `novlnest://novel/${novel.id}` }
        )
      }

      setNewComment('');
      // Invalidate cache to update comment stats on return visits
      await invalidateCache(`novel_${novel.id}`);
      Alert.alert('Success', 'Comment posted successfully!');
    } catch (error) {
      console.error('Error submitting comment:', error);
      Alert.alert('Error', 'Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleReplySubmit = async (parentId: string) => {
    if (!replyContent.trim() || !currentUser || !novel) return;

    try {
      setSubmittingReply(true);
      await addDoc(collection(db, 'comments'), {
        novelId: novel.id,
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userPhoto: currentUser.photoURL || null,
        content: replyContent.trim(),
        createdAt: new Date().toISOString(),
        likes: 0,
        likedBy: [],
        parentId: parentId,
      });

      const parentCommentDoc = await getDoc(doc(db, 'comments', parentId));
      const parentCommentData = parentCommentDoc.exists() ? parentCommentDoc.data() : null;
      const parentCommentAuthorId = parentCommentData?.userId;

      if (novel.authorId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: novel.authorId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || "Anonymous User",
          type: "novel_reply",
          novelId: novel.id,
          novelTitle: novel.title,
          commentContent: replyContent.trim(),
          parentId: parentId,
          createdAt: new Date().toISOString(),
          read: false,
        });

        // Send Push Notification
        await sendPushNotification(
          novel.authorId,
          `${currentUser.displayName || "Someone"} 💬`,
          `Replied to a comment on your novel "${novel.title}"`,
          { url: `novlnest://novel/${novel.id}` }
        )
      }

      if (parentCommentAuthorId && parentCommentAuthorId !== novel.authorId && parentCommentAuthorId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: parentCommentAuthorId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || "Anonymous User",
          type: "comment_reply",
          novelId: novel.id,
          novelTitle: novel.title,
          commentContent: replyContent.trim(),
          parentId: parentId,
          createdAt: new Date().toISOString(),
          read: false,
        });

        // Send Push Notification
        await sendPushNotification(
          parentCommentAuthorId,
          `${currentUser.displayName || "Someone"} 💬`,
          `Replied to your comment in "${novel.title}"`,
          { url: `novlnest://novel/${novel.id}` }
        )
      }

      setReplyContent('');
      setReplyingTo(null);
      // Invalidate cache for fresh stats
      await invalidateCache(`novel_${novel.id}`);
      Alert.alert('Success', 'Reply posted successfully!');
    } catch (error) {
      console.error('Error submitting reply:', error);
      Alert.alert('Error', 'Failed to post reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!currentUser) return;

    Alert.alert(
      'Delete Comment',
      'Are you sure you want to delete this comment? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingComment(commentId);
              await deleteDoc(doc(db, 'comments', commentId));
              // Invalidate cache after deletion
              if (novel) {
                await invalidateCache(`novel_${novel.id}`);
              }
              Alert.alert('Success', 'Comment deleted successfully!');
            } catch (error) {
              console.error('Error deleting comment:', error);
              Alert.alert('Error', 'Failed to delete comment');
            } finally {
              setDeletingComment(null);
            }
          },
        },
      ]
    );
  };

  const handleCopyComment = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Comment copied to clipboard');
  };

  const handleEditSubmit = async () => {
    if (!editContent.trim() || !currentUser || !editingCommentId) return;

    try {
      setSubmittingComment(true);
      await updateDoc(doc(db, 'comments', editingCommentId), {
        content: editContent.trim(),
        updatedAt: new Date().toISOString(),
      });

      setEditingCommentId(null);
      setEditContent('');
      setShowCommentsModal(false);
      // Invalidate cache after edit
      if (novel) {
        await invalidateCache(`novel_${novel.id}`);
      }
      Alert.alert('Success', 'Comment updated successfully!');
    } catch (error) {
      console.error('Error updating comment:', error);
      Alert.alert('Error', 'Failed to update comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCommentLike = async (commentId: string, isLiked: boolean) => {
    if (!currentUser) return;

    try {
      const commentRef = doc(db, 'comments', commentId);
      const commentDoc = await getDoc(commentRef);

      if (!commentDoc.exists()) return;

      const commentData = commentDoc.data();
      const commentAuthorId = commentData.userId;

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

        if (commentAuthorId !== currentUser.uid) {
          const notificationQuery = query(
            collection(db, 'notifications'),
            where('toUserId', '==', commentAuthorId),
            where('fromUserId', '==', currentUser.uid),
            where('type', '==', 'comment_like'),
            where('commentId', '==', commentId)
          );

          const existingNotifications = await getDocs(notificationQuery);

          if (existingNotifications.empty) {
            await addDoc(collection(db, 'notifications'), {
              toUserId: commentAuthorId,
              fromUserId: currentUser.uid,
              fromUserName: currentUser.displayName || 'Anonymous User',
              type: 'comment_like',
              novelId: novel?.id,
              novelTitle: novel?.title,
              commentId: commentId,
              commentContent: commentData.content,
              createdAt: new Date().toISOString(),
              read: false,
            });

            // Send Push Notification
            await sendPushNotification(
              commentAuthorId,
              `${currentUser.displayName || 'Someone'} ❤️`,
              `Liked your comment on "${novel?.title || 'a novel'}"`,
              { url: `novlnest://novel/${novel?.id}` }
            );
          }
        }
      }
    } catch (error) {
      console.error('Error updating comment like:', error);
    }
  };

  const handleShare = async () => {
    try {
      await RNShare.share({
        message: `Check out "${novel?.title}" by ${novel?.authorName} on NovlNest! https://novlnest.com/novel/${novel?.id}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
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

  const canDeleteComment = (comment: Comment) => {
    if (!currentUser) return false;
    return comment.userId === currentUser.uid || (novel && novel.authorId === currentUser.uid);
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

  const getParentCommentData = (parentId: string | undefined): { userName: string; userId: string } | null => {
    if (!parentId) return null;

    const findCommentById = (comments: Comment[], id: string): Comment | null => {
      for (const c of comments) {
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

  const handleProfileNavigation = (userId: string) => {
    setShowCommentsModal(false);
    navigation.navigate('Profile', { userId });
  };

  const renderComment = (comment: Comment, isReply: boolean = false) => (
    <View
      key={comment.id}
      style={isReply ? styles.replyItem : styles.commentItem}
      ref={(ref) => { commentRefs.current[comment.id] = ref; }}
    >
      <View style={styles.commentContainer}>
        {/* Left Side: Avatar */}
        <TouchableOpacity onPress={() => handleProfileNavigation(comment.userId)}>
          {comment.userPhoto ? (
            <CachedImage uri={comment.userPhoto} style={styles.commentAvatar} />
          ) : (
            <View style={styles.commentAvatarPlaceholder}>
              <Text style={styles.commentAvatarText}>{getUserInitials(comment.userName)}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Middle/Right: Main Content Area */}
        <View style={styles.commentContentWrapper}>
          <View style={styles.commentMainArea}>
            {/* Header: Name/Tags */}
            <View style={styles.commentHeader}>
              {isReply && comment.parentId ? (
                <View style={styles.replyHeader}>
                  <TouchableOpacity onPress={() => handleProfileNavigation(comment.userId)}>
                    <Text style={styles.commentUserName}>{comment.userName}</Text>
                  </TouchableOpacity>
                  <Text style={styles.replyArrow}> {'>'} </Text>
                  {(() => {
                    const parent = getParentCommentData(comment.parentId);
                    return parent ? (
                      <TouchableOpacity onPress={() => handleProfileNavigation(parent.userId)}>
                        <Text style={styles.commentUserName}>{parent.userName}</Text>
                      </TouchableOpacity>
                    ) : null;
                  })()}
                </View>
              ) : (
                <TouchableOpacity onPress={() => handleProfileNavigation(comment.userId)}>
                  <Text style={styles.commentUserName}>{comment.userName}</Text>
                </TouchableOpacity>
              )}
              {comment.userId === novel?.authorId && (
                <View style={styles.authorBadge}>
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
              <Text style={styles.commentText}>{comment.content}</Text>
            </Pressable>

            {/* Action Row */}
            <View style={styles.commentActionsRow}>
              <Text style={styles.commentDate}>{formatDate(comment.createdAt)}</Text>

              <TouchableOpacity onPress={() => {
                setReplyingTo(comment.id);
                setReplyingToUser(comment.userName);
                setShowCommentsModal(true);
                setTimeout(() => replyInputRef.current?.focus(), 100);
              }}>
                <Text style={styles.commentActionText}>Reply</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Far Right: Like Button */}
          <View style={styles.commentLikeContainer}>
            <TouchableOpacity
              onPress={() => handleCommentLike(comment.id, comment.likedBy?.includes(currentUser?.uid || ''))}
              disabled={!currentUser}
              style={styles.commentLikeAction}
            >
              <Ionicons
                name={comment.likedBy?.includes(currentUser?.uid || '') ? 'heart' : 'heart-outline'}
                size={16}
                color={comment.likedBy?.includes(currentUser?.uid || '') ? '#EF4444' : '#9CA3AF'}
              />
              <Text style={styles.commentLikeCount}>{comment.likes || 0}</Text>
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

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !novel) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={60} color="#EF4444" />
          <Text style={styles.errorText}>{error || 'Novel not found'}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isAuthor = currentUser && novel.authorId === currentUser.uid;
  const totalParts = (novel.authorsNote ? 1 : 0) + (novel.prologue ? 1 : 0) + (novel.chapters?.length || 0) + (novel.epilogue ? 1 : 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
            <Ionicons name="share-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Cover and Info */}
        <View style={styles.coverSection}>
          {novel.coverImage ? (
            <CachedImage
              uri={getFirebaseDownloadUrl(novel.coverImage)}
              style={styles.coverImage}
              resizeMode="cover"
              placeholderColor={colors.backgroundSecondary}
            />
          ) : (
            <View style={styles.placeholderCover}>
              <Ionicons name="book" size={60} color="#9CA3AF" />
            </View>
          )}
        </View>

        <View style={styles.infoSection}>
          {novel.publicDomain && (
            <ClassicsBadge style={{ marginBottom: 8 }} />
          )}
          <Text style={styles.title}>{novel.title}</Text>
          <View style={styles.authorRow}>
            <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: novel.authorId })}>
              <Text style={styles.author}>by {novel.authorName}</Text>
            </TouchableOpacity>

            {currentUser && !isAuthor && !novel.publicDomain && (
              <TouchableOpacity
                style={[
                  styles.followButton,
                  isFollowing ? styles.followingButton : { backgroundColor: colors.primary }
                ]}
                onPress={handleFollowToggle}
                disabled={isTogglingFollow}
              >
                {isTogglingFollow ? (
                  <ActivityIndicator size="small" color={isFollowing ? colors.primary : '#fff'} />
                ) : (
                  <>
                    <Ionicons
                      name={isFollowing ? 'checkmark-circle' : 'person-add'}
                      size={14}
                      color={isFollowing ? colors.primary : '#fff'}
                    />
                    <Text style={[
                      styles.followButtonText,
                      isFollowing && { color: colors.primary }
                    ]}>
                      {isFollowing ? 'Following' : 'Follow'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Status Badge */}
          <View style={[
            styles.statusBadge,
            { backgroundColor: novel.status === 'completed' ? '#10B981' : colors.primary }
          ]}>
            <Text style={styles.statusBadgeText}>
              {novel.status === 'completed' ? 'Completed' : 'Ongoing'}
            </Text>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="eye-outline" size={18} color="#9CA3AF" />
              <Text style={styles.statText}>Reads</Text>
              <Text style={styles.statValue}>{novel.views || 0}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="heart-outline" size={18} color="#9CA3AF" />
              <Text style={styles.statText}>Votes</Text>
              <Text style={styles.statValue}>{novel.likedBy?.length || 0}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="list-outline" size={18} color="#9CA3AF" />
              <Text style={styles.statText}>Parts</Text>
              <Text style={styles.statValue}>{totalParts}</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.readButton}
              onPress={() => navigation.navigate('NovelReader', { novelId: novel.id, chapterNumber: 0 })}
            >
              <Ionicons name="book-outline" size={20} color="#fff" />
              <Text style={styles.readButtonText}>Start reading</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.likeButton}
              onPress={handleLike}
              disabled={!currentUser}
            >
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={24}
                color={liked ? '#EF4444' : '#fff'}
              />
            </TouchableOpacity>
          </View>

          {/* Secondary Actions */}
          <View style={styles.secondaryActions}>
            {authorData?.supportLink && !novel.publicDomain && (
              <TouchableOpacity
                style={styles.giftButton}
                onPress={() => setShowTipModal(true)}
              >
                <Ionicons name="gift-outline" size={18} />
                <Text style={styles.giftButtonText}>Gift</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Genres */}
          {novel.genres && novel.genres.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.genresContainer}>
              {novel.genres.map((genre, index) => (
                <View key={index} style={styles.genreTag}>
                  <Text style={styles.genreText}>{genre}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Description */}
          <View style={styles.descriptionContainer}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text
              style={styles.description}
              numberOfLines={isSummaryExpanded ? undefined : 4}
            >
              {novel.summary || novel.description || 'No description available.'}
            </Text>
            {(novel.summary || novel.description)?.length > 150 && (
              <TouchableOpacity onPress={() => setIsSummaryExpanded(!isSummaryExpanded)}>
                <Text style={styles.seeMore}>
                  {isSummaryExpanded ? 'See less' : 'See more'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Chapters */}
          <View style={styles.chaptersContainer}>
            <View style={styles.chaptersHeader}>
              <Text style={styles.sectionTitle}>Table of Contents ({totalParts})</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('ChaptersList', { novelId: novel.id, novel })}
              >
                <Text style={styles.viewAllText}>View all</Text>
              </TouchableOpacity>
            </View>

            {/* Author hint for long press */}
            {isAuthor && novel.chapters && novel.chapters.length > 0 && (
              <View style={styles.authorHint}>
                <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
                <Text style={styles.authorHintText}>Long press on a chapter to edit or delete it</Text>
              </View>
            )}

            {/* Author's Note */}
            {novel.authorsNote && (
              <TouchableOpacity
                style={styles.chapterItem}
                onPress={() => navigation.navigate('NovelReader', { novelId: novel.id, chapterNumber: 0 })}
              >
                <View style={styles.chapterInfo}>
                  <Text style={styles.chapterIcon}>📝</Text>
                  <Text style={styles.chapterTitle}>Author's Note</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6B7280" />
              </TouchableOpacity>
            )}

            {/* Prologue */}
            {novel.prologue && (
              <TouchableOpacity
                style={styles.chapterItem}
                onPress={() =>
                  navigation.navigate('NovelReader', {
                    novelId: novel.id,
                    chapterNumber: novel.authorsNote ? 1 : 0,
                  })
                }
              >
                <View style={styles.chapterInfo}>
                  <Text style={styles.chapterIcon}>🌅</Text>
                  <Text style={styles.chapterTitle}>Prologue</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6B7280" />
              </TouchableOpacity>
            )}

            {/* Chapters - Show first 3 */}
            {novel.chapters?.slice(0, 3).map((chapter: any, index: number) => {
              const chapterNumber =
                (novel.authorsNote ? 1 : 0) + (novel.prologue ? 1 : 0) + index;
              return (
                <TouchableOpacity
                  key={index}
                  style={styles.chapterItem}
                  onPress={() =>
                    navigation.navigate('NovelReader', {
                      novelId: novel.id,
                      chapterNumber: chapterNumber,
                    })
                  }
                  onLongPress={() => {
                    if (isAuthor) {
                      Alert.alert(
                        chapter.title,
                        'Choose an action',
                        [
                          {
                            text: 'Edit Chapter',
                            onPress: () =>
                              navigation.navigate('EditChapter', {
                                novelId: novel.id,
                                chapterIndex: index,
                              }),
                          },
                          {
                            text: 'Delete Chapter',
                            style: 'destructive',
                            onPress: () => {
                              Alert.alert(
                                'Confirm Deletion',
                                'Are you sure you want to delete this chapter? This action cannot be undone.',
                                [
                                  {
                                    text: 'Delete',
                                    style: 'destructive',
                                    onPress: async () => {
                                      try {
                                        const novelRef = doc(db, 'novels', novel.id);
                                        const novelDoc = await getDoc(novelRef);
                                        if (novelDoc.exists()) {
                                          const novelData = novelDoc.data() as Novel;
                                          const updatedChapters = [...(novelData.chapters || [])];
                                          updatedChapters.splice(index, 1);
                                          await updateDoc(novelRef, { chapters: updatedChapters });
                                          Alert.alert('Success', 'Chapter deleted successfully!');
                                        }
                                      } catch (error) {
                                        console.error('Error deleting chapter:', error);
                                        Alert.alert('Error', 'Failed to delete chapter. Please try again.');
                                      }
                                    },
                                  },
                                  { text: 'Cancel', style: 'cancel' },
                                ]
                              );
                            },
                          },
                          { text: 'Cancel', style: 'cancel' },
                        ]
                      );
                    }
                  }}
                >
                  <View style={styles.chapterInfo}>
                    <Text style={styles.chapterNumber}>{index + 1}</Text>
                    <Text style={styles.chapterTitle} numberOfLines={1}>
                      {chapter.title}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#6B7280" />
                </TouchableOpacity>
              );
            })}

            {/* Epilogue */}
            {novel.epilogue && (
              <TouchableOpacity
                style={styles.chapterItem}
                onPress={() =>
                  navigation.navigate('NovelReader', {
                    novelId: novel.id,
                    chapterNumber: totalParts - 1,
                  })
                }
                onLongPress={() => {
                  if (isAuthor) {
                    Alert.alert(
                      'Manage Epilogue',
                      'Choose an action for the epilogue',
                      [
                        {
                          text: 'Edit Epilogue',
                          onPress: () => {
                            navigation.navigate('ChapterEditor', {
                              chapterNumber: 'Epilogue',
                              initialTitle: novel.epilogue?.title || 'Epilogue',
                              initialContent: novel.epilogue?.content || '',
                              onSave: async (epilogueData: { title: string; content: string }) => {
                                try {
                                  await updateDoc(doc(db, 'novels', novel.id), {
                                    epilogue: epilogueData,
                                    updatedAt: new Date().toISOString(),
                                  });
                                  Alert.alert('Success', 'Epilogue updated successfully!');
                                } catch (error) {
                                  console.error('Error updating epilogue:', error);
                                  Alert.alert('Error', 'Failed to update epilogue');
                                }
                              }
                            });
                          },
                        },
                        {
                          text: 'Delete Epilogue',
                          style: 'destructive',
                          onPress: () => {
                            Alert.alert(
                              'Delete Epilogue',
                              'Are you sure you want to delete the epilogue?',
                              [
                                {
                                  text: 'Delete',
                                  style: 'destructive',
                                  onPress: async () => {
                                    try {
                                      await updateDoc(doc(db, 'novels', novel.id), {
                                        epilogue: deleteField(),
                                        status: 'ongoing',
                                      });
                                      Alert.alert('Success', 'Epilogue deleted successfully!');
                                    } catch (error) {
                                      console.error('Error deleting epilogue:', error);
                                      Alert.alert('Error', 'Failed to delete epilogue');
                                    }
                                  },
                                },
                                { text: 'Cancel', style: 'cancel' },
                              ]
                            );
                          },
                        },
                        { text: 'Cancel', style: 'cancel' },
                      ]
                    );
                  }
                }}
              >
                <View style={styles.chapterInfo}>
                  <Text style={styles.chapterIcon}>🎬</Text>
                  <Text style={styles.chapterTitle}>{novel.epilogue?.title || 'Epilogue'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>

          {/* More like this */}
          {relatedNovels.length > 0 && (
            <View style={styles.relatedSection}>
              <Text style={styles.sectionTitle}>
                {novel?.genres && novel.genres[0] ? `More ${novel.genres[0]} Stories` : 'Recommended For You'}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.relatedScroll}
              >
                {relatedNovels.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.relatedCard}
                    onPress={() => {
                      navigation.replace('NovelOverview', { novelId: item.id });
                    }}
                  >
                    {item.coverSmallImage || item.coverImage ? (
                      <CachedImage
                        uri={getFirebaseDownloadUrl(item.coverSmallImage || item.coverImage || '')}
                        style={styles.relatedCover}
                        resizeMode="cover"
                        placeholderColor={colors.backgroundSecondary}
                      />
                    ) : (
                      <View style={[styles.relatedCover, { backgroundColor: colors.backgroundSecondary }]}>
                        <Text style={styles.fallbackTitle} numberOfLines={3}>
                          {item.title}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Comments Section */}
          <View style={styles.commentsSection}>
            <Text style={styles.sectionTitle}>
              Comments ({totalCommentsCount})
            </Text>

            {commentsLoading ? (
              <ActivityIndicator size="small" color="#8B5CF6" style={{ marginTop: 20 }} />
            ) : comments.length === 0 ? (
              <View style={styles.emptyComments}>
                <Ionicons name="chatbubbles-outline" size={48} color="#9CA3AF" />
                <Text style={styles.emptyCommentsText}>No comments yet</Text>
                <Text style={styles.emptyCommentsSubtext}>Be the first to share your thoughts!</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.viewAllCommentsBtn}
                onPress={() => setShowCommentsModal(true)}
              >
                <Ionicons name="chatbubbles-outline" size={18} color="#9CA3AF" />
                <Text style={styles.viewAllCommentsText}>
                  View all {totalCommentsCount} comments
                </Text>
              </TouchableOpacity>
            )}

            {currentUser ? (
              <TouchableOpacity
                style={styles.fakeCommentInputContainer}
                onPress={() => setShowCommentsModal(true)}
              >
                {currentUser.photoURL ? (
                  <CachedImage uri={currentUser.photoURL} style={styles.fakeCommentAvatar} />
                ) : (
                  <View style={styles.fakeCommentAvatarPlaceholder}>
                    <Text style={styles.fakeCommentAvatarText}>{getUserInitials(currentUser.displayName || 'U')}</Text>
                  </View>
                )}
                <View style={styles.fakeCommentInput}>
                  <Text style={styles.fakeCommentInputText}>Add a comment...</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.loginPrompt}>
                <Text style={styles.loginPromptText}>Sign in to leave a comment</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                  <Text style={styles.loginPromptLink}>Sign In →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Tip Modal */}
      {
        showTipModal && authorData?.supportLink && (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setShowTipModal(false)}
              >
                <Ionicons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>

              <View style={styles.modalHeader}>
                <Ionicons name="gift" size={48} color="#10B981" />
                <Text style={styles.modalTitle}>Want to tip this author?</Text>
                <Text style={styles.modalSubtitle}>Here are the payment details:</Text>
              </View>

              <View style={styles.tipInfo}>
                {authorData.supportLink.startsWith('http') ? (
                  <View>
                    <Text style={styles.tipLabel}>Support Link:</Text>
                    <Text style={styles.tipValue} selectable>
                      {authorData.supportLink}
                    </Text>
                  </View>
                ) : (
                  <View>
                    <View style={styles.tipRow}>
                      <Text style={styles.tipLabel}>Bank:</Text>
                      <Text style={styles.tipValue}>
                        {authorData.supportLink.split(':')[0] || 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.tipRow}>
                      <Text style={styles.tipLabel}>Account Number:</Text>
                      <Text style={styles.tipValue}>
                        {authorData.supportLink.split(':')[1]?.split(',')[0]?.trim() || 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.tipRow}>
                      <Text style={styles.tipLabel}>Account Name:</Text>
                      <Text style={styles.tipValue}>
                        {authorData.supportLink.split(',')[1]?.trim() || 'N/A'}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.copyButton}
                onPress={async () => {
                  await Clipboard.setStringAsync(authorData.supportLink ?? '');
                  Alert.alert('Success', 'Payment details copied to clipboard!');
                }}
              >
                <Ionicons name="copy-outline" size={20} color="#fff" />
                <Text style={styles.copyButtonText}>
                  {authorData.supportLink.startsWith('http') ? 'Copy Link' : 'Copy Details'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      }

      {/* Main Comments Modal */}
      <Modal
        visible={showCommentsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCommentsModal(false)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 45 : 0}
          style={styles.commentsModalContainer}
        >
          <View style={[styles.commentsModalHeader, { paddingTop: Platform.OS === 'android' ? insets.top : 16 }]}>
            <Text style={styles.commentsModalTitle}>{totalCommentsCount} Comments</Text>
            <TouchableOpacity
              style={styles.commentsModalClose}
              onPress={() => setShowCommentsModal(false)}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {comments.length === 0 ? (
            <View style={[styles.emptyComments, { flex: 1, justifyContent: 'center' }]}>
              <Ionicons name="chatbubbles-outline" size={48} color="#9CA3AF" />
              <Text style={styles.emptyCommentsText}>No comments yet</Text>
              <Text style={styles.emptyCommentsSubtext}>Be the first to share your thoughts!</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.commentsModalList}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {comments.map((comment) => renderComment(comment))}
            </ScrollView>
          )}

          {currentUser && (
            <View style={[styles.commentsModalInputArea, { paddingBottom: Math.max(insets.bottom, 25) }]}>
              {currentUser.photoURL ? (
                <CachedImage uri={currentUser.photoURL} style={styles.fakeCommentAvatar} />
              ) : (
                <View style={styles.fakeCommentAvatarPlaceholder}>
                  <Text style={styles.fakeCommentAvatarText}>{getUserInitials(currentUser.displayName || 'U')}</Text>
                </View>
              )}
              <View style={styles.commentsModalInputWrapperWrapper}>
                {replyingTo && !editingCommentId && (
                  <View style={styles.replyingToBanner}>
                    <Text style={styles.replyingToText}>Replying to {replyingToUser}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setReplyingTo(null);
                        setReplyingToUser('');
                        setNewComment('');
                      }}
                      style={styles.replyingToCancel}
                    >
                      <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                )}
                {editingCommentId && (
                  <View style={styles.replyingToBanner}>
                    <Text style={styles.replyingToText}>Editing Comment</Text>
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
                <View style={styles.commentsModalInputWrapper}>
                  <TextInput
                    ref={replyInputRef}
                    value={editingCommentId ? editContent : (replyingTo ? replyContent : newComment)}
                    onChangeText={editingCommentId ? setEditContent : (replyingTo ? setReplyContent : setNewComment)}
                    placeholder={editingCommentId ? "Edit comment..." : (replyingTo ? "Write a reply..." : "Add a comment...")}
                    placeholderTextColor="#9CA3AF"
                    style={styles.commentsModalInput}
                    multiline
                    maxLength={500}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      if (editingCommentId) {
                        handleEditSubmit();
                      } else if (replyingTo) {
                        handleReplySubmit(replyingTo);
                      } else {
                        handleCommentSubmit();
                      }
                    }}
                    disabled={(editingCommentId ? !editContent.trim() : (replyingTo ? !replyContent.trim() : !newComment.trim())) || submittingComment || submittingReply}
                    style={styles.commentsModalSubmitBtn}
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
                    handleCopyComment(selectedCommentForOptions.content || '');
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
                    if (selectedCommentForOptions) {
                      setEditingCommentId(selectedCommentForOptions.id);
                      setEditContent(selectedCommentForOptions.content || '');
                      setShowOptionsModal(false);
                      setTimeout(() => replyInputRef.current?.focus(), 100);
                    }
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



    </SafeAreaView >
  );
};

const getStyles = (themeColors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: themeColors.text,
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: themeColors.primary,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: themeColors.background,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.cardBorder,
  },
  headerButton: {
    padding: 8,
  },
  headerActions: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  container: {
    flex: 1,
  },
  coverSection: {
    alignItems: 'center' as const,
    paddingVertical: 20,
    backgroundColor: themeColors.background,
  },
  coverImage: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.9,
    borderRadius: 12,
  },
  placeholderCover: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.9,
    backgroundColor: themeColors.card,
    borderRadius: 12,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  infoSection: {
    padding: 20,
    backgroundColor: themeColors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: themeColors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 12,
  },
  author: {
    fontSize: 14,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign: 'center',
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: themeColors.primary,
  },
  followButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    alignItems: 'center' as const,
    paddingVertical: 16,
    backgroundColor: themeColors.card,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  statItem: {
    alignItems: 'center' as const,
    flex: 1,
  },
  statText: {
    fontSize: 12,
    color: themeColors.textSecondary,
    marginTop: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: themeColors.text,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: themeColors.cardBorder,
  },
  actionButtons: {
    flexDirection: 'row' as const,
    gap: 12,
    marginBottom: 12,
  },
  readButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: themeColors.primary,
    paddingVertical: 14,
    borderRadius: 25,
    gap: 8,
  },
  relatedSection: {
    paddingBottom: 20,
    backgroundColor: themeColors.background,
  },
  relatedScroll: {
    paddingTop: 12,
    gap: 16,
  },
  relatedCard: {
    width: 120,
  },
  relatedCover: {
    width: 120,
    height: 180,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: themeColors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  relatedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.text,
    marginBottom: 2,
  },
  relatedAuthor: {
    fontSize: 12,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  fallbackTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: themeColors.text,
    textAlign: 'center',
    padding: 8,
  },
  readButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  likeButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: themeColors.surface,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  secondaryActions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 20,
  },
  secondaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: themeColors.card,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  secondaryButtonText: {
    color: themeColors.text,
    fontSize: 14,
  },
  finishedButton: {
    backgroundColor: themeColors.success,
    borderColor: themeColors.success,
  },
  finishedText: {
    color: '#000',
  },
  giftButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: themeColors.success,
    borderRadius: 20,
    gap: 6,
  },
  giftButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  genresContainer: {
    marginBottom: 20,
  },
  genreTag: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: themeColors.card,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  genreText: {
    color: themeColors.text,
    fontSize: 14,
  },
  descriptionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    color: themeColors.text,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: themeColors.textSecondary,
    lineHeight: 22,
  },
  seeMore: {
    color: themeColors.primary,
    fontSize: 14,
    fontWeight: '600' as const,
    marginTop: 8,
  },
  chaptersContainer: {
    marginBottom: 24,
  },
  chaptersHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  authorHint: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: themeColors.primary + '15',
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: themeColors.primary + '30',
  },
  authorHintText: {
    fontSize: 12,
    color: themeColors.primary,
    fontStyle: 'italic' as const,
  },
  viewAllText: {
    color: themeColors.primary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  chapterItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: themeColors.card,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  chapterInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
    gap: 12,
  },
  chapterIcon: {
    fontSize: 20,
  },
  chapterNumber: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: themeColors.primary,
    width: 30,
  },
  chapterTitle: {
    fontSize: 15,
    color: themeColors.text,
    flex: 1,
  },
  commentsSection: {
    marginBottom: 40,
  },
  commentsPreviewList: {
    marginBottom: 16,
  },
  viewAllCommentsBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 8,
  },
  viewAllCommentsText: {
    color: themeColors.textSecondary,
    fontSize: 14,
    fontWeight: '500' as const,
  },
  fakeCommentInputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 8,
  },
  fakeCommentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  fakeCommentAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: themeColors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: 10,
  },
  fakeCommentAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold' as const,
  },
  fakeCommentInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: themeColors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  fakeCommentInputText: {
    color: themeColors.textSecondary,
    fontSize: 14,
  },
  commentsModalContainer: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  commentsModalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.cardBorder,
    backgroundColor: themeColors.background,
  },
  commentsModalTitle: {
    color: themeColors.text,
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
  commentsModalClose: {
    position: 'absolute' as const,
    right: 16,
    padding: 4,
  },
  commentsModalList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  commentsModalInputArea: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 25,
    borderTopWidth: 1,
    borderTopColor: themeColors.cardBorder,
    backgroundColor: themeColors.background,
  },
  commentsModalInputWrapper: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: themeColors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    minHeight: 50,
    maxHeight: 100,
  },
  commentsModalInput: {
    flex: 1,
    color: themeColors.text,
    fontSize: 14,
    paddingTop: 0,
    paddingBottom: 0,
  },
  commentsModalSubmitBtn: {
    padding: 6,
    marginLeft: 4,
  },
  loginPrompt: {
    padding: 16,
    backgroundColor: themeColors.card,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  loginPromptText: {
    color: themeColors.textSecondary,
    fontSize: 14,
    marginBottom: 8,
  },
  loginPromptLink: {
    color: themeColors.primary,
    fontSize: 14,
  },
  emptyComments: {
    alignItems: 'center' as const,
    paddingVertical: 40,
  },
  emptyCommentsText: {
    color: themeColors.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },
  emptyCommentsSubtext: {
    color: themeColors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  commentItem: {
    marginBottom: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.cardBorder,
  },
  replyItem: {
    marginBottom: 8,
    marginTop: 8,
  },
  commentContainer: {
    flexDirection: 'row' as const,
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
    backgroundColor: themeColors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: 12,
  },
  commentAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold' as const,
  },
  commentContentWrapper: {
    flex: 1,
    flexDirection: 'row',
  },
  commentMainArea: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 4,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  replyHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  replyArrow: {
    color: themeColors.textSecondary,
    fontSize: 14,
    marginHorizontal: 4,
  },
  commentUserName: {
    color: themeColors.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  commentDate: {
    color: themeColors.textSecondary,
    fontSize: 12,
  },
  authorBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: themeColors.primary,
    borderRadius: 4,
  },
  authorBadgeText: {
    color: '#fff',
    fontSize: 10,
  },
  commentText: {
    color: themeColors.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  commentActionsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 16,
    marginTop: 4,
  },
  commentActionText: {
    color: themeColors.textSecondary,
    fontSize: 14,
    fontWeight: 'bold' as const,
  },
  commentLikeContainer: {
    alignItems: 'center' as const,
    marginLeft: 12,
    marginTop: 4,
  },
  commentLikeAction: {
    alignItems: 'center' as const,
  },
  commentLikeCount: {
    color: themeColors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  replyInputContainer: {
    marginTop: 12,
  },
  replyInput: {
    backgroundColor: themeColors.surface,
    color: themeColors.text,
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
    minHeight: 60,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  replyActions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    gap: 8,
  },
  replyCancel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  replyCancelText: {
    color: themeColors.textSecondary,
    fontSize: 12,
  },
  replySubmit: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: themeColors.primary,
    borderRadius: 4,
  },
  replySubmitText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600' as const,
  },
  repliesContainer: {
    marginTop: 8,
  },
  modalOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 20,
  },
  modalContent: {
    backgroundColor: themeColors.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  modalClose: {
    position: 'absolute' as const,
    top: 16,
    right: 16,
    zIndex: 1,
  },
  modalHeader: {
    alignItems: 'center' as const,
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: themeColors.text,
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  modalSubtitle: {
    fontSize: 14,
    color: themeColors.textSecondary,
    textAlign: 'center' as const,
  },
  tipInfo: {
    backgroundColor: themeColors.surface,
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  tipRow: {
    marginBottom: 12,
  },
  tipLabel: {
    fontSize: 12,
    color: themeColors.textSecondary,
    marginBottom: 4,
  },
  tipValue: {
    fontSize: 14,
    color: themeColors.text,
    fontWeight: '500' as const,
  },
  copyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: themeColors.success,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  commentsModalInputWrapperWrapper: {
    flex: 1,
  },
  replyingToBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: themeColors.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: themeColors.cardBorder,
  },
  replyingToText: {
    fontSize: 12,
    color: themeColors.textSecondary,
    fontWeight: '500' as const,
  },
  replyingToCancel: {
    padding: 2,
  },
  statusBadge: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: '#fff',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
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

export default NovelOverviewScreen;