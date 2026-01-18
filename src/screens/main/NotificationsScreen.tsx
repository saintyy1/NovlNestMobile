import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../theme';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Notification {
  id: string;
  type:
    | 'follow'
    | 'novel_like'
    | 'novel_comment'
    | 'novel_reply'
    | 'comment_reply'
    | 'comment_like'
    | 'chapter_like'
    | 'novel_added_to_library'
    | 'novel_finished'
    | 'followed_author_announcement'
    | 'new_chapter'
    | 'poem_like'
    | 'poem_comment'
    | 'poem_reply'
    | 'poem_added_to_library'
    | 'promotion_approved'
    | 'promotion_ended'
    | 'support_response';
  fromUserId?: string;
  fromUserName?: string;
  toUserId: string;
  novelId?: string;
  novelTitle?: string;
  poemId?: string;
  poemTitle?: string;
  commentContent?: string;
  commentId?: string;
  parentId?: string;
  announcementContent?: string;
  chapterCount?: number;
  chapterTitles?: string[];
  chapterNumber?: number;
  chapterTitle?: string;
  promotionPlan?: string;
  promotionDuration?: string;
  ticketId?: string;
  subject?: string;
  createdAt: string;
  read: boolean;
  fromUserPhotoURL?: string;
}

export const NotificationsScreen = ({ navigation }: any) => {
  const { currentUser, loading: authLoading , clearAllNotifications } = useAuth();
  const { colors } = useTheme();
  const { markAsRead: contextMarkAsRead, markAllAsRead: contextMarkAllAsRead } = useNotifications();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromUsersData, setFromUsersData] = useState<Record<string, { displayName: string; photoURL?: string }>>({});
  const [markingAllAsRead, setMarkingAllAsRead] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const styles = getStyles(colors);

  const getUserInitials = useCallback((name: string | null | undefined) => {
    if (!name) return 'U';
    return name.charAt(0).toUpperCase();
  }, []);

  useEffect(() => {
    if (authLoading || !currentUser) {
      setLoading(false);
      return;
    }

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('toUserId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      async (snapshot) => {
        const fetchedNotifications: Notification[] = [];
        const uniqueFromUserIds = new Set<string>();

        snapshot.forEach((doc) => {
          const notification = { id: doc.id, ...doc.data() } as Notification;
          fetchedNotifications.push(notification);
          if (notification.fromUserId) {
            uniqueFromUserIds.add(notification.fromUserId);
          }
        });

        const newFromUsersData: Record<string, { displayName: string; photoURL?: string }> = { ...fromUsersData };
        const fetchPromises: Promise<void>[] = [];

        uniqueFromUserIds.forEach((userId) => {
          if (!newFromUsersData[userId]) {
            fetchPromises.push(
              getDoc(doc(db, 'users', userId))
                .then((userDoc) => {
                  if (userDoc.exists()) {
                    const userData = userDoc.data();
                    newFromUsersData[userId] = {
                      displayName: userData.displayName || 'Unknown User',
                      photoURL: userData.photoURL,
                    };
                  } else {
                    newFromUsersData[userId] = { displayName: 'Deleted User' };
                  }
                })
                .catch((err) => {
                  console.error(`Error fetching user data for ${userId}:`, err);
                  newFromUsersData[userId] = { displayName: 'Error User' };
                })
            );
          }
        });

        await Promise.all(fetchPromises);
        setFromUsersData(newFromUsersData);
        setNotifications(fetchedNotifications);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching notifications:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, authLoading]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        await contextMarkAsRead(notificationId);
      } catch (err) {
        console.error('Error marking notification as read:', err);
      }
    },
    [contextMarkAsRead]
  );

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      markAsRead(notification.id).catch((err) => {
        console.error('Failed to mark notification as read:', err);
      });
      
      // Navigate based on notification type
      switch (notification.type) {
        case 'follow':
        case 'followed_author_announcement':
          if (notification.fromUserId) {
            navigation.navigate('Profile', { userId: notification.fromUserId });
          }
          break;

        case 'novel_like':
        case 'novel_added_to_library':
        case 'novel_finished':
        case 'new_chapter':
        case 'promotion_approved':
        case 'promotion_ended':
          if (notification.novelId) {
            navigation.navigate('NovelOverview', { novelId: notification.novelId });
          }
          break;

        case 'chapter_like':
        case 'novel_comment':
        case 'novel_reply':
          if (notification.novelId) {
            navigation.navigate('NovelReader', { 
              novelId: notification.novelId,
              chapterNumber: notification.chapterNumber 
            });
          }
          break;

        case 'comment_like':
        case 'comment_reply':
          if (notification.poemId) {
            navigation.navigate('PoemDetails', { poemId: notification.poemId });
          } else if (notification.novelId) {
            if (notification.chapterNumber) {
              navigation.navigate('NovelReader', { 
                novelId: notification.novelId,
                chapterNumber: notification.chapterNumber 
              });
            } else {
              navigation.navigate('NovelDetails', { novelId: notification.novelId });
            }
          }
          break;

        case 'poem_like':
        case 'poem_comment':
        case 'poem_reply':
        case 'poem_added_to_library':
          if (notification.poemId) {
            navigation.navigate('PoemDetails', { poemId: notification.poemId });
          }
          break;

        case 'support_response':
          navigation.navigate('MyTickets');
          break;

        default:
          console.log('Unknown notification type:', notification.type);
          break;
      }
    },
    [markAsRead, navigation]
  );

  const renderNotificationAvatarOrIcon = (notification: Notification) => {
    const fromUserData = notification.fromUserId ? fromUsersData[notification.fromUserId] : null;

    if (fromUserData?.photoURL) {
      return (
        <Image
          source={{ uri: fromUserData.photoURL }}
          style={styles.avatar}
        />
      );
    } else if (fromUserData?.displayName) {
      return (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitials}>
            {getUserInitials(fromUserData.displayName)}
          </Text>
        </View>
      );
    } else {
      return renderNotificationIcon(notification.type);
    }
  };

  const renderNotificationIcon = (type: Notification['type']) => {
    const iconProps = { size: 20, color: '#fff' };
    
    switch (type) {
      case 'follow':
        return <Ionicons name="person-add" {...iconProps} color="#A78BFA" />;
      case 'novel_like':
      case 'poem_like':
      case 'comment_like':
      case 'chapter_like':
        return <Ionicons name="heart" {...iconProps} color="#F87171" />;
      case 'novel_comment':
      case 'novel_reply':
      case 'comment_reply':
      case 'poem_comment':
      case 'poem_reply':
        return <Ionicons name="chatbubble" {...iconProps} color="#60A5FA" />;
      case 'followed_author_announcement':
        return <Ionicons name="megaphone" {...iconProps} color="#FBBF24" />;
      case 'novel_added_to_library':
      case 'poem_added_to_library':
        return <Ionicons name="book" {...iconProps} color="#34D399" />;
      case 'novel_finished':
        return <Ionicons name="checkmark-circle" {...iconProps} color="#34D399" />;
      case 'new_chapter':
        return <Ionicons name="document-text" {...iconProps} color="#60A5FA" />;
      case 'promotion_approved':
        return <Ionicons name="trending-up" {...iconProps} color="#34D399" />;
      case 'promotion_ended':
        return <Ionicons name="time" {...iconProps} color="#FB923C" />;
      case 'support_response':
        return <Ionicons name="headset" {...iconProps} color="#60A5FA" />;
      default:
        return <Ionicons name="mail" {...iconProps} color="#9CA3AF" />;
    }
  };

  const getNotificationMessage = (notification: Notification) => {
    const fromUserDisplayName = notification.fromUserId
      ? fromUsersData[notification.fromUserId]?.displayName || notification.fromUserName || 'Someone'
      : notification.fromUserName || 'Someone';

    switch (notification.type) {
      case 'follow':
        return `${fromUserDisplayName} started following you.`;
      case 'novel_like':
        return `${fromUserDisplayName} liked your novel "${notification.novelTitle}".`;
      case 'comment_like':
        return `${fromUserDisplayName} liked your comment${notification.chapterTitle ? ` (${notification.chapterTitle})` : ''}.`;
      case 'chapter_like':
        return `${fromUserDisplayName} liked your chapter "${notification.novelTitle}"${notification.chapterTitle ? ` (${notification.chapterTitle})` : ''}.`;
      case 'novel_comment':
        return `${fromUserDisplayName} commented on your novel "${notification.novelTitle}"${notification.chapterTitle ? ` (${notification.chapterTitle})` : ''}: "${notification.commentContent}"`;
      case 'novel_reply':
        return `${fromUserDisplayName} replied to a comment on your novel "${notification.novelTitle}"${notification.chapterTitle ? ` (${notification.chapterTitle})` : ''}: "${notification.commentContent}"`;
      case 'comment_reply':
        return `${fromUserDisplayName} replied to your comment${notification.chapterTitle ? ` (${notification.chapterTitle})` : ''}: "${notification.commentContent}"`;
      case 'followed_author_announcement':
        return `${fromUserDisplayName} posted an announcement: "${notification.announcementContent}"`;
      case 'novel_added_to_library':
        return `${fromUserDisplayName} added your novel "${notification.novelTitle}" to their library.`;
      case 'novel_finished':
        return `${fromUserDisplayName} marked your novel "${notification.novelTitle}" as finished!`;
      case 'new_chapter':
        return `${fromUserDisplayName} added ${notification.chapterCount === 1 ? 'a new chapter' : `${notification.chapterCount} new chapters`} to "${notification.novelTitle}" : "${notification.chapterTitles?.join(', ')}"`;
      case 'poem_like':
        return `${fromUserDisplayName} liked your poem "${notification.poemTitle}".`;
      case 'poem_comment':
        return `${fromUserDisplayName} commented on your poem "${notification.poemTitle}": "${notification.commentContent}"`;
      case 'poem_reply':
        return `${fromUserDisplayName} replied to a comment on your poem "${notification.poemTitle}": "${notification.commentContent}"`;
      case 'poem_added_to_library':
        return `${fromUserDisplayName} added your poem "${notification.poemTitle}" to their library.`;
      case 'promotion_approved':
        return `🎉 Your novel "${notification.novelTitle}" promotion has been approved and is now featured!`;
      case 'promotion_ended':
        return `Your novel "${notification.novelTitle}" promotion has ended.`;
      case 'support_response':
        return `Support team responded to your ticket${notification.ticketId ? ` #${notification.ticketId}` : ''}${notification.subject ? ` - ${notification.subject}` : ''}.`;
      default:
        return 'You have a new message.';
    }
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

  const handleMarkAllAsRead = async () => {
    try {
      setMarkingAllAsRead(true);
      await contextMarkAllAsRead();
    } catch (error) {
      console.error('Error marking all as read:', error);
      Alert.alert('Error', 'Failed to mark all notifications as read.');
    } finally {
      setMarkingAllAsRead(false);
    }
  };

  const handleClearAll = async () => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to delete all notifications? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              setClearingAll(true);
              await clearAllNotifications();
            } catch (error) {
              console.error('Error clearing all notifications:', error);
              Alert.alert('Error', 'Failed to clear all notifications.');
            } finally {
              setClearingAll(false);
            }
          },
        },
      ]
    );
  };

  if (authLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  if (!currentUser) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="log-in-outline" size={64} color={colors.textSecondary} />
        <Text style={styles.emptyTitle}>Please log in</Text>
        <Text style={styles.emptyText}>Log in to view your notifications</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {/* Custom Header */}
      <View style={styles.customHeader}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Header Actions */}
      {notifications.length > 0 && (
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              (markingAllAsRead || notifications.every((n) => n.read)) && styles.actionButtonDisabled,
            ]}
            onPress={handleMarkAllAsRead}
            disabled={markingAllAsRead || notifications.every((n) => n.read)}
          >
            {markingAllAsRead ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color={colors.text} />
                <Text style={styles.actionButtonText}>Mark All Read</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.clearButton, clearingAll && styles.actionButtonDisabled]}
            onPress={handleClearAll}
            disabled={clearingAll}
          >
            {clearingAll ? (
              <ActivityIndicator size="small" color="#F87171" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color="#F87171" />
                <Text style={[styles.actionButtonText, styles.clearButtonText]}>Clear All</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Notifications List */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {notifications.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
            <Text style={styles.emptyStateTitle}>No new notifications</Text>
            <Text style={styles.emptyStateText}>You're all caught up!</Text>
          </View>
        ) : (
          <View style={styles.notificationsList}>
            {notifications.map((notification) => (
              <TouchableOpacity
                key={notification.id}
                style={[
                  styles.notificationCard,
                  !notification.read && styles.notificationCardUnread,
                ]}
                onPress={() => handleNotificationClick(notification)}
              >
                <View style={styles.notificationAvatarContainer}>
                  {renderNotificationAvatarOrIcon(notification)}
                </View>

                <View style={styles.notificationContent}>
                  <Text
                    style={[
                      styles.notificationMessage,
                      !notification.read && styles.notificationMessageUnread,
                    ]}
                    numberOfLines={3}
                  >
                    {getNotificationMessage(notification)}
                  </Text>
                  <Text style={styles.notificationTime}>{formatDate(notification.createdAt)}</Text>
                </View>

                {!notification.read && (
                  <TouchableOpacity
                    style={styles.markReadButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      markAsRead(notification.id);
                    }}
                  >
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: themeColors.primary,
    paddingTop: 50,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  headerPlaceholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: themeColors.background,
  },
  loadingText: {
    ...typography.body,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
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
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: themeColors.backgroundSecondary,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: themeColors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    ...typography.bodySmall,
    color: themeColors.text,
    fontWeight: '600',
  },
  clearButton: {
    borderColor: '#F87171',
  },
  clearButtonText: {
    color: '#F87171',
  },
  scrollContent: {
    flexGrow: 1,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyStateTitle: {
    ...typography.h3,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    color: themeColors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyStateText: {
    ...typography.body,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    color: themeColors.textSecondary,
  },
  notificationsList: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  notificationCard: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: themeColors.backgroundSecondary,
    borderRadius: 12,
    gap: spacing.md,
  },
  notificationCardUnread: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  notificationAvatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: themeColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: themeColors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    ...typography.body,
    color: '#fff',
    fontWeight: '700',
  },
  notificationContent: {
    flex: 1,
  },
  notificationMessage: {
    ...typography.bodySmall,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    color: themeColors.textSecondary,
    marginBottom: spacing.xs,
    lineHeight: 20,
  },
  notificationMessageUnread: {
    color: themeColors.text,
    fontWeight: '500',
  },
  notificationTime: {
    ...typography.caption,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    color: themeColors.textSecondary,
  },
  markReadButton: {
    padding: spacing.xs,
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