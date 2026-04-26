import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Alert,
  Animated,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';
import CachedImage from '../../components/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useChat, ChatConversation, ChatMessage } from '../../contexts/ChatContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useAlert } from '../../contexts/AlertContext';
import { sendPushNotification } from '../../services/PushNotificationService';
import { dismissNotificationsForUser } from '../../services/notificationServices';

// User Avatar Component
const UserAvatar = ({ navigation, currentUser, colors }: any) => {
  const [imageError, setImageError] = React.useState(false);

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Profile', { userId: currentUser?.uid })}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        overflow: 'hidden',
      }}
    >
      {currentUser?.photoURL && !imageError ? (
        <CachedImage
          uri={currentUser.photoURL}
          style={{ width: '100%', height: '100%' }}
          onError={() => setImageError(true)}
        />
      ) : (
        <View
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: colors.secondary,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 16,
              fontWeight: '700',
            }}
          >
            {currentUser?.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// Notifications Button Component
const NotificationsButton = ({ navigation, colors }: any) => {
  const { unreadCount } = useNotifications();

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Notifications')}
      style={{
        position: 'relative',
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Ionicons name="notifications-outline" size={24} color="#fff" />
      {unreadCount > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            backgroundColor: colors.error,
            borderRadius: 10,
            minWidth: 20,
            height: 20,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text
            style={{
              color: '#fff',
              fontSize: 10,
              fontWeight: '700',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// Message Bubble Component to follow Rules of Hooks
const MessageBubble = ({
  item,
  isOwn,
  showDate,
  handleSwipeToReply,
  styles,
  colors,
  isDark,
  setSelectedMessage,
  setOptionsModalVisible,
  formatMessageTime,
  formatDateSeparator
}: any) => {
  const swipeRef = useRef<any>(null);

  const handleSwipeOpen = () => {
    handleSwipeToReply(item);
    swipeRef.current?.close();
  };

  const renderLeftActions = () => (
    <View style={{ justifyContent: 'center', alignItems: 'flex-end', width: 60, paddingRight: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? '#374151' : '#F3F4F6', justifyContent: 'center', alignItems: 'center' }}>
        <Ionicons name="arrow-undo" size={18} color={isDark ? '#D1D5DB' : '#6B7280'} />
      </View>
    </View>
  );

  return (
    <View>
      {showDate && (
        <View style={styles.dateSeparator}>
          <Text style={styles.dateSeparatorText}>{formatDateSeparator(item.timestamp)}</Text>
        </View>
      )}
      <ReanimatedSwipeable
        ref={swipeRef}
        renderLeftActions={renderLeftActions}
        onSwipeableOpen={handleSwipeOpen}
        overshootLeft={false}
        containerStyle={{ overflow: 'visible' }}
      >
        <View style={[styles.messageContainer, isOwn ? styles.messageContainerOwn : styles.messageContainerOther]}>
          <TouchableOpacity
            activeOpacity={0.8}
            onLongPress={() => {
              setSelectedMessage(item);
              setOptionsModalVisible(true);
            }}
            delayLongPress={300}
          >
            <View style={[styles.messageBubble, isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther]}>
              {item.replyToId && (
                <View style={{
                  backgroundColor: isOwn ? 'rgba(255,255,255,0.12)' : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  borderRadius: 10,
                  padding: 10,
                  borderLeftWidth: 4,
                  borderLeftColor: isOwn ? '#fff' : colors.primary,
                  marginBottom: 8,
                  overflow: 'hidden',
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: isOwn ? '#fff' : colors.primary, marginBottom: 4 }}>{item.replyOriginalSender}</Text>
                  <Text style={{ fontSize: 14, color: isOwn ? 'rgba(255,255,255,0.85)' : colors.textSecondary }} numberOfLines={3}>
                    {item.replyOriginalContent}
                  </Text>
                </View>
              )}

              <View style={styles.messageContentWrapper}>
                <Text style={[styles.messageText, isOwn ? styles.messageTextOwn : styles.messageTextOther]}>
                  {item.content}
                </Text>
                <View style={[styles.messageFooter, isOwn ? styles.messageFooterOwn : styles.messageFooterOther]}>
                  <Text style={[styles.messageTime, isOwn ? styles.messageTimeOwn : styles.messageTimeOther]}>
                    {formatMessageTime(item.timestamp)}
                    {item.isEdited && <Text style={{ fontStyle: 'italic', fontSize: 10, fontWeight: '400' }}> (edited)</Text>}
                  </Text>
                  {isOwn && (
                    <Ionicons
                      name={item.status === 'sending' ? 'time-outline' : (item.read ? 'checkmark-done' : 'checkmark')}
                      size={15}
                      color={item.status === 'sending' ? 'rgba(255,255,255,0.6)' : (item.read ? '#34D399' : 'rgba(255,255,255,0.5)')}
                      style={styles.checkmark}
                    />
                  )}
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </ReanimatedSwipeable>
    </View>
  );
};

export const MessagesScreen = ({ navigation, route }: any) => {
  const { currentUser } = useAuth();
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';
  const {
    state,
    loadConversations,
    setCurrentConversation,
    markAsRead,
    sendMessage,
    editMessage,
    deleteMessage,
    loadMoreMessages,
    getUser,
    fetchUserData,
  } = useChat();
  const { showAlert, showToast } = useAlert();

  const styles = getStyles(colors);

  // State
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<{ messageId: string; conversationId: string } | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [conversationUnreadCounts, setConversationUnreadCounts] = useState<Map<string, number>>(new Map());

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // WhatsApp-Style Action States
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);

  // Correct cleanup: Remove optimistic items as soon as their real counterparts arrive in state.messages
  useEffect(() => {
    if (optimisticMessages.length === 0 || state.messages.length === 0) return;

    const matchingIds = new Set<string>();

    optimisticMessages.forEach(optMsg => {
      // Find a real message that matches the optimistic one
      const hasMatch = state.messages.some(msg =>
        msg.senderId === optMsg.senderId &&
        msg.content === optMsg.content &&
        Math.abs(msg.timestamp - optMsg.timestamp) < 10000 // Within 10 seconds tolerance
      );

      if (hasMatch) {
        matchingIds.add(optMsg.id);
      }
    });

    if (matchingIds.size > 0) {
      setOptimisticMessages(prev => prev.filter(m => !matchingIds.has(m.id)));
    }
  }, [state.messages, optimisticMessages]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Set up real-time listeners for unread counts per conversation
  useEffect(() => {
    if (!currentUser || state.conversations.length === 0) return;

    const unsubscribers: (() => void)[] = [];

    state.conversations.forEach(conversation => {
      // Get the other participant
      const otherParticipant = conversation.participants.find(id => id !== currentUser.uid);
      if (!otherParticipant) return;

      // Query unread messages from this specific conversation partner
      const unreadMessagesQuery = query(
        collection(db, 'messages'),
        where('senderId', '==', otherParticipant),
        where('receiverId', '==', currentUser.uid),
        where('read', '==', false)
      );

      const unsubscribe = onSnapshot(unreadMessagesQuery, (snapshot) => {
        setConversationUnreadCounts(prev => {
          const newCounts = new Map(prev);
          newCounts.set(conversation.id, snapshot.size);
          return newCounts;
        });
      });

      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [currentUser, state.conversations]);

  // Handle user parameter from navigation to open specific conversation
  useEffect(() => {
    const userId = route.params?.userId;
    if (userId && currentUser && userId !== currentUser.uid) {
      // Immediate cleanup of push notifications for this user
      dismissNotificationsForUser(userId);

      const timer = setTimeout(() => {
        // Check if conversation already exists
        const existingConversation = state.conversations.find(conv =>
          conv.participants.includes(userId) && conv.participants.includes(currentUser.uid)
        );

        if (existingConversation) {
          handleConversationSelect(existingConversation);
        } else {
          // Create new conversation
          const newConversation: ChatConversation = {
            id: [currentUser.uid, userId].sort().join('_'),
            participants: [currentUser.uid, userId],
            unreadCount: 0,
            lastActivity: Date.now(),
            isTyping: false,
            typingUsers: [],
          };

          // Fetch user data for the selected user
          fetchUserData(userId).then(() => {
            setCurrentConversation(newConversation);
            markAsRead(newConversation.id);
            // Clear reply/edit state for new conversation
            setReplyingTo(null);
            setEditingMessage(null);
            setMessageInput('');
          });
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [route.params?.userId, currentUser?.uid]);

  // Automated mark as read when messages arrive while chat is open
  useEffect(() => {
    if (state.currentConversation && state.messages.length > 0) {
      const hasUnread = state.messages.some(m => !m.read && m.senderId !== currentUser?.uid);
      if (hasUnread) {
        markAsRead(state.currentConversation.id);
      }
    }
  }, [state.currentConversation?.id, state.messages, currentUser?.uid]);

  const handleConversationSelect = (conversation: ChatConversation) => {
    setCurrentConversation(conversation);
    markAsRead(conversation.id);
    // Clear reply/edit state when switching chats
    setReplyingTo(null);
    setEditingMessage(null);
    setMessageInput('');
  };

  const handleBackToConversations = () => {
    setCurrentConversation(null);
    // Clear the userId param to prevent re-opening the conversation
    navigation.setParams({ userId: undefined });
    // Clear reply/edit state
    setReplyingTo(null);
    setEditingMessage(null);
    setMessageInput('');
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !state.currentConversation || !currentUser) return;

    // Handle Edit Mode (Immediate clearing as well)
    if (editingMessage) {
      const content = messageInput.trim();
      const msgId = editingMessage.id;
      const convId = state.currentConversation.id;

      // Reset UI immediately
      setMessageInput('');
      setEditingMessage(null);
      setSendingMessage(true);

      try {
        await editMessage(msgId, convId, content);
      } catch (error) {
        console.error('Error editing message:', error);
        showToast({ message: 'Failed to edit message', type: 'error' });
        // Optionally restore text if failed
      } finally {
        setSendingMessage(false);
      }
      return;
    }

    const receiverId = state.currentConversation.participants.find(id => id !== currentUser.uid);
    if (!receiverId) return;

    // 1. Capture current state for background sending
    const content = messageInput.trim();
    const currentReplyTo = replyingTo;
    const tempId = `optimistic-${Date.now()}`;

    // 2. Create Optimistic Message
    const optimisticMsg: any = {
      id: tempId,
      content: content,
      senderId: currentUser.uid,
      receiverId: receiverId,
      timestamp: Date.now(),
      status: 'sending', // Key for the clock icon
      read: false,
      replyToId: currentReplyTo?.id,
      replyOriginalContent: currentReplyTo?.content,
      replyOriginalSender: currentReplyTo?.senderId === currentUser.uid ? 'You' : getUserDisplayName(getUser(currentReplyTo?.senderId || ''))
    };

    // 3. Immediately Update UI
    setOptimisticMessages(prev => [optimisticMsg, ...prev]);
    setMessageInput('');
    setReplyingTo(null);

    // 4. Background sending
    const performSend = async () => {
      try {
        let replyData = undefined;
        if (currentReplyTo) {
          const senderUser = getUser(currentReplyTo.senderId);
          replyData = {
            id: currentReplyTo.id,
            content: currentReplyTo.content,
            sender: currentReplyTo.senderId === currentUser.uid ? 'You' : getUserDisplayName(senderUser)
          };
        }

        // Background Promise
        await sendMessage(receiverId, content, 'text', replyData);

        // Send Push Notification in background too
        await sendPushNotification(
          receiverId,
          `${currentUser.displayName || 'Someone'}`,
          content,
          {
            url: `novlnest://messages/${currentUser.uid}`,
            senderId: currentUser.uid,
            type: 'dm'
          }
        );
      } catch (err: any) {
        console.error('Background send error:', err);
        showToast({ message: 'Your message could not be sent.', type: 'error' });
        // Optionally put text back?
      } finally {
        // 5. Remove optimistic message once real one arrives (or fails)
        // We delay this briefly to ensure Firestore snapshot has time to update
        setTimeout(() => {
          setOptimisticMessages(prev => prev.filter(m => m.id !== tempId));
        }, 1000);
      }
    };

    performSend();

    // Scroll immediately
    setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);
  };

  const handleDeleteMessage = (messageId: string, conversationId: string) => {
    setMessageToDelete({ messageId, conversationId });
    setDeleteModalVisible(true);
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return;

    try {
      await deleteMessage(messageToDelete.messageId, messageToDelete.conversationId);
      setDeleteModalVisible(false);
      setMessageToDelete(null);
    } catch (error) {
      console.error('Error deleting message:', error);
      showToast({ message: 'Failed to delete message', type: 'error' });
    }
  };

  const getOtherParticipant = (conversation: ChatConversation) => {
    if (!currentUser) return null;
    return conversation.participants.find(id => id !== currentUser.uid);
  };

  const getUserDisplayName = (user: any) => {
    return user?.displayName || '';
  };

  const getUserInitials = (name: string) => {
    if (!name || name === 'Deleted Account') return 'U';
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const formatMessageTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredConversations = state.conversations.filter(conversation => {
    if (!searchQuery.trim()) return true;
    const otherParticipant = getOtherParticipant(conversation);
    const user = getUser(otherParticipant || '');
    const name = (user?.displayName || '').toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  const isSameDay = (timestamp1: number, timestamp2: number) => {
    const date1 = new Date(timestamp1);
    const date2 = new Date(timestamp2);
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  const formatDateSeparator = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (isSameDay(timestamp, today.getTime())) {
      return 'Today';
    } else if (isSameDay(timestamp, yesterday.getTime())) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const handleCopyMessage = async (content: string) => {
    await Clipboard.setStringAsync(content);
    setOptionsModalVisible(false);
  };

  const handleEditInitiate = (message: ChatMessage) => {
    setEditingMessage(message);
    setReplyingTo(null);
    setMessageInput(message.content);
    setOptionsModalVisible(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Render conversation item
  const renderConversationItem = ({ item }: { item: ChatConversation }) => {
    const otherParticipant = getOtherParticipant(item);
    const user = getUser(otherParticipant || '');
    const isActive = state.currentConversation?.id === item.id;
    const unreadCount = conversationUnreadCounts.get(item.id) || 0;

    return (
      <TouchableOpacity
        style={[styles.conversationItem, isActive && styles.conversationItemActive]}
        onPress={() => handleConversationSelect(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          {user?.photoURL ? (
            <CachedImage uri={user.photoURL} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {getUserInitials(getUserDisplayName(user))}
              </Text>
            </View>
          )}
          {item.isTyping && <View style={styles.typingIndicator} />}
        </View>

        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <View style={styles.nameContainer}>
              {user?.isAdmin && (
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>ADMIN</Text>
                </View>
              )}
              <Text style={styles.conversationName} numberOfLines={1}>
                {getUserDisplayName(user)}
              </Text>
            </View>
            {item.lastMessage && (
              <Text style={styles.conversationTime}>{formatTime(item.lastMessage.timestamp)}</Text>
            )}
          </View>

          <View style={styles.conversationFooter}>
            {item.lastMessage && (
              <Text style={styles.lastMessage} numberOfLines={1}>
                {item.lastMessage.content}
              </Text>
            )}
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const handleSwipeToReply = (message: ChatMessage) => {
    setReplyingTo(message);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Render message bubble
  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isOwn = item.senderId === currentUser?.uid;
    const nextMessage = state.messages[index + 1];
    const showDate = !nextMessage || !isSameDay(item.timestamp, nextMessage.timestamp);

    return (
      <MessageBubble
        item={item}
        index={index}
        isOwn={isOwn}
        showDate={showDate}
        handleSwipeToReply={handleSwipeToReply}
        styles={styles}
        colors={colors}
        isDark={isDark}
        setSelectedMessage={setSelectedMessage}
        setOptionsModalVisible={setOptionsModalVisible}
        formatMessageTime={formatMessageTime}
        formatDateSeparator={formatDateSeparator}
      />
    );
  };

  if (!currentUser) {
    return (
      <View style={styles.safeArea}>
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>Please log in</Text>
          <Text style={styles.emptyText}>Log in to view your messages</Text>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => navigation.navigate('Auth', { screen: 'Login' })}
          >
            <Text style={styles.loginButtonText}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (
    state.isLoading &&
    state.conversations.length === 0 &&
    !state.currentConversation
  ) {
    return (
      <View style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      </View>
    );
  }

  // Conversations List View
  if (!state.currentConversation) {
    return (
      <View style={styles.safeArea}>
        {/* Header */}
        <View style={styles.conversationsHeader}>
          <View style={styles.conversationsHeaderContent}>
            <Text style={styles.conversationsHeaderTitle}>Messages</Text>
            <View style={styles.headerRightContainer}>
              <NotificationsButton navigation={navigation} colors={colors} />
              <UserAvatar navigation={navigation} currentUser={currentUser} colors={colors} />
            </View>
          </View>
        </View>

        {/* Content with SafeAreaView for bottom inset */}
        <SafeAreaView style={styles.contentContainer} edges={[]}>
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search conversations..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Conversations List */}
          {state.conversations.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color={colors.textSecondary} />
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptyText}>Start a conversation with someone!</Text>
            </View>
          ) : (
            <FlatList
              data={filteredConversations}
              renderItem={renderConversationItem}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.conversationsList}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No matching conversations</Text>
                </View>
              }
            />
          )}
        </SafeAreaView>
      </View>
    );
  }

  // Chat View
  const otherParticipant = getOtherParticipant(state.currentConversation);
  const otherUser = getUser(otherParticipant || '');

  return (
    <KeyboardAvoidingView
      style={styles.safeArea}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header - Restored redundant Conversations Header */}
      <View style={styles.conversationsHeader}>
        <View style={styles.conversationsHeaderContent}>
          <Text style={styles.conversationsHeaderTitle}>Messages</Text>
          <View style={styles.headerRightContainer}>
            <NotificationsButton navigation={navigation} colors={colors} />
            <UserAvatar navigation={navigation} currentUser={currentUser} colors={colors} />
          </View>
        </View>
      </View>

      {/* Chat Header - Surface Header */}
      <View style={[styles.chatHeader, { backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={handleBackToConversations} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.chatHeaderUser}
          onPress={() => navigation.navigate('Profile', { userId: otherParticipant })}
        >
          {otherUser?.photoURL ? (
            <CachedImage uri={otherUser.photoURL} style={styles.chatHeaderAvatar} />
          ) : (
            <View style={styles.chatHeaderAvatarPlaceholder}>
              <Text style={styles.chatHeaderAvatarText}>
                {getUserInitials(getUserDisplayName(otherUser))}
              </Text>
            </View>
          )}
          <View style={styles.chatHeaderInfo}>
            <View style={styles.chatHeaderNameContainer}>
              {otherUser?.isAdmin && (
                <View style={styles.adminBadgeSmall}>
                  <Text style={styles.adminBadgeTextSmall}>ADMIN</Text>
                </View>
              )}
              <Text style={styles.chatHeaderName} numberOfLines={1}>
                {getUserDisplayName(otherUser)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View>
          <TouchableOpacity style={styles.headerIconButton}>
            <Ionicons name="ellipsis-vertical" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Content with SafeAreaView for bottom inset */}
      <SafeAreaView style={styles.contentContainer} edges={[]}>
        {/* Messages List */}
        <View style={styles.messagesContainer}>
          {state.loadingConversations.has(state.currentConversation.id) &&
            state.messages.length === 0 ? (
            <View style={styles.emptyMessagesContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading messages...</Text>
            </View>
          ) : state.messages.length === 0 ? (
            <View style={styles.emptyMessagesContainer}>
              <Ionicons name="chatbubble-outline" size={64} color={colors.textSecondary} />
              <Text style={styles.emptyMessagesTitle}>No messages yet</Text>
              <Text style={styles.emptyMessagesText}>Start the conversation!</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={[...optimisticMessages, ...state.messages]}
              renderItem={renderMessage}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.messagesList}
              showsVerticalScrollIndicator={false}
              inverted
              onEndReached={() => {
                if (state.hasMoreMessages && !state.isLoadingMore) {
                  loadMoreMessages(state.currentConversation?.id || '');
                }
              }}
              onEndReachedThreshold={0.2}
              ListFooterComponent={
                state.isLoadingMore ? (
                  <View style={{ paddingVertical: 10 }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : null
              }
            />
          )}
        </View>

        {state.isRequestMode && (
          <View style={styles.requestBanner}>
            <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
            <Text style={styles.requestBannerText}>
              Send message request to <Text style={{ fontWeight: 'bold' }}>{state.currentConversation ? (getUserDisplayName(getUser(getOtherParticipant(state.currentConversation) || ''))) : ''}</Text>, you can only send one direct message until they accept your request or reply.
            </Text>
          </View>
        )}

        {/* WhatsApp-Style Reply/Edit Banner */}
        {(replyingTo || editingMessage) && (
          <View style={[
            styles.actionBanner,
            { borderTopWidth: 1, borderTopColor: colors.border }
          ]}>
            <View style={[
              styles.actionBannerInner,
              { borderLeftColor: editingMessage ? colors.warning : colors.primary }
            ]}>
              <View style={{ flex: 1 }}>
                <Text style={[
                  styles.actionBannerTitle,
                  { color: editingMessage ? colors.warning : colors.primary }
                ]}>
                  {editingMessage ? 'Editing Message' : `${replyingTo?.senderId === currentUser?.uid ? 'You' : (getUser(replyingTo?.senderId || '')?.displayName || 'User')}`}
                </Text>
                <Text style={styles.actionBannerText} numberOfLines={1}>
                  {editingMessage ? editingMessage.content : replyingTo?.content}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setReplyingTo(null);
                  setEditingMessage(null);
                  if (editingMessage) setMessageInput('');
                }}
                style={styles.closeBannerButton}
              >
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Message Input */}
        <View style={[styles.inputContainer, !state.canSendMessage && styles.inputContainerDisabled]}>
          <View style={styles.inputWrapper}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={state.canSendMessage ? "Type a message..." : "Waiting for reply..."}
              placeholderTextColor={colors.textSecondary}
              value={messageInput}
              onChangeText={setMessageInput}
              multiline
              maxLength={1000}
              editable={state.canSendMessage}
            />
          </View>
          <TouchableOpacity
            style={[styles.sendButton, (!messageInput.trim() || sendingMessage || !state.canSendMessage) && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!messageInput.trim() || sendingMessage || !state.canSendMessage}
          >
            {sendingMessage ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* WhatsApp-Style Options Modal */}
      <Modal
        visible={optionsModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setOptionsModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.optionsModalOverlay}
          activeOpacity={1}
          onPress={() => setOptionsModalVisible(false)}
        >
          <View style={styles.optionsModalContent}>
            <View style={styles.optionsModalHeader}>
              <View style={[styles.optionsModalHeaderIndicator, { backgroundColor: colors.border }]} />
            </View>

            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                if (selectedMessage) {
                  handleSwipeToReply(selectedMessage);
                  setOptionsModalVisible(false);
                }
              }}
            >
              <Ionicons name="arrow-undo-outline" size={22} color={colors.text} />
              <Text style={styles.optionText}>Reply</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => selectedMessage && handleCopyMessage(selectedMessage.content)}
            >
              <Ionicons name="copy-outline" size={22} color={colors.text} />
              <Text style={styles.optionText}>Copy</Text>
            </TouchableOpacity>

            {selectedMessage?.senderId === currentUser?.uid && (Date.now() - (selectedMessage.timestamp || 0)) < 15 * 60 * 1000 && (
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => selectedMessage && handleEditInitiate(selectedMessage)}
              >
                <Ionicons name="create-outline" size={22} color={colors.primary} />
                <Text style={[styles.optionText, { color: colors.primary }]}>Edit</Text>
              </TouchableOpacity>
            )}

            {selectedMessage?.senderId === currentUser?.uid && (
              <TouchableOpacity
                style={[styles.optionItem, { borderBottomWidth: 0 }]}
                onPress={() => {
                  if (selectedMessage) {
                    setOptionsModalVisible(false);
                    handleDeleteMessage(selectedMessage.id, state.currentConversation?.id || '');
                  }
                }}
              >
                <Ionicons name="trash-outline" size={22} color={colors.error} />
                <Text style={[styles.optionText, { color: colors.error }]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Message</Text>
            <Text style={styles.modalText}>
              Are you sure you want to delete this message? This action cannot be undone.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setMessageToDelete(null);
                }}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonDelete]} onPress={confirmDeleteMessage}>
                <Text style={styles.modalButtonTextDelete}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const getStyles = (themeColors: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 12,
      color: themeColors.textSecondary,
      fontSize: 14,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: themeColors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: themeColors.textSecondary,
      textAlign: 'center',
    },
    emptyMessagesContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
    },
    emptyMessagesTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: themeColors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyMessagesText: {
      fontSize: 14,
      color: themeColors.textSecondary,
      textAlign: 'center',
    },
    dateSeparator: {
      alignItems: 'center',
      marginVertical: 20,
    },
    dateSeparatorText: {
      backgroundColor: themeColors.backgroundSecondary,
      color: themeColors.textSecondary,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 10,
      fontSize: 12,
      fontWeight: '600',
      overflow: 'hidden',
    },
    loginButton: {
      marginTop: 24,
      paddingHorizontal: 24,
      paddingVertical: 12,
      backgroundColor: themeColors.primary,
      borderRadius: 8,
    },
    loginButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: themeColors.primary,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: '#fff',
    },
    headerActions: {
      flexDirection: 'row',
      gap: 8,
    },
    headerButton: {
      padding: 8,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: themeColors.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      height: 40,
      color: themeColors.text,
      fontSize: 16,
      fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    conversationsList: {
      paddingVertical: 8,
    },
    conversationItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: themeColors.background,
    },
    conversationItemActive: {
      backgroundColor: themeColors.backgroundSecondary,
    },
    avatarContainer: {
      position: 'relative',
      marginRight: 12,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
    },
    avatarPlaceholder: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: themeColors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '600',
    },
    typingIndicator: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#34D399',
      borderWidth: 2,
      borderColor: themeColors.background,
    },
    conversationContent: {
      flex: 1,
    },
    conversationHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    nameContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 8,
    },
    adminBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      backgroundColor: themeColors.primary,
      borderRadius: 4,
    },
    adminBadgeText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '600',
    },
    conversationName: {
      fontSize: 16,
      fontWeight: '600',
      color: themeColors.text,
      flex: 1,
    },
    conversationTime: {
      fontSize: 12,
      color: themeColors.textSecondary,
    },
    conversationFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    lastMessage: {
      fontSize: 14,
      color: themeColors.textSecondary,
      flex: 1,
      marginRight: 8,
    },
    unreadBadge: {
      backgroundColor: themeColors.primary,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
    },
    unreadBadgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    chatContainer: {
      flex: 1,
    },
    chatHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 64,
      gap: 12,
    },
    backButton: {
      padding: 4,
    },
    chatHeaderUser: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    chatHeaderAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    chatHeaderAvatarPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: themeColors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    chatHeaderAvatarText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    chatHeaderInfo: {
      flex: 1,
    },
    chatHeaderNameContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chatHeaderName: {
      fontSize: 17,
      fontWeight: '700',
      color: themeColors.text,
    },
    headerIconButton: {
      padding: 8,
      borderRadius: 20,
    },
    adminBadgeSmall: {
      paddingHorizontal: 4,
      paddingVertical: 1,
      backgroundColor: themeColors.primary,
      borderRadius: 3,
    },
    adminBadgeTextSmall: {
      color: '#fff',
      fontSize: 8,
      fontWeight: '800',
    },
    chatHeaderStatus: {
      fontSize: 12,
      color: themeColors.success,
    },
    messagesContainer: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    messagesList: {
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    messageContainer: {
      width: '100%',
      marginVertical: 4,
    },
    messageContainerOwn: {
      alignItems: 'flex-end',
    },
    messageContainerOther: {
      alignItems: 'flex-start',
    },
    messageBubble: {
      maxWidth: '85%',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 1,
      elevation: 2,
    },
    messageContentWrapper: {
      flexDirection: 'column',
    },
    messageBubbleOwn: {
      backgroundColor: '#6D28D9',
      borderTopRightRadius: 4,
      borderBottomRightRadius: 18,
    },
    messageBubbleOther: {
      backgroundColor: themeColors.surface,
      borderTopLeftRadius: 4,
      borderBottomLeftRadius: 18,
    },
    messageText: {
      fontSize: 16,
      lineHeight: 22,
    },
    messageTextOwn: {
      color: '#fff',
    },
    messageTextOther: {
      color: themeColors.text,
    },
    messageFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginTop: 2,
      gap: 4,
    },
    messageFooterOwn: {
      alignSelf: 'flex-end',
    },
    messageFooterOther: {
      alignSelf: 'flex-end',
    },
    messageTime: {
      fontSize: 11,
      fontWeight: '400',
    },
    messageTimeOwn: {
      color: 'rgba(255,255,255,0.7)',
    },
    messageTimeOther: {
      color: themeColors.textSecondary,
    },
    checkmark: {
      marginLeft: 0,
    },
    deleteButton: {
      marginLeft: 8,
      padding: 4,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: 'transparent',
      gap: 12,
    },
    inputWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: themeColors.surface,
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 6,
      maxHeight: 120,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 2,
    },
    input: {
      flex: 1,
      color: themeColors.text,
      fontSize: 16,
      maxHeight: 100,
      paddingTop: 8,
      paddingBottom: 8,
    },
    attachButton: {
      padding: 4,
      marginLeft: 4,
    },
    sendButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: themeColors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: themeColors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
    },
    sendButtonDisabled: {
      backgroundColor: themeColors.border,
      shadowOpacity: 0,
      elevation: 0,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      backgroundColor: themeColors.backgroundSecondary,
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 400,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: themeColors.text,
      marginBottom: 12,
    },
    modalText: {
      fontSize: 14,
      color: themeColors.textSecondary,
      lineHeight: 20,
      marginBottom: 24,
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    modalButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    modalButtonCancel: {
      backgroundColor: themeColors.background,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    modalButtonDelete: {
      backgroundColor: '#EF4444',
    },
    modalButtonTextCancel: {
      color: themeColors.text,
      fontSize: 16,
      fontWeight: '600',
    },
    modalButtonTextDelete: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    conversationsHeader: {
      backgroundColor: themeColors.primary,
      paddingTop: 50,
      paddingBottom: 10,
      paddingHorizontal: 16,
    },
    conversationsHeaderContent: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    conversationsHeaderTitle: {
      color: '#fff',
      fontSize: 20,
      fontWeight: '600',
      fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    headerRightContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    contentContainer: {
      flex: 1,
    },
    requestBanner: {
      flexDirection: 'row',
      backgroundColor: themeColors.backgroundSecondary,
      padding: 12,
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: 12,
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    requestBannerText: {
      flex: 1,
      fontSize: 13,
      color: themeColors.textSecondary,
      lineHeight: 18,
    },
    inputContainerDisabled: {
      opacity: 0.7,
    },
    actionBanner: {
      backgroundColor: themeColors.background,
      paddingHorizontal: 12,
      paddingTop: 8,
    },
    actionBannerInner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: themeColors.backgroundSecondary,
      borderRadius: 8,
      padding: 8,
      borderLeftWidth: 4,
    },
    actionBannerTitle: {
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 2,
    },
    actionBannerText: {
      fontSize: 13,
      color: themeColors.textSecondary,
    },
    closeBannerButton: {
      padding: 4,
    },
    optionsModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    optionsModalContent: {
      backgroundColor: themeColors.background,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingBottom: Platform.OS === 'ios' ? 40 : 20,
      paddingHorizontal: 16,
    },
    optionsModalHeader: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    optionsModalHeaderIndicator: {
      width: 40,
      height: 4,
      borderRadius: 2,
    },
    optionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: themeColors.border,
    },
    optionText: {
      fontSize: 16,
      color: themeColors.text,
      marginLeft: 16,
      fontWeight: '500',
    },
  });