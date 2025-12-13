import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
  Image,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Comment {
  id: string;
  text: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  createdAt: string;
  parentId?: string;
  replies?: Comment[];
  likes?: number;
  likedBy?: string[];
}

const NovelReaderScreen = ({ route, navigation }: any) => {
  const { novelId, chapterNumber } = route.params;
  const { currentUser } = useAuth();

  const [novel, setNovel] = useState<Novel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentChapter, setCurrentChapter] = useState(chapterNumber || 0);
  const [showComments, setShowComments] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [chapterLiked, setChapterLiked] = useState(false);
  const [chapterLikes, setChapterLikes] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const scrollOffsetRef = useRef(0);

  // Content state
  const [pages, setPages] = useState<string[]>([]);
  const [isProcessingContent, setIsProcessingContent] = useState(false);
  const [shouldScrollToEnd, setShouldScrollToEnd] = useState(false);

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

    return { type: 'none', chapterIndex: -1, content: '', title: '' };
  }, [novel]);

  const currentContentInfo = useMemo(() => getContentInfo(currentChapter), [currentChapter, novel, getContentInfo]);

  const getTotalReadingOrderItems = useCallback(() => {
    if (!novel) return 0;
    let count = 0;
    if (novel.authorsNote) count++;
    if (novel.prologue) count++;
    count += novel.chapters.length;
    return count;
  }, [novel]);

  // Split content into pages based on character count (approximate)
  useEffect(() => {
    if (!currentContentInfo.content) {
      setPages([]);
      return;
    }

    setIsProcessingContent(true);

    // Calculate approximate characters per page
    const LINE_HEIGHT = 28;
    const CHAR_PER_LINE = 50; // Approximate
    const HEADER_HEIGHT = 100;
    const FOOTER_HEIGHT = 50;
    const PADDING = 80;
    
    const availableHeight = SCREEN_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT - PADDING;
    const linesPerPage = Math.floor(availableHeight / LINE_HEIGHT);
    const charsPerPage = linesPerPage * CHAR_PER_LINE;

    const fullText = currentContentInfo.content;
    const pageArray: string[] = [];
    
    let remainingText = fullText;
    
    while (remainingText.length > 0) {
      if (remainingText.length <= charsPerPage) {
        pageArray.push(remainingText);
        break;
      }

      // Find a good break point (end of sentence, paragraph, or word)
      let breakPoint = charsPerPage;
      const chunk = remainingText.substring(0, charsPerPage + 200); // Look ahead a bit
      
      // Try to break at paragraph
      const lastParagraph = chunk.lastIndexOf('\n\n');
      if (lastParagraph > charsPerPage * 0.7) {
        breakPoint = lastParagraph + 2;
      } else {
        // Try to break at sentence
        const sentenceEnds = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
        let bestBreak = -1;
        
        for (const ending of sentenceEnds) {
          const pos = chunk.lastIndexOf(ending, charsPerPage + 100);
          if (pos > charsPerPage * 0.7 && pos > bestBreak) {
            bestBreak = pos + ending.length;
          }
        }
        
        if (bestBreak > 0) {
          breakPoint = bestBreak;
        } else {
          // Break at word
          const lastSpace = chunk.lastIndexOf(' ', charsPerPage);
          if (lastSpace > charsPerPage * 0.8) {
            breakPoint = lastSpace + 1;
          }
        }
      }

      pageArray.push(remainingText.substring(0, breakPoint).trim());
      remainingText = remainingText.substring(breakPoint).trim();
    }

    setPages(pageArray.length > 0 ? pageArray : ['No content']);
    setIsProcessingContent(false);
    setCurrentPageIndex(0);
    
    // Reset scroll position
    setTimeout(() => {
      if (shouldScrollToEnd && pageArray.length > 0) {
        // Scroll to last page
        flatListRef.current?.scrollToIndex({ 
          index: pageArray.length - 1, 
          animated: false 
        });
        setCurrentPageIndex(pageArray.length - 1);
        setShouldScrollToEnd(false);
      } else {
        // Scroll to first page
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
    }, 100);
  }, [currentContentInfo.content, shouldScrollToEnd]);

  // Handle scroll end - detect boundary swipes
  const handleMomentumScrollEnd = useCallback((event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    
    setCurrentPageIndex(index);
    scrollOffsetRef.current = offsetX;
  }, []);

  // Handle scroll begin to detect direction
  const handleScrollBeginDrag = useCallback((event: any) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.x;
  }, []);

  // Handle scroll end drag to detect boundary attempts
  const handleScrollEndDrag = useCallback((event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const velocity = event.nativeEvent.velocity?.x || 0;
    
    // Swiping right at the beginning (trying to go to previous chapter's last page)
    if (offsetX < SCREEN_WIDTH * 0.1 && velocity > 1 && currentChapter > 0) {
      setShouldScrollToEnd(true);
      setCurrentChapter(currentChapter - 1);
    }
    
    // Swiping left at the end (trying to go to next chapter's first page)
    if (offsetX > (pages.length - 1) * SCREEN_WIDTH - SCREEN_WIDTH * 0.1 && velocity < -1 && currentChapter < getTotalReadingOrderItems() - 1) {
      setShouldScrollToEnd(false);
      setCurrentChapter(currentChapter + 1);
    }
  }, [currentChapter, pages.length, getTotalReadingOrderItems]);

  useEffect(() => {
    const fetchNovel = async () => {
      if (!novelId) return;

      try {
        setLoading(true);
        const novelDoc = await getDoc(doc(db, 'novels', novelId));

        if (novelDoc.exists()) {
          const novelData = { id: novelDoc.id, ...novelDoc.data() } as Novel;
          setNovel(novelData);

          if (currentUser) {
            await updateDoc(doc(db, 'novels', novelId), {
              views: increment(1),
            });
          }
        } else {
          setError('Novel not found');
        }
      } catch (err) {
        console.error('Error fetching novel:', err);
        setError('Failed to load novel');
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
        const chapterRef = doc(db, 'novels', novel.id, 'chapters', currentChapter.toString());
        const chapterDoc = await getDoc(chapterRef);

        if (chapterDoc.exists()) {
          const chapterData = chapterDoc.data();
          setChapterLiked(currentUser ? chapterData.chapterLikedBy?.includes(currentUser.uid) || false : false);
          setChapterLikes(chapterData.chapterLikes || 0);

          const allComments = chapterData.comments || [];
          const organizedComments = organizeComments(allComments);
          setComments(organizedComments);
        } else {
          setChapterLiked(false);
          setChapterLikes(0);
          setComments([]);
        }
      } catch (error) {
        console.error('Error fetching chapter data:', error);
      }
    };

    fetchChapterData();
  }, [novel, currentChapter, currentUser]);

  const organizeComments = useCallback((allComments: Comment[]): Comment[] => {
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
  }, []);

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
      }
    } catch (error) {
      console.error('Error updating chapter like:', error);
      setChapterLiked(!chapterLiked);
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
        text: newComment.trim(),
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userPhoto: currentUser.photoURL || undefined,
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
      }

      const organizedComments = organizeComments(updatedComments);
      setComments(organizedComments);
      setNewComment('');
      Alert.alert('Success', 'Comment posted!');
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
        text: replyContent.trim(),
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Anonymous',
        userPhoto: currentUser.photoURL || undefined,
        createdAt: new Date().toISOString(),
        parentId: parentId,
        likes: 0,
        likedBy: [],
      };

      const updatedComments = [...existingComments, reply];
      await updateDoc(chapterRef, {
        comments: updatedComments,
      });

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
      }

      const organizedComments = organizeComments(updatedComments);
      setComments(organizedComments);
      setReplyContent('');
      setReplyingTo(null);
      Alert.alert('Success', 'Reply posted!');
    } catch (error) {
      console.error('Error adding reply:', error);
      Alert.alert('Error', 'Failed to post reply');
    } finally {
      setSubmittingReply(null);
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
      const updatedComments = existingComments.map((comment: Comment) => {
        if (comment.id === commentId) {
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
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
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
          <Text style={styles.commentUserName}>{comment.userName}</Text>
          <Text style={styles.commentDate}>{formatDate(comment.createdAt)}</Text>
          {comment.userId === novel?.authorId && (
            <View style={styles.authorBadge}>
              <Text style={styles.authorBadgeText}>Author</Text>
            </View>
          )}
        </View>

        <Text style={styles.commentText}>{comment.text}</Text>

        <View style={styles.commentActions}>
          <TouchableOpacity
            onPress={() => handleCommentLike(comment.id, comment.likedBy?.includes(currentUser?.uid || '') || false)}
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
            <TouchableOpacity onPress={() => setReplyingTo(comment.id)} style={styles.commentAction}>
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
                onPress={() => handleAddReply(comment.id)}
                disabled={!replyContent.trim() || submittingReply === comment.id}
                style={styles.replySubmit}
              >
                <Text style={styles.replySubmitText}>{submittingReply === comment.id ? 'Posting...' : 'Reply'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <View style={styles.repliesContainer}>{comment.replies.map((reply) => renderComment(reply, true))}</View>
        )}
      </View>
    </View>
  );

  const renderPage = ({ item, index }: { item: string; index: number }) => {
    const isFirstPage = index === 0;

    return (
      <View style={styles.pageContainer}>
        <TouchableWithoutFeedback onPress={() => setMenuVisible(!menuVisible)}>
          <View style={styles.pageContent}>
            {isFirstPage && (
              <View style={styles.pageHeader}>
                <Text style={styles.chapterTitle}>{currentContentInfo.title}</Text>
                <Text style={styles.authorName}>by {novel?.authorName}</Text>
              </View>
            )}

            <ScrollView
              style={styles.textContainer}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
            >
              <Text style={styles.pageText}>{item}</Text>
            </ScrollView>

            <View style={styles.pageFooter}>
              <Text style={styles.pageNumber}>
                {index + 1} / {pages.length}
              </Text>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </View>
    );
  };

  if (loading || isProcessingContent) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading chapter...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !novel) {
    return (
      <SafeAreaView style={styles.safeArea}>
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

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      <FlatList
        ref={flatListRef}
        data={pages}
        renderItem={renderPage}
        keyExtractor={(item, index) => `page-${currentChapter}-${index}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        getItemLayout={(data, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        extraData={currentChapter}
      />

      {menuVisible && (
        <View style={styles.menuOverlay}>
          <TouchableOpacity style={styles.menuButton} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.floatingActions}>
        <TouchableOpacity style={styles.actionButton} onPress={handleChapterLike}>
          <Ionicons name={chapterLiked ? 'heart' : 'heart-outline'} size={24} color={chapterLiked ? '#EF4444' : '#fff'} />
          <Text style={styles.actionButtonText}>{chapterLikes}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-outline" size={24} color="#fff" />
          <Text style={styles.actionButtonText}>
            {comments.reduce((total, c) => total + 1 + (c.replies?.length || 0), 0)}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showComments} animationType="slide" onRequestClose={() => setShowComments(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Comments ({comments.reduce((total, c) => total + 1 + (c.replies?.length || 0), 0)})
            </Text>
            <TouchableOpacity onPress={() => setShowComments(false)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView style={styles.commentsList} showsVerticalScrollIndicator={false}>
              {comments.length === 0 ? (
                <View style={styles.emptyComments}>
                  <Ionicons name="chatbubbles-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.emptyCommentsText}>No comments yet</Text>
                  <Text style={styles.emptyCommentsSubtext}>Be the first to comment!</Text>
                </View>
              ) : (
                comments.map((comment) => renderComment(comment))
              )}
            </ScrollView>

            {currentUser && (
              <View style={styles.commentForm}>
                <TextInput
                  value={newComment}
                  onChangeText={setNewComment}
                  placeholder="Write a comment..."
                  placeholderTextColor="#9CA3AF"
                  style={styles.commentInput}
                  multiline
                />
                <TouchableOpacity
                  onPress={handleAddComment}
                  disabled={!newComment.trim() || submittingComment}
                  style={styles.commentSubmit}
                >
                  <Text style={styles.commentSubmitText}>{submittingComment ? 'Posting...' : 'Post'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#fff',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
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
    fontWeight: '600',
  },
  pageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  pageContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
    justifyContent: 'space-between',
  },
  pageHeader: {
    marginBottom: 24,
  },
  chapterTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  authorName: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  textContainer: {
    flex: 1,
  },
  pageText: {
    fontSize: 17,
    lineHeight: 28,
    color: '#E5E5E5',
    textAlign: 'justify',
    letterSpacing: 0.3,
  },
  pageFooter: {
    paddingTop: 16,
  },
  pageNumber: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
  menuButton: {
    alignSelf: 'flex-end',
    padding: 12,
  },
  floatingActions: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    gap: 12,
    zIndex: 5,
  },
  actionButton: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 10,
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#111827',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  commentsList: {
    flex: 1,
    padding: 16,
  },
  emptyComments: {
    alignItems: 'center',
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
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#1F2937',
    borderRadius: 8,
  },
  replyItem: {
    marginTop: 8,
    marginLeft: 32,
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
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  commentAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 8,
  },
  commentUserName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
    flexDirection: 'row',
    gap: 16,
  },
  commentAction: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
    fontWeight: '600',
  },
  repliesContainer: {
    marginTop: 8,
  },
  commentForm: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
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
    alignItems: 'center',
  },
  commentSubmitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default NovelReaderScreen;