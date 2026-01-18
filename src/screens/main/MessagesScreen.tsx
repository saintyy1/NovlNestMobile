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
} from 'react-native';
// SafeAreaView removed - using View instead to allow header to extend under status bar
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useChat, ChatConversation, ChatMessage } from '../../contexts/ChatContext';
import { useNotifications } from '../../contexts/NotificationContext';

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
        <Image
          source={{ uri: currentUser.photoURL }}
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

export const MessagesScreen = ({ navigation, route }: any) => {
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const {
    state,
    loadConversations,
    setCurrentConversation,
    markAsRead,
    sendMessage,
    deleteMessage,
    loadMoreMessages,
    getUser,
    fetchUserData,
  } = useChat();

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
          });
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [route.params?.userId, currentUser?.uid]);

  const handleConversationSelect = (conversation: ChatConversation) => {
    setCurrentConversation(conversation);
    markAsRead(conversation.id);
  };

  const handleBackToConversations = () => {
    setCurrentConversation(null);
    // Clear the userId param to prevent re-opening the conversation
    navigation.setParams({ userId: undefined });
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !state.currentConversation || !currentUser) return;

    const receiverId = state.currentConversation.participants.find(id => id !== currentUser.uid);
    if (!receiverId) return;

    setSendingMessage(true);
    try {
      await sendMessage(receiverId, messageInput.trim(), 'text');
      setMessageInput('');

      // Scroll to bottom after sending
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
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
      Alert.alert('Error', 'Failed to delete message');
    }
  };

  const getOtherParticipant = (conversation: ChatConversation) => {
    if (!currentUser) return null;
    return conversation.participants.find(id => id !== currentUser.uid);
  };

  const getUserInitials = (name: string) => {
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
            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {user?.displayName ? getUserInitials(user.displayName) : 'U'}
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
                {user?.displayName || `User ${otherParticipant?.slice(-4)}`}
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

  // Render message bubble
  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isOwn = item.senderId === currentUser?.uid;
    const showDate = index === 0 || !isSameDay(item.timestamp, state.messages[index - 1]?.timestamp);

    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>{formatDateSeparator(item.timestamp)}</Text>
          </View>
        )}
        <View style={[styles.messageContainer, isOwn ? styles.messageContainerOwn : styles.messageContainerOther]}>
          <View style={[styles.messageBubble, isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther]}>
            <Text style={[styles.messageText, isOwn ? styles.messageTextOwn : styles.messageTextOther]}>
              {item.content}
            </Text>
            <View style={styles.messageFooter}>
              <Text style={[styles.messageTime, isOwn ? styles.messageTimeOwn : styles.messageTimeOther]}>
                {formatMessageTime(item.timestamp)}
              </Text>
              {isOwn && (
                <Ionicons
                  name={item.read ? 'checkmark-done' : 'checkmark'}
                  size={16}
                  color={item.read ? '#34D399' : '#9CA3AF'}
                  style={styles.checkmark}
                />
              )}
            </View>
          </View>
          {isOwn && (
            <TouchableOpacity
              onPress={() => handleDeleteMessage(item.id, state.currentConversation?.id || '')}
              style={styles.deleteButton}
            >
              <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
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

  if (state.isLoading && state.conversations.length === 0) {
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
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

        {/* Chat Header */}
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={handleBackToConversations} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.chatHeaderUser}
            onPress={() => navigation.navigate('Profile', { userId: otherParticipant })}
          >
            {otherUser?.photoURL ? (
              <Image source={{ uri: otherUser.photoURL }} style={styles.chatHeaderAvatar} />
            ) : (
              <View style={styles.chatHeaderAvatarPlaceholder}>
                <Text style={styles.chatHeaderAvatarText}>
                  {otherUser?.displayName ? getUserInitials(otherUser.displayName) : 'U'}
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
                  {otherUser?.displayName || `User ${otherParticipant?.slice(-4)}`}
                </Text>
              </View>
              <Text style={styles.chatHeaderStatus}>
                {state.currentConversation.isTyping ? 'typing...' : 'Online'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerButton}>
            <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Content with SafeAreaView for bottom inset */}
        <SafeAreaView style={styles.contentContainer} edges={[]}>
          {/* Messages List */}
          <View style={styles.messagesContainer}>
            {state.loadingConversations.has(state.currentConversation.id) ? (
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
                data={state.messages}
                renderItem={renderMessage}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.messagesList}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                ListHeaderComponent={
                  state.hasMoreMessages ? (
                    <TouchableOpacity
                      style={styles.loadMoreButton}
                      onPress={() => loadMoreMessages(state.currentConversation?.id || '')}
                      disabled={state.isLoadingMore}
                    >
                      {state.isLoadingMore ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={styles.loadMoreText}>Load More Messages</Text>
                      )}
                    </TouchableOpacity>
                  ) : null
                }
              />
            )}
          </View>

          {/* Message Input */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="Type a message..."
                placeholderTextColor={colors.textSecondary}
                value={messageInput}
                onChangeText={setMessageInput}
                multiline
                maxLength={1000}
              />
            </View>
            <TouchableOpacity
              style={[styles.sendButton, !messageInput.trim() && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!messageInput.trim() || sendingMessage}
            >
              {sendingMessage ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>

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
    </View>
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
      paddingHorizontal: 8,
      paddingVertical: 12,
      backgroundColor: themeColors.primary,
      gap: 8,
      minHeight: 56,
    },
    backButton: {
      padding: 8,
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
      backgroundColor: 'rgba(255,255,255,0.2)',
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
    adminBadgeSmall: {
      paddingHorizontal: 4,
      paddingVertical: 2,
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: 3,
    },
    adminBadgeTextSmall: {
      color: '#fff',
      fontSize: 9,
      fontWeight: '600',
    },
    chatHeaderName: {
      fontSize: 16,
      fontWeight: '600',
      color: '#fff',
      flex: 1,
    },
    chatHeaderStatus: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.7)',
    },
    messagesContainer: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    messagesList: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    emptyMessagesContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyMessagesTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: themeColors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyMessagesText: {
      fontSize: 14,
      color: themeColors.textSecondary,
    },
    loadMoreButton: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    loadMoreText: {
      color: themeColors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    dateSeparator: {
      alignItems: 'center',
      marginVertical: 16,
    },
    dateSeparatorText: {
      fontSize: 12,
      color: themeColors.textSecondary,
      backgroundColor: themeColors.backgroundSecondary,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    messageContainer: {
      marginVertical: 4,
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    messageContainerOwn: {
      justifyContent: 'flex-end',
    },
    messageContainerOther: {
      justifyContent: 'flex-start',
    },
    messageBubble: {
      maxWidth: '75%',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
    },
    messageBubbleOwn: {
      backgroundColor: '#075E54',
      borderBottomRightRadius: 4,
    },
    messageBubbleOther: {
      backgroundColor: '#1F2937',
      borderBottomLeftRadius: 4,
    },
    messageText: {
      fontSize: 15,
      lineHeight: 20,
    },
    messageTextOwn: {
      color: '#fff',
    },
    messageTextOther: {
      color: '#E5E5E5',
    },
    messageFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginTop: 4,
      gap: 4,
    },
    messageTime: {
      fontSize: 11,
    },
    messageTimeOwn: {
      color: 'rgba(255,255,255,0.6)',
    },
    messageTimeOther: {
      color: '#9CA3AF',
    },
    checkmark: {
      marginLeft: 2,
    },
    deleteButton: {
      marginLeft: 8,
      padding: 4,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 8,
      paddingVertical: 8,
      backgroundColor: themeColors.backgroundSecondary,
      borderTopWidth: 1,
      borderTopColor: themeColors.border,
      gap: 8,
    },
    inputWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: themeColors.background,
      borderRadius: 24,
      paddingHorizontal: 12,
      paddingVertical: 8,
      maxHeight: 120,
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
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: themeColors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.5,
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
  });