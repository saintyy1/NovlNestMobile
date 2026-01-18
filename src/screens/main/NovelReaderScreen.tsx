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
  StatusBar,
  Image,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Dimensions,
  Animated,
  Share as RNShare,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
  const { colors } = useTheme();

  const [novel, setNovel] = useState<Novel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentChapter, setCurrentChapter] = useState(chapterNumber || 0);
  const [showComments, setShowComments] = useState(false);
  const [chapterLiked, setChapterLiked] = useState(false);
  const [chapterLikes, setChapterLikes] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);
  const [isAtEnd, setIsAtEnd] = useState(false);
  const [showNextChapterHint, setShowNextChapterHint] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // screenWidth no longer needed - removed horizontal animation

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

  const currentContentInfo = getContentInfo(currentChapter);

  const getTotalReadingOrderItems = useCallback(() => {
    if (!novel) return 0;
    let count = 0;
    if (novel.authorsNote) count++;
    if (novel.prologue) count++;
    count += novel.chapters.length;
    return count;
  }, [novel]);

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

  // Smart paragraph splitting function
  const splitIntoSmartParagraphs = (content: string): string[] => {
    // First, split by explicit paragraph breaks (double newlines)
    const explicitParagraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
    
    const smartParagraphs: string[] = [];
    
    for (const para of explicitParagraphs) {
      // Clean up the paragraph
      const cleanPara = para.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      
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

  // Get parent comment data for reply display
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
        isReply ? styles.replyItem : styles.commentItem,
        { backgroundColor: isReply ? 'transparent' : colors.surface }
      ]}>
        <View style={styles.commentContainer}>
          <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: comment.userId })}>
            {comment.userPhoto ? (
              <Image source={{ uri: comment.userPhoto }} style={styles.commentAvatar} />
            ) : (
              <View style={[styles.commentAvatarPlaceholder, { backgroundColor: colors.primary }]}>
                <Text style={styles.commentAvatarText}>{getUserInitials(comment.userName)}</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.commentContent}>
            <View style={styles.commentHeader}>
              {isReply && parentData ? (
                <View style={styles.replyHeader}>
                  <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: comment.userId })}>
                    <Text style={[styles.commentUserName, { color: colors.text }]}>{comment.userName}</Text>
                  </TouchableOpacity>
                  <Text style={[styles.replyArrow, { color: colors.textSecondary }]}>{'>'}</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: parentData.userId })}>
                    <Text style={[styles.commentUserName, { color: colors.primary }]}>{parentData.userName}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => navigation.navigate('Profile', { userId: comment.userId })}>
                  <Text style={[styles.commentUserName, { color: colors.text }]}>{comment.userName}</Text>
                </TouchableOpacity>
              )}
              <Text style={[styles.commentDate, { color: colors.textSecondary }]}>{formatDate(comment.createdAt)}</Text>
              {comment.userId === novel?.authorId && (
                <View style={[styles.authorBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.authorBadgeText}>Author</Text>
                </View>
              )}
            </View>

            <Text style={[styles.commentText, { color: colors.text }]}>{comment.text}</Text>

            <View style={styles.commentActions}>
              <TouchableOpacity
                onPress={() => handleCommentLike(comment.id, comment.likedBy?.includes(currentUser?.uid || '') || false)}
                disabled={!currentUser}
                style={styles.commentAction}
              >
                <Ionicons
                  name={comment.likedBy?.includes(currentUser?.uid || '') ? 'heart' : 'heart-outline'}
                  size={16}
                  color={comment.likedBy?.includes(currentUser?.uid || '') ? colors.error : colors.textSecondary}
                />
                <Text style={[styles.commentActionText, { color: colors.textSecondary }]}>{comment.likes || 0}</Text>
              </TouchableOpacity>

              {currentUser && (
                <TouchableOpacity onPress={() => setReplyingTo(comment.id)} style={styles.commentAction}>
                  <Ionicons name="return-down-forward-outline" size={16} color={colors.textSecondary} />
                  <Text style={[styles.commentActionText, { color: colors.textSecondary }]}>Reply</Text>
                </TouchableOpacity>
              )}

              {canDeleteComment(comment) && (
                <TouchableOpacity
                  onPress={() => handleDeleteComment(comment.id)}
                  disabled={deletingComment === comment.id}
                  style={styles.commentAction}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
                  <Text style={[styles.commentActionText, { color: colors.textSecondary }]}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>

            {replyingTo === comment.id && (
              <View style={styles.replyInputContainer}>
                <TextInput
                  value={replyContent}
                  onChangeText={setReplyContent}
                  placeholder={`Reply to ${comment.userName}...`}
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.replyInput, { backgroundColor: colors.surfaceSecondary, color: colors.text }]}
                  multiline
                />
                <View style={styles.replyActions}>
                  <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyCancel}>
                    <Text style={[styles.replyCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleAddReply(comment.id)}
                    disabled={!replyContent.trim() || submittingReply === comment.id}
                    style={[styles.replySubmit, { backgroundColor: colors.primary }]}
                  >
                    <Text style={styles.replySubmitText}>{submittingReply === comment.id ? 'Posting...' : 'Reply'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        {comment.replies && comment.replies.length > 0 && (
          <View style={styles.repliesContainer}>{comment.replies.map((reply) => renderComment(reply, true))}</View>
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
          {splitIntoSmartParagraphs(currentContentInfo.content).map((paragraph: string, index: number) => (
              <Text
                key={index}
                style={[styles.paragraph, { color: colors.text }]}
              >
                {parseFormattedText(paragraph)}
              </Text>
            ))}
          
          {/* End of chapter indicator */}
          <View style={styles.chapterEndContainer}>
            <View style={[styles.chapterEndLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.chapterEndText, { color: colors.textSecondary }]}>
              End of {currentContentInfo.title}
            </Text>
            
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
            {comments.reduce((total, c) => total + 1 + (c.replies?.length || 0), 0)}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showComments} animationType="slide" onRequestClose={() => setShowComments(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <SafeAreaView style={{ backgroundColor: colors.background }} edges={['top']}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Comments ({comments.reduce((total, c) => total + 1 + (c.replies?.length || 0), 0)})
              </Text>
              <TouchableOpacity onPress={() => setShowComments(false)} style={styles.modalCloseButton}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView style={styles.commentsList} showsVerticalScrollIndicator={false}>
              {comments.length === 0 ? (
                <View style={styles.emptyComments}>
                  <Ionicons name="chatbubbles-outline" size={48} color={colors.textSecondary} />
                  <Text style={[styles.emptyCommentsText, { color: colors.textSecondary }]}>No comments yet</Text>
                  <Text style={[styles.emptyCommentsSubtext, { color: colors.textSecondary }]}>Be the first to comment!</Text>
                </View>
              ) : (
                comments.map((comment) => renderComment(comment))
              )}
            </ScrollView>

            {currentUser && (
              <View style={[styles.commentForm, { borderTopColor: colors.border }]}>
                <TextInput
                  value={newComment}
                  onChangeText={setNewComment}
                  placeholder="Write a comment..."
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.commentInput, { backgroundColor: colors.surface, color: colors.text }]}
                  multiline
                />
                <TouchableOpacity
                  onPress={handleAddComment}
                  disabled={!newComment.trim() || submittingComment}
                  style={[styles.commentSubmit, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.commentSubmitText}>{submittingComment ? 'Posting...' : 'Post'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
    marginBottom: 16,
  },
  chapterEndText: {
    fontSize: 14,
    marginBottom: 24,
  },
  nextChapterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
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
  },
  prevChapterButtonText: {
    fontSize: 14,
    marginLeft: 4,
  },
  noMoreChaptersText: {
    fontSize: 14,
    fontStyle: 'italic',
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
    marginBottom: 8,
    textAlign: 'center',
  },
  authorName: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 24,
    textAlign: 'center',
  },
  paragraph: {
    fontSize: 18,
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
  },
  actionButtonText: {
    fontSize: 10,
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalCloseButton: {
    padding: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
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
    fontSize: 14,
    marginTop: 12,
  },
  emptyCommentsSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
  commentItem: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
  },
  replyItem: {
    marginBottom: 8,
  },
  commentContainer: {
    flexDirection: 'row',
    marginBottom: 10,
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
  },
  commentDate: {
    fontSize: 12,
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
    fontSize: 12,
  },
  replyInputContainer: {
    marginTop: 12,
  },
  replyInput: {
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
    fontSize: 12,
  },
  replySubmit: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  },
  commentInput: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    minHeight: 80,
  },
  commentSubmit: {
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
