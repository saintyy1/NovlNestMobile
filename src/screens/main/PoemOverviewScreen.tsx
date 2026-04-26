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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import CachedImage from '../../components/CachedImage';
import ClassicsBadge from '../../components/ClassicsBadge';
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
import { Poem } from '../../types/poem';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../contexts/AlertContext';
import { trackPoemView, trackContentInteraction } from '../../utils/Analytics-utils';
import { withCache, CACHE_TTL, invalidateCache, invalidateByPrefix } from '../../utils/cache';
import { sendPushNotification } from '../../services/PushNotificationService';
import { hydrateComments } from '../../utils/commentUtils';

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

const PoemOverviewScreen = ({ route, navigation }: any) => {
  const { poemId: poemIdParam, id } = route.params;
  const poemId = poemIdParam || id;
  const { currentUser, updatePoemLibrary, toggleFollow } = useAuth();
  const { colors } = useTheme();
  const { showAlert, showToast } = useAlert();
  const insets = useSafeAreaInsets();

  const [poem, setPoem] = useState<Poem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [totalCommentsCount, setTotalCommentsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [error, setError] = useState('');
  const [liked, setLiked] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [authorData, setAuthorData] = useState<AuthorData | null>(null);
  const [relatedPoems, setRelatedPoems] = useState<Poem[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // Follow states
  const [isFollowing, setIsFollowing] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  // Keep follow state in sync with AuthContext
  useEffect(() => {
    if (currentUser && poem?.poetId) {
      setIsFollowing(currentUser.following?.includes(poem.poetId) || false);
    }
  }, [currentUser?.following, poem?.poetId]);

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

  // Modal states
  const [showShareModal, setShowShareModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);

  const styles = getStyles(colors, insets);

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

  // Fetch poem data
  const fetchpoem = useCallback(async () => {
    if (!poemId) {
      setError('Poem ID is missing');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const poemDocRef = doc(db, 'poems', poemId);

      const poemData = await withCache(`poem_${poemId}`, async () => {
        const poemDoc = await getDoc(poemDocRef);
        if (poemDoc.exists()) {
          return { id: poemDoc.id, ...poemDoc.data() } as Poem;
        }
        throw new Error('poem not found');
      }, CACHE_TTL.CONTENT);

      setPoem(poemData);

      // Track poem view for analytics
      trackPoemView({
        poemId: poemData.id,
        title: poemData.title,
        authorId: poemData.poetId,
        authorName: poemData.poetName,
        genres: poemData.genres,
      });

      if (currentUser) {
        // Increment view count only once per user
        const viewKey = `poem_view_${poemId}_${currentUser.uid}`;
        const hasViewed = await AsyncStorage.getItem(viewKey);

        if (!hasViewed) {
          try {
            await updateDoc(poemDocRef, { views: increment(1) });
            await AsyncStorage.setItem(viewKey, 'true');
            // Invalidate cache immediately
            await invalidateCache(`poem_${poemId}`);
            setPoem(prev => prev ? { ...prev, views: (prev.views || 0) + 1 } : null);
          } catch (error) {
            console.error('Error incrementing view count:', error);
          }
        }
      }
    } catch (error: any) {
      if (error.message === 'poem not found') {
        setError('poem not found');
      } else {
        console.error('Error fetching poem:', error);
        setError('Failed to load poem');
      }
    } finally {
      setLoading(false);
    }
  }, [poemId, currentUser?.uid]);

  useEffect(() => {
    fetchpoem();
  }, [fetchpoem]);

  // 🚀 Refresh on focus to catch changes from other screens
  useFocusEffect(
    useCallback(() => {
      fetchpoem();
    }, [fetchpoem])
  );

  // Handle user-specific state (liked, isFollowing)
  useEffect(() => {
    if (poem && currentUser) {
      setLiked(poem.likedBy?.includes(currentUser.uid) || false);
      setIsFollowing(currentUser.following?.includes(poem.poetId) || false);
    } else if (!currentUser) {
      setLiked(false);
      setIsFollowing(false);
    }
  }, [poem?.id, currentUser?.uid, currentUser?.following]);

  // Fetch author data
  useEffect(() => {
    const fetchAuthorData = async () => {
      if (poem?.poetId) {
        try {
          const authorDoc = await getDoc(doc(db, 'users', poem.poetId));
          if (authorDoc.exists()) {
            setAuthorData(authorDoc.data() as AuthorData);
          }
        } catch (error) {
          console.error('Error fetching author data:', error);
        }
      }
    };

    fetchAuthorData();
  }, [poem?.poetId]);

  // Fetch comments
  useEffect(() => {
    if (!poemId) return;

    const commentsQuery = query(
      collection(db, 'poemComments'),
      where('poemId', '==', poemId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(commentsQuery, async (snapshot) => {
      setCommentsLoading(true);
      const commentsData: Comment[] = [];
      snapshot.forEach((doc) => {
        commentsData.push({ id: doc.id, ...doc.data() } as Comment);
      });

      // Hydrate all comments with fresh profile info using the centralized utility
      const enrichedComments = await hydrateComments(commentsData);

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
  }, [poemId, buildCommentTree]);

  // Fetch related poems
  useEffect(() => {
    const fetchRelatedPoems = async () => {
      if (!poem?.id) return;

      try {
        setLoadingRelated(true);
        const cacheKey = `related_poems_${poem.id}`;

        const relatedItems = await withCache(cacheKey, async () => {
          let items: Poem[] = [];
          const seenIds = new Set<string>();
          seenIds.add(poem.id);

          // 1. Try fetching by same genre
          if (poem.genres && poem.genres.length > 0) {
            const primaryGenre = poem.genres[0];
            const genreQuery = query(
              collection(db, 'poems'),
              where('published', '==', true),
              where('genres', 'array-contains', primaryGenre),
              limit(12)
            );
            const genreSnapshot = await getDocs(genreQuery);
            const userGenreItems: Poem[] = [];
            const classicGenreItems: Poem[] = [];

            genreSnapshot.forEach((doc) => {
              const { content, ...rest } = doc.data() as any;
              const data = { id: doc.id, ...rest } as Poem;
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

          // 2. Fallback: fetch latest published poems if we don't have enough
          if (items.length < 5) {
            const latestQuery = query(
              collection(db, 'poems'),
              where('published', '==', true),
              orderBy('createdAt', 'desc'),
              limit(12)
            );
            const latestSnapshot = await getDocs(latestQuery);
            const userLatestItems: Poem[] = [];
            const classicLatestItems: Poem[] = [];

            latestSnapshot.forEach((doc) => {
              const { content, ...rest } = doc.data() as any;
              const data = { id: doc.id, ...rest } as Poem;
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

        setRelatedPoems(relatedItems);
      } catch (error) {
        console.error('Error fetching related poems:', error);
      } finally {
        setLoadingRelated(false);
      }
    };

    fetchRelatedPoems();
  }, [poem?.id, poem?.genres]);

  const handleLike = async () => {
    if (!poem?.id || !currentUser) {
      showAlert({ title: 'Error', message: 'Please login to like poems', type: 'info' });
      return;
    }

    const previousPoem = poem;
    const previousLiked = liked;
    const newLikeStatus = !liked;

    activeLikeRequests.current++;

    try {
      const poemRef = doc(db, 'poems', poem.id);

      // Full optimistic update
      setLiked(newLikeStatus);
      setPoem(prev => {
        if (!prev) return null;
        const newLikedBy = newLikeStatus
          ? [...(prev.likedBy || []), currentUser.uid]
          : (prev.likedBy || []).filter(id => id !== currentUser.uid);
        return { ...prev, likes: newLikedBy.length, likedBy: newLikedBy };
      });

      await updateDoc(poemRef, {
        likes: newLikeStatus ? (poem.likedBy?.length || 0) + 1 : Math.max(0, (poem.likedBy?.length || 0) - 1),
        likedBy: newLikeStatus ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid),
      });

      await updatePoemLibrary(poem.id, newLikeStatus, poem.title, poem.poetId);

      // Verify with server ONLY if this is the last pending request
      activeLikeRequests.current--;

      if (activeLikeRequests.current === 0) {
        const updatedpoemDoc = await getDoc(poemRef);
        if (updatedpoemDoc.exists() && activeLikeRequests.current === 0) {
          const serverData = { ...updatedpoemDoc.data(), id: poem.id } as Poem;

          // Double verify server sync: if likes field doesn't match likedBy length, fix it
          if (serverData.likes !== (serverData.likedBy?.length || 0)) {
            await updateDoc(poemRef, { likes: serverData.likedBy?.length || 0 });
            serverData.likes = serverData.likedBy?.length || 0;
          }

          setPoem(serverData);

          // After successful update, invalidate relevant caches to ensure fresh data app-wide
          await invalidateCache(`poem_${poem.id}`);
          await invalidateByPrefix("home_");
          await invalidateByPrefix("browse_");
        }
      }
    } catch (error) {
      console.error('Error updating likes:', error);
      activeLikeRequests.current = Math.max(0, activeLikeRequests.current - 1);
      if (activeLikeRequests.current === 0) {
        setLiked(previousLiked);
        setPoem(previousPoem);
      }
      showToast({ message: 'Failed to update like status', type: 'error' });
    }
  };

  const handleFollowToggle = async () => {
    if (!currentUser) {
      showAlert({
        title: 'Login Required',
        message: 'Please login to follow poets',
        type: 'info'
      });
      return;
    }
    if (!poem?.poetId) return;

    try {
      setIsTogglingFollow(true);

      // Optimistic update to UI
      setIsFollowing(!isFollowing);

      await toggleFollow(poem.poetId, isFollowing);
      // Invalidate profile cache
      await invalidateCache(`profile_user_${poem.poetId}`);

    } catch (error) {
      console.error('Error toggling follow:', error);
      showToast({ message: 'Failed to update follow status', type: 'error' });
      // Revert on error
      setIsFollowing(isFollowing);
    } finally {
      setIsTogglingFollow(false);
    }
  };

  const handleCommentSubmit = async () => {
    if (!newComment.trim() || !currentUser || !poem) return;

    try {
      setSubmittingComment(true);
      const commentRef = await addDoc(collection(db, 'poemComments'), {
        poemId: poem.id,
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userPhoto: currentUser.photoURL || null,
        content: newComment.trim(),
        createdAt: new Date().toISOString(),
        likes: 0,
        likedBy: [],
      });

      if (poem.poetId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: poem.poetId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || "Anonymous User",
          type: "poem_comment",
          poemId: poem.id,
          poemTitle: poem.title,
          commentContent: newComment.trim(),
          createdAt: new Date().toISOString(),
          read: false,
        });

        // Send Push Notification
        await sendPushNotification(
          poem.poetId,
          `${currentUser.displayName || "Someone"} commented on your poem`,
          `"${poem.title}"`,
          { url: `novlnest://poem/${poem.id}` }
        )
      }

      setNewComment('');
      // Invalidate cache to update comment stats
      if (poem) {
        await invalidateCache(`poem_${poem.id}`);
      }
      showToast({ message: 'Comment posted successfully!', type: 'success' });
    } catch (error) {
      console.error('Error submitting comment:', error);
      showToast({ message: 'Failed to post comment', type: 'error' });
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleReplySubmit = async (parentId: string) => {
    if (!replyContent.trim() || !currentUser || !poem) return;

    try {
      setSubmittingReply(true);
      await addDoc(collection(db, 'poemComments'), {
        poemId: poem.id,
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userPhoto: currentUser.photoURL || null,
        content: replyContent.trim(),
        createdAt: new Date().toISOString(),
        likes: 0,
        likedBy: [],
        parentId: parentId,
      });

      const parentCommentDoc = await getDoc(doc(db, 'poemComments', parentId));
      const parentCommentData = parentCommentDoc.exists() ? parentCommentDoc.data() : null;
      const parentCommentAuthorId = parentCommentData?.userId;

      if (poem.poetId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: poem.poetId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || "Anonymous User",
          type: "poem_reply",
          poemId: poem.id,
          poemTitle: poem.title,
          commentContent: replyContent.trim(),
          parentId: parentId,
          createdAt: new Date().toISOString(),
          read: false,
        });

        // Send Push Notification
        await sendPushNotification(
          poem.poetId,
          `${currentUser.displayName || "Someone"} 💬`,
          `Replied to a comment on your poem "${poem.title}"`,
          { url: `novlnest://poem/${poem.id}` }
        )
      }

      if (parentCommentAuthorId && parentCommentAuthorId !== poem.poetId && parentCommentAuthorId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: parentCommentAuthorId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || "Anonymous User",
          type: "comment_reply",
          poemId: poem.id,
          poemTitle: poem.title,
          commentContent: replyContent.trim(),
          parentId: parentId,
          createdAt: new Date().toISOString(),
          read: false,
        });

        // Send Push Notification
        await sendPushNotification(
          parentCommentAuthorId,
          `${currentUser.displayName || "Someone"} 💬`,
          `Replied to your comment in "${poem.title}"`,
          { url: `novlnest://poem/${poem.id}` }
        )
      }

      setReplyContent('');
      setReplyingTo(null);
      // Invalidate cache
      if (poem) {
        await invalidateCache(`poem_${poem.id}`);
      }
      showToast({ message: 'Reply posted successfully!', type: 'success' });
    } catch (error) {
      console.error('Error submitting reply:', error);
      showToast({ message: 'Failed to post reply', type: 'error' });
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!currentUser) return;

    showAlert({
      title: 'Delete Comment',
      message: 'Are you sure you want to delete this comment? This action cannot be undone.',
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingComment(commentId);
              await deleteDoc(doc(db, 'poemComments', commentId));
              // Invalidate cache
              if (poem) {
                await invalidateCache(`poem_${poem.id}`);
              }
              showToast({ message: 'Comment deleted successfully!', type: 'success' });
            } catch (error) {
              console.error('Error deleting comment:', error);
              showToast({ message: 'Failed to delete comment', type: 'error' });
            } finally {
              setDeletingComment(null);
            }
          },
        },
      ]
    });
  };

  const handleCopyComment = async (text: string) => {
    await Clipboard.setStringAsync(text);
    showToast({ message: 'Comment copied to clipboard', type: 'success' });
  };

  const handleEditSubmit = async () => {
    if (!editContent.trim() || !currentUser || !editingCommentId) return;

    try {
      setSubmittingComment(true);
      await updateDoc(doc(db, 'poemComments', editingCommentId), {
        content: editContent.trim(),
        updatedAt: new Date().toISOString(),
      });

      setEditingCommentId(null);
      setEditContent('');
      setShowCommentsModal(false);
      // Invalidate cache
      if (poem) {
        await invalidateCache(`poem_${poem.id}`);
      }
      showToast({ message: 'Comment updated successfully!', type: 'success' });
    } catch (error) {
      console.error('Error updating comment:', error);
      showToast({ message: 'Failed to update comment', type: 'error' });
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCommentLike = async (commentId: string, isLiked: boolean) => {
    if (!currentUser) return;

    // Store previous state for potential reversal
    const previousComments = [...comments];

    // Define a recursive function to update the comment within the tree
    const updateCommentInTree = (list: Comment[]): Comment[] => {
      return list.map((c) => {
        if (c.id === commentId) {
          const newLikedBy = isLiked
            ? (c.likedBy || []).filter((uid) => uid !== currentUser.uid)
            : [...(c.likedBy || []), currentUser.uid];

          return {
            ...c,
            likedBy: newLikedBy,
            likes: newLikedBy.length,
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

    // Apply optimistic update immediately
    setComments((prev) => updateCommentInTree(prev));

    try {
      const commentRef = doc(db, 'poemComments', commentId);

      // Find the comment data from our existing state instead of fetching it again
      const findCommentById = (list: Comment[], id: string): Comment | null => {
        for (const c of list) {
          if (c.id === id) return c;
          if (c.replies) {
            const found = findCommentById(c.replies, id);
            if (found) return found;
          }
        }
        return null;
      };

      const targetComment = findCommentById(previousComments, commentId);
      if (!targetComment) return;

      const commentAuthorId = targetComment.userId;

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
              poemId: poem?.id,
              poemTitle: poem?.title,
              commentId: commentId,
              commentContent: targetComment.content,
              createdAt: new Date().toISOString(),
              read: false,
            });

            // Send Push Notification in the background
            sendPushNotification(
              commentAuthorId,
              `${currentUser.displayName || 'Someone'} ❤️`,
              `Liked your comment on "${poem?.title || 'a poem'}"`,
              { url: `novlnest://poem/${poem?.id}` }
            ).catch(err => console.error("Error sending push notification:", err));
          }
        }
      }
    } catch (error) {
      console.error('Error updating comment like:', error);
      // Revert to previous state if backend update fails
      setComments(previousComments);
      showToast({ message: 'Failed to update like status. Please try again.', type: 'error' });
    }
  };

  const handleShare = async () => {
    try {
      await RNShare.share({
        message: `Check out "${poem?.title}" by ${poem?.poetName} on NovlNest! https://novlnest.com/poem/${poem?.id}`,
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
    return comment.userId === currentUser.uid || (poem && poem.poetId === currentUser.uid);
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
              {comment.userId === poem?.poetId && (
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
                size={24}
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

  return (
    <>
      {loading ? (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#8B5CF6" />
          </View>
        </SafeAreaView>
      ) : error || !poem ? (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={60} color="#EF4444" />
            <Text style={styles.errorText}>{error || 'poem not found'}</Text>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Text style={styles.backButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      ) : (
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.replace('MainTabs');
                }
              }}
              style={styles.headerButton}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
                <Ionicons name="share-outline" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.container}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) }}
          >
            {/* Cover and Info */}
            <View style={styles.coverSection}>
              {poem.coverImage ? (
                <CachedImage
                  uri={getFirebaseDownloadUrl(poem.coverImage)}
                  style={styles.coverImage}
                  contentFit="cover"
                  placeholderColor={colors.backgroundSecondary}
                />
              ) : (
                <View style={styles.placeholderCover}>
                  <Ionicons name="book" size={60} color="#9CA3AF" />
                </View>
              )}
            </View>

            <View style={styles.infoSection}>
              {poem.publicDomain && (
                <ClassicsBadge style={{ marginBottom: 8 }} />
              )}
              <Text style={styles.title}>{poem.title}</Text>
              <View style={styles.authorRow}>
                <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: poem.poetId })}>
                  <Text style={styles.author}>by {poem.poetName}</Text>
                </TouchableOpacity>
                {currentUser && poem.poetId !== currentUser.uid && !poem.publicDomain && (
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

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="eye-outline" size={18} color="#9CA3AF" />
                  <Text style={styles.statText}>Reads</Text>
                  <Text style={styles.statValue}>{poem.views || 0}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Ionicons name="heart-outline" size={18} color="#9CA3AF" />
                  <Text style={styles.statText}>Votes</Text>
                  <Text style={styles.statValue}>{poem.likedBy?.length || 0}</Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.readButton}
                  onPress={() => navigation.navigate('PoemReader', { id: poemId })}
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
                {authorData?.supportLink && !poem.publicDomain && (
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
              {poem.genres && poem.genres.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.genresContainer}>
                  {poem.genres.map((genre, index) => (
                    <View key={index} style={styles.genreTag}>
                      <Text style={styles.genreText}>{genre}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}

              {/* Description */}
              <View style={styles.descriptionContainer}>
                <Text style={styles.sectionTitle}>Description</Text>
                <Text
                  style={styles.description}
                  numberOfLines={isSummaryExpanded ? undefined : 4}
                >
                  {poem.description || 'No description available.'}
                </Text>
                {(poem.description)?.length > 150 && (
                  <TouchableOpacity onPress={() => setIsSummaryExpanded(!isSummaryExpanded)}>
                    <Text style={styles.seeMore}>
                      {isSummaryExpanded ? 'See less' : 'See more'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* More like this */}
              {relatedPoems.length > 0 && (
                <View style={styles.relatedSection}>
                  <Text style={styles.sectionTitle}>
                    {poem?.genres && poem.genres[0] ? `More ${poem.genres[0]} Poems` : 'Recommended For You'}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.relatedScroll}
                  >
                    {relatedPoems.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.relatedCard}
                        onPress={() => {
                          navigation.replace('PoemOverview', { poemId: item.id });
                        }}
                      >
                        {item.coverSmallImage || item.coverImage ? (
                          <CachedImage
                            uri={getFirebaseDownloadUrl(item.coverSmallImage || item.coverImage || '')}
                            style={styles.relatedCover}
                            contentFit="cover"
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
          {showTipModal && authorData?.supportLink && (
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
                    showToast({ message: 'Payment details copied to clipboard!', type: 'success' });
                  }}
                >
                  <Ionicons name="copy-outline" size={20} color="#fff" />
                  <Text style={styles.copyButtonText}>
                    {authorData.supportLink.startsWith('http') ? 'Copy Link' : 'Copy Details'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

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
                  contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) }}
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
                        maxLength={1000}
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
                        setEditingCommentId(selectedCommentForOptions.id);
                        setEditContent(selectedCommentForOptions.content || '');
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
      )}
    </>
  );
};

const getStyles = (themeColors: any, insets: any) => StyleSheet.create({
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
    gap: 8,
    paddingVertical: 14,
    borderRadius: 25,
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
    backgroundColor: themeColors.primary,
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
  },
  finishedText: {
    color: '#fff',
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
  optionsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  optionsSheet: {
    backgroundColor: themeColors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Math.max(insets.bottom, 24),
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

export default PoemOverviewScreen;