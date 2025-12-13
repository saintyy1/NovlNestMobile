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
  Share as RNShare,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Novel } from '../../types/novel';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

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
  const { novelId } = route.params;
  const { currentUser, updateUserLibrary, markNovelAsFinished } = useAuth();
  const { colors } = useTheme();

  const [novel, setNovel] = useState<Novel | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [error, setError] = useState('');
  const [liked, setLiked] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [authorData, setAuthorData] = useState<AuthorData | null>(null);

  // Comment states
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);

  // Modal states
  const [showShareModal, setShowShareModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);

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
      if (!novelId) return;
      try {
        setLoading(true);
        const novelDocRef = doc(db, 'novels', novelId);
        const novelDoc = await getDoc(novelDocRef);

        if (novelDoc.exists()) {
          const novelData = { id: novelDoc.id, ...novelDoc.data() } as Novel;
          setNovel(novelData);

          if (currentUser) {
            setLiked(novelData.likedBy?.includes(currentUser.uid) || false);
            setIsFinished(currentUser.finishedReads?.includes(novelDoc.id) || false);

            // Increment view count (24 hour cooldown)
            const viewKey = `novel_view_${novelId}_${currentUser.uid}`;
            const lastView = await AsyncStorage.getItem(viewKey);
            const now = Date.now();
            const twentyFourHours = 24 * 60 * 60 * 1000;

            if (!lastView || now - Number(lastView) > twentyFourHours) {
              await updateDoc(novelDocRef, { views: increment(1) });
              await AsyncStorage.setItem(viewKey, now.toString());
              setNovel(prev => prev ? { ...prev, views: (prev.views || 0) + 1 } : null);
            }
          }
        } else {
          setError('Novel not found');
        }
      } catch (error) {
        console.error('Error fetching novel:', error);
        setError('Failed to load novel');
      } finally {
        setLoading(false);
      }
    };

    fetchNovel();
  }, [novelId, currentUser]);

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
      setCommentsLoading(false);
    });

    return () => unsubscribe();
  }, [novelId, buildCommentTree]);

  const handleLike = async () => {
    if (!novel?.id || !currentUser) {
      Alert.alert('Error', 'Please login to like novels');
      return;
    }

    try {
      const novelRef = doc(db, 'novels', novel.id);
      const newLikeStatus = !liked;
      setLiked(newLikeStatus);

      await updateDoc(novelRef, {
        likes: increment(newLikeStatus ? 1 : -1),
        likedBy: newLikeStatus ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid),
      });

      await updateUserLibrary(novel.id, newLikeStatus, novel.title, novel.authorId);

      const updatedNovelDoc = await getDoc(novelRef);
      if (updatedNovelDoc.exists()) {
        setNovel({ ...updatedNovelDoc.data(), id: novel.id } as Novel);
      }
    } catch (error) {
      console.error('Error updating likes:', error);
      setLiked(!liked);
      Alert.alert('Error', 'Failed to update like status');
    }
  };

  const handleMarkAsFinished = async () => {
    if (!novel?.id || !currentUser) {
      Alert.alert('Error', 'Unable to mark as finished');
      return;
    }

    try {
      const currentlyFinished = currentUser.finishedReads?.includes(novel.id) || false;
      await markNovelAsFinished(novel.id, novel.title, novel.authorId);
      setIsFinished(!currentlyFinished);
      Alert.alert('Success', !currentlyFinished ? 'Novel marked as finished!' : 'Novel unmarked as finished.');
    } catch (error) {
      console.error('Error marking novel as finished:', error);
      Alert.alert('Error', 'Failed to update finished status');
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
          fromUserName: currentUser.displayName || 'Anonymous User',
          type: 'novel_comment',
          novelId: novel.id,
          novelTitle: novel.title,
          commentContent: newComment.trim(),
          createdAt: new Date().toISOString(),
          read: false,
        });
      }

      setNewComment('');
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
          fromUserName: currentUser.displayName || 'Anonymous User',
          type: 'novel_reply',
          novelId: novel.id,
          novelTitle: novel.title,
          commentContent: replyContent.trim(),
          parentId: parentId,
          createdAt: new Date().toISOString(),
          read: false,
        });
      }

      if (parentCommentAuthorId && parentCommentAuthorId !== novel.authorId && parentCommentAuthorId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: parentCommentAuthorId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || 'Anonymous User',
          type: 'comment_reply',
          novelId: novel.id,
          novelTitle: novel.title,
          commentContent: replyContent.trim(),
          parentId: parentId,
          createdAt: new Date().toISOString(),
          read: false,
        });
      }

      setReplyContent('');
      setReplyingTo(null);
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

  const renderComment = (comment: Comment, isReply: boolean = false) => (
    <View key={comment.id} style={[styles.commentItem, isReply && styles.replyItem]}>
      <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: comment.userId })}>
        {comment.userPhoto ? (
          <Image source={{ uri: comment.userPhoto }} style={styles.commentAvatar} />
        ) : (
          <View style={styles.commentAvatarPlaceholder}>
            <Text style={styles.commentAvatarText}>{getUserInitials(comment.userName)}</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.commentContent}>
        <View style={styles.commentHeader}>
          <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: comment.userId })}>
            <Text style={styles.commentUserName}>{comment.userName}</Text>
          </TouchableOpacity>
          <Text style={styles.commentDate}>{formatDate(comment.createdAt)}</Text>
          {comment.userId === novel?.authorId && (
            <View style={styles.authorBadge}>
              <Text style={styles.authorBadgeText}>Author</Text>
            </View>
          )}
        </View>

        <Text style={styles.commentText}>{comment.content}</Text>

        <View style={styles.commentActions}>
          <TouchableOpacity
            onPress={() => handleCommentLike(comment.id, comment.likedBy?.includes(currentUser?.uid || ''))}
            disabled={!currentUser}
            style={styles.commentAction}
          >
            <Ionicons
              name={comment.likedBy?.includes(currentUser?.uid || '') ? 'heart' : 'heart-outline'}
              size={16}
              color={comment.likedBy?.includes(currentUser?.uid || '') ? '#EF4444' : '#9CA3AF'}
            />
            <Text style={styles.commentActionText}>{comment.likes || 0}</Text>
          </TouchableOpacity>

          {currentUser && (
            <TouchableOpacity
              onPress={() => {
                setReplyingTo(replyingTo === comment.id ? null : comment.id);
                setReplyContent('');
              }}
              style={styles.commentAction}
            >
              <Ionicons name="return-down-forward-outline" size={16} color="#9CA3AF" />
              <Text style={styles.commentActionText}>Reply</Text>
            </TouchableOpacity>
          )}

          {canDeleteComment(comment) && (
            <TouchableOpacity
              onPress={() => handleDeleteComment(comment.id)}
              disabled={deletingComment === comment.id}
              style={styles.commentAction}
            >
              <Ionicons name="trash-outline" size={16} color="#9CA3AF" />
              <Text style={styles.commentActionText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>

        {replyingTo === comment.id && (
          <View style={styles.replyInputContainer}>
            <TextInput
              value={replyContent}
              onChangeText={setReplyContent}
              placeholder={`Reply to ${comment.userName}...`}
              placeholderTextColor="#9CA3AF"
              style={styles.replyInput}
              multiline
            />
            <View style={styles.replyActions}>
              <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyCancel}>
                <Text style={styles.replyCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleReplySubmit(comment.id)}
                disabled={!replyContent.trim() || submittingReply}
                style={styles.replySubmit}
              >
                <Text style={styles.replySubmitText}>{submittingReply ? 'Posting...' : 'Reply'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <View style={styles.repliesContainer}>
            {comment.replies.map((reply) => renderComment(reply, true))}
          </View>
        )}
      </View>
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
  const totalParts = (novel.authorsNote ? 1 : 0) + (novel.prologue ? 1 : 0) + (novel.chapters?.length || 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
            <Ionicons name="share-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Cover and Info */}
        <View style={styles.coverSection}>
          {novel.coverImage ? (
            <Image
              source={{ uri: getFirebaseDownloadUrl(novel.coverImage) }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholderCover}>
              <Ionicons name="book" size={60} color="#9CA3AF" />
            </View>
          )}
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.title}>{novel.title}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: novel.authorId })}>
            <Text style={styles.author}>by {novel.authorName}</Text>
          </TouchableOpacity>

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
              <Text style={styles.statValue}>{novel.likes || 0}</Text>
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
              onPress={() => navigation.navigate('NovelReader', {novelId: novel.id,chapterNumber: 0})}
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
            {currentUser && (
              <TouchableOpacity
                style={[styles.secondaryButton, isFinished && styles.finishedButton]}
                onPress={handleMarkAsFinished}
              >
                <Ionicons
                  name={isFinished ? 'checkmark-circle' : 'book-outline'}
                  size={18}
                  color={isFinished ? '#000000' : '#fff'}
                />
                <Text style={[styles.secondaryButtonText, isFinished && styles.finishedText]}>
                  {isFinished ? 'Finished' : 'Mark as Finished'}
                </Text>
              </TouchableOpacity>
            )}

            {authorData?.supportLink && (
              <TouchableOpacity
                style={styles.giftButton}
                onPress={() => setShowTipModal(true)}
              >
                <Ionicons name="gift-outline" size={18} />
                <Text style={styles.giftButtonText}>Gift</Text>
              </TouchableOpacity>
            )}

            {isAuthor && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('AddChapters', { novelId: novel.id })}
              >
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={styles.secondaryButtonText}>Add Chapters</Text>
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
                            text: 'Read Chapter',
                            onPress: () =>
                              navigation.navigate('NovelReader', {
                                novelId: novel.id,
                                chapterNumber: chapterNumber,
                              }),
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
          </View>

          {/* Comments Section */}
          <View style={styles.commentsSection}>
            <Text style={styles.sectionTitle}>
              Comments ({comments.reduce((total, comment) => total + 1 + (comment.replies?.length || 0), 0)})
            </Text>

            {currentUser ? (
              <View style={styles.commentForm}>
                <TextInput
                  value={newComment}
                  onChangeText={setNewComment}
                  placeholder="Share your thoughts about this novel..."
                  placeholderTextColor="#9CA3AF"
                  style={styles.commentInput}
                  multiline
                />
                <TouchableOpacity
                  onPress={handleCommentSubmit}
                  disabled={!newComment.trim() || submittingComment}
                  style={styles.commentSubmit}
                >
                  <Text style={styles.commentSubmitText}>
                    {submittingComment ? 'Posting...' : 'Post Comment'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.loginPrompt}>
                <Text style={styles.loginPromptText}>Sign in to leave a comment</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                  <Text style={styles.loginPromptLink}>Sign In →</Text>
                </TouchableOpacity>
              </View>
            )}

            {commentsLoading ? (
              <ActivityIndicator size="small" color="#8B5CF6" style={{ marginTop: 20 }} />
            ) : comments.length === 0 ? (
              <View style={styles.emptyComments}>
                <Ionicons name="chatbubbles-outline" size={48} color="#9CA3AF" />
                <Text style={styles.emptyCommentsText}>No comments yet</Text>
                <Text style={styles.emptyCommentsSubtext}>Be the first to share your thoughts!</Text>
              </View>
            ) : (
              <View style={styles.commentsList}>
                {comments.map((comment) => renderComment(comment))}
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
      )}
    </SafeAreaView>
  );
};

const getStyles = (themeColors : any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#111827',
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
    color: '#fff',
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#8B5CF6',
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
    backgroundColor: '#1F2937',
  },
  coverImage: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.9,
    borderRadius: 12,
  },
  placeholderCover: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.9,
    backgroundColor: '#374151',
    borderRadius: 12,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  infoSection: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  author: {
    fontSize: 16,
    color: '#8B5CF6',
    marginBottom: 20,
    textAlign: 'center' as const,
  },
  statsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    alignItems: 'center' as const,
    paddingVertical: 16,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center' as const,
    flex: 1,
  },
  statText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#374151',
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
    backgroundColor: '#000',
    paddingVertical: 14,
    borderRadius: 25,
    gap: 8,
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
    backgroundColor: '#000',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
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
    backgroundColor: '#1F2937',
    borderRadius: 20,
    gap: 6,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  finishedButton: {
    backgroundColor: '#10B981',
  },
  finishedText: {
    color: '#fff',
  },
  giftButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#10B981',
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
    backgroundColor: '#1F2937',
    borderRadius: 20,
    marginRight: 8,
  },
  genreText: {
    color: '#D1D5DB',
    fontSize: 14,
  },
  descriptionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#fff',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: '#D1D5DB',
    lineHeight: 22,
  },
  seeMore: {
    color: '#8B5CF6',
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
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  chapterItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    marginBottom: 8,
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
    color: '#8B5CF6',
    width: 30,
  },
  chapterTitle: {
    fontSize: 15,
    color: '#fff',
    flex: 1,
  },
  commentsSection: {
    marginBottom: 40,
  },
  commentForm: {
    marginBottom: 20,
  },
  commentInput: {
    backgroundColor: '#1F2937',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    minHeight: 80,
  },
  commentSubmit: {
    backgroundColor: '#8B5CF6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  commentSubmitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  loginPrompt: {
    padding: 16,
    backgroundColor: '#1F2937',
    borderRadius: 8,
    marginBottom: 20,
  },
  loginPromptText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 8,
  },
  loginPromptLink: {
    color: '#8B5CF6',
    fontSize: 14,
  },
  emptyComments: {
    alignItems: 'center' as const,
    paddingVertical: 40,
  },
  emptyCommentsText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 12,
  },
  emptyCommentsSubtext: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
  commentsList: {
    marginTop: 16,
  },
  commentItem: {
    flexDirection: 'row' as const,
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#1F2937',
    borderRadius: 8,
  },
  replyItem: {
    marginTop: 8,
    backgroundColor: '#374151',
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
    backgroundColor: '#8B5CF6',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: 12,
  },
  commentAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold' as const,
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 4,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  commentUserName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  commentDate: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  authorBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#8B5CF6',
    borderRadius: 4,
  },
  authorBadgeText: {
    color: '#fff',
    fontSize: 10,
  },
  commentText: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  commentActions: {
    flexDirection: 'row' as const,
    gap: 16,
  },
  commentAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  commentActionText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  replyInputContainer: {
    marginTop: 12,
  },
  replyInput: {
    backgroundColor: '#374151',
    color: '#fff',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
    minHeight: 60,
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
    color: '#9CA3AF',
    fontSize: 12,
  },
  replySubmit: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#8B5CF6',
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
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
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
    color: '#fff',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center' as const,
  },
  tipInfo: {
    backgroundColor: '#374151',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  tipRow: {
    marginBottom: 12,
  },
  tipLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  tipValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500' as const,
  },
  copyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#10B981',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },
});

export default NovelOverviewScreen;