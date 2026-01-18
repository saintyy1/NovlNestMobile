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
  KeyboardAvoidingView,
  Platform,
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
import { Poem } from '../../types/poem';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { trackPoemView, trackContentInteraction } from '../../utils/Analytics-utils';

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
  const { poemId } = route.params;
  const { currentUser, updatePoemLibrary } = useAuth();
  const { colors } = useTheme();
  
  const [poem, setPoem] = useState<Poem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [error, setError] = useState('');
  const [liked, setLiked] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [authorData, setAuthorData] = useState<AuthorData | null>(null);
  
  // Comment states
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyingToUser, setReplyingToUser] = useState<string>('');
  const [replyContent, setReplyContent] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const commentRefs = useRef<Record<string, View | null>>({});
  const replyInputRef = useRef<TextInput>(null);
  
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

  // Fetch poem data
  useEffect(() => {
    const fetchpoem = async () => {
      if (!poemId) return;
      try {
        setLoading(true);
        const poemDocRef = doc(db, 'poems', poemId);
        const poemDoc = await getDoc(poemDocRef);
        
        if (poemDoc.exists()) {
          const poemData = { id: poemDoc.id, ...poemDoc.data() } as Poem;
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
            setLiked(poemData.likedBy?.includes(currentUser.uid) || false);
            
            // Increment view count only once per user
            const viewKey = `poem_view_${poemId}_${currentUser.uid}`;
            const hasViewed = await AsyncStorage.getItem(viewKey);
            
            if (!hasViewed) {
              await updateDoc(poemDocRef, { views: increment(1) });
              await AsyncStorage.setItem(viewKey, 'true');
              setPoem(prev => prev ? { ...prev, views: (prev.views || 0) + 1 } : null);
            }
          }
        } else {
          setError('poem not found');
        }
      } catch (error) {
        console.error('Error fetching poem:', error);
        setError('Failed to load poem');
      } finally {
        setLoading(false);
      }
    };

    fetchpoem();
  }, [poemId, currentUser]);

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
  }, [poemId, buildCommentTree]);

  const handleLike = async () => {
    if (!poem?.id || !currentUser) {
      Alert.alert('Error', 'Please login to like poems');
      return;
    }

    try {
      const poemRef = doc(db, 'poems', poem.id);
      const newLikeStatus = !liked;
      setLiked(newLikeStatus);

      await updateDoc(poemRef, {
        likes: increment(newLikeStatus ? 1 : -1),
        likedBy: newLikeStatus ? arrayUnion(currentUser.uid) : arrayRemove(currentUser.uid),
      });

      await updatePoemLibrary(poem.id, newLikeStatus, poem.title, poem.poetId);

      const updatedpoemDoc = await getDoc(poemRef);
      if (updatedpoemDoc.exists()) {
        setPoem({ ...updatedpoemDoc.data(), id: poem.id } as Poem);
      }
    } catch (error) {
      console.error('Error updating likes:', error);
      setLiked(!liked);
      Alert.alert('Error', 'Failed to update like status');
    }
  };

  const handleCommentSubmit = async () => {
    if (!newComment.trim() || !currentUser || !poem) return;

    try {
      setSubmittingComment(true);
      const commentRef = await addDoc(collection(db, 'comments'), {
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
          fromUserName: currentUser.displayName || 'Anonymous User',
          type: 'poem_comment',
          poemId: poem.id,
          poemTitle: poem.title,
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
    if (!replyContent.trim() || !currentUser || !poem) return;

    try {
      setSubmittingReply(true);
      await addDoc(collection(db, 'comments'), {
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

      const parentCommentDoc = await getDoc(doc(db, 'comments', parentId));
      const parentCommentData = parentCommentDoc.exists() ? parentCommentDoc.data() : null;
      const parentCommentAuthorId = parentCommentData?.userId;

      if (poem.poetId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: poem.poetId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || 'Anonymous User',
          type: 'poem_reply',
          poemId: poem.id,
          poemTitle: poem.title,
          commentContent: replyContent.trim(),
          parentId: parentId,
          createdAt: new Date().toISOString(),
          read: false,
        });
      }

      if (parentCommentAuthorId && parentCommentAuthorId !== poem.poetId && parentCommentAuthorId !== currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
          toUserId: parentCommentAuthorId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || 'Anonymous User',
          type: 'comment_reply',
          poemId: poem.id,
          poemTitle: poem.title,
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
              poemId: poem?.id,
              poemTitle: poem?.title,
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

  const renderComment = (comment: Comment, isReply: boolean = false) => (
    <View 
      key={comment.id} 
      style={isReply ? styles.replyItem : styles.commentItem}
      ref={(ref) => { commentRefs.current[comment.id] = ref; }}
    >
      <View style={styles.commentContainer}>
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
            {isReply && comment.parentId ? (
              <View style={styles.replyHeader}>
                <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: comment.userId })}>
                  <Text style={styles.commentUserName}>{comment.userName}</Text>
                </TouchableOpacity>
                <Text style={styles.replyArrow}> {'>'} </Text>
                {(() => {
                  const parent = getParentCommentData(comment.parentId);
                  return parent ? (
                    <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: parent.userId })}>
                      <Text style={styles.commentUserName}>{parent.userName}</Text>
                    </TouchableOpacity>
                  ) : null;
                })()}
              </View>
            ) : (
              <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: comment.userId })}>
                <Text style={styles.commentUserName}>{comment.userName}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.commentDate}>{formatDate(comment.createdAt)}</Text>
            {comment.userId === poem?.poetId && (
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
                  setReplyingTo(comment.id);
                  setReplyingToUser(comment.userName);
                  setReplyContent('');
                  setShowReplyModal(true);
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
              {poem.coverImage ? (
                <Image
                  source={{ uri: getFirebaseDownloadUrl(poem.coverImage) }}
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
              <Text style={styles.title}>{poem.title}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: poem.poetId })}>
                <Text style={styles.author}>by {poem.poetName}</Text>
              </TouchableOpacity>

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
                  <Text style={styles.statValue}>{poem.likes || 0}</Text>
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
                {authorData?.supportLink && (
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

              {/* Comments Section */}
              <View style={styles.commentsSection}>
                <Text style={styles.sectionTitle}>
                  Comments ({comments.length})
                </Text>

                {currentUser ? (
                  <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
                  >
                    <View style={styles.commentForm}>
                      <TextInput
                        value={newComment}
                        onChangeText={setNewComment}
                        placeholder="Share your thoughts about this poem..."
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
                  </KeyboardAvoidingView>
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
                  <>
                    <View style={styles.commentsHeader}>
                      <Text style={styles.commentsCount}>{comments.length} {comments.length === 1 ? 'Comment' : 'Comments'}</Text>
                      <View style={styles.scrollHint}>
                        <Ionicons name="arrow-down" size={14} color={colors.textSecondary} />
                        <Text style={styles.scrollHintText}>Scroll to see more</Text>
                      </View>
                    </View>
                    <ScrollView 
                      style={styles.commentsList}
                      nestedScrollEnabled={true}
                      showsVerticalScrollIndicator={true}
                      persistentScrollbar={true}
                    >
                      {comments.map((comment) => renderComment(comment))}
                    </ScrollView>
                  </>
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

          {showReplyModal && (
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.replyModalContainer}
              >
                <View style={styles.modalContent}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowReplyModal(false);
                      setReplyingTo(null);
                      setReplyContent('');
                    }}
                    style={{ alignSelf: 'flex-end', padding: 8 }}
                  >
                    <Ionicons name="close" size={28} color={colors.text} />
                  </TouchableOpacity>

                  <View style={styles.modalHeader}>
                    <Ionicons name="chatbubble-outline" size={24} color={colors.primary} />
                    <Text style={[styles.modalTitle, { color: colors.text }]}>
                      Reply to {replyingToUser}
                    </Text>
                  </View>

                  <TextInput
                    value={replyContent}
                    onChangeText={setReplyContent}
                    placeholder="Write your reply..."
                    placeholderTextColor="#9CA3AF"
                    style={[styles.replyModalInput, {
                      backgroundColor: colors.surface,
                      color: colors.text,
                      borderColor: colors.border,
                    }]}
                    multiline
                    numberOfLines={6}
                    autoFocus
                  />

                  <TouchableOpacity
                    onPress={() => {
                      if (replyingTo) {
                        handleReplySubmit(replyingTo);
                      }
                      setShowReplyModal(false);
                    }}
                    disabled={!replyContent.trim() || submittingReply || !replyingTo}
                    style={[
                      styles.replyModalSubmit,
                      (!replyContent.trim() || submittingReply) && styles.replyModalSubmitDisabled
                    ]}
                  >
                    <Text style={styles.replyModalSubmitText}>
                      {submittingReply ? 'Posting...' : 'Post Reply'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </View>
          )}
        </SafeAreaView>
      )}
    </>
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
    fontWeight: 'bold' as const,
    color: themeColors.text,
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  author: {
    fontSize: 16,
    color: themeColors.primary,
    marginBottom: 20,
    textAlign: 'center' as const,
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
  commentForm: {
    marginBottom: 20,
  },
  commentInput: {
    backgroundColor: themeColors.card,
    color: themeColors.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    minHeight: 80,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  commentSubmit: {
    backgroundColor: themeColors.primary,
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
  loadMoreButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 16,
    marginTop: 16,
    backgroundColor: themeColors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.primary,
  },
  loadMoreText: {
    color: themeColors.primary,
    fontSize: 14,
    fontWeight: '600' as const,
    marginRight: 8,
  },
  endOfComments: {
    alignItems: 'center' as const,
    paddingVertical: 20,
    marginTop: 16,
  },
  endOfCommentsText: {
    color: themeColors.textSecondary,
    fontSize: 12,
    fontStyle: 'italic' as const,
  },
  showMoreReplies: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
    marginLeft: 48,
  },
  showMoreRepliesText: {
    color: themeColors.primary,
    fontSize: 13,
    marginRight: 4,
  },
  commentsList: {
    marginTop: 16,
    maxHeight: 500,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
    borderRadius: 8,
    padding: 8,
  },
  commentsHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  commentsCount: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: themeColors.text,
  },
  scrollHint: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  scrollHintText: {
    fontSize: 12,
    color: themeColors.textSecondary,
    fontStyle: 'italic' as const,
  },
  commentItem: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: themeColors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
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
    color: themeColors.textSecondary,
    fontSize: 12,
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
  replyModalContainer: {
    width: '100%',
    maxWidth: 500,
  },
  replyModalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 120,
    maxHeight: 200,
    textAlignVertical: 'top' as const,
    marginBottom: 16,
  },
  replyModalSubmit: {
    backgroundColor: themeColors.primary,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  replyModalSubmitDisabled: {
    opacity: 0.5,
  },
  replyModalSubmitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});

export default PoemOverviewScreen;