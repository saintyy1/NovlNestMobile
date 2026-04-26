import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

interface SupportTicket {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'unread' | 'in-progress' | 'resolved';
  createdAt: string;
  ticketId?: string;
  responses?: {
    adminName: string;
    adminId: string;
    message: string;
    timestamp: string;
  }[];
  userId?: string;
}

const MyTicketsScreen = ({ navigation }: any) => {
  const { currentUser } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors, isDark);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const ticketsQuery = query(
      collection(db, 'support_messages'),
      where('userId', '==', currentUser.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(ticketsQuery, (snapshot) => {
      const fetchedTickets: SupportTicket[] = [];
      snapshot.forEach((doc) => {
        fetchedTickets.push({ id: doc.id, ...doc.data() } as SupportTicket);
      });
      setTickets(fetchedTickets);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'unread':
        return { color: '#EF4444', label: 'Unread', icon: 'alert-circle' };
      case 'in-progress':
        return { color: '#F59E0B', label: 'In Progress', icon: 'time' };
      case 'resolved':
        return { color: '#10B981', label: 'Resolved', icon: 'checkmark-circle' };
      default:
        return { color: colors.textSecondary, label: 'Unknown', icon: 'help-circle' };
    }
  };

  const conversationThread = useMemo(() => {
    if (!selectedTicket) return [];

    const messages = [
      {
        id: 'root',
        type: 'user',
        senderName: selectedTicket.name,
        message: selectedTicket.message,
        timestamp: selectedTicket.createdAt,
      }
    ];

    if (selectedTicket.responses) {
      selectedTicket.responses.forEach((resp, idx) => {
        messages.push({
          id: `resp-${idx}`,
          type: 'support',
          senderName: resp.adminName,
          message: resp.message,
          timestamp: resp.timestamp,
        });
      });
    }

    // Sort by timestamp if necessary, though root is always first
    return messages;
  }, [selectedTicket]);

  const formatMessageDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' +
      date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const renderTicketList = () => (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16 }}
    >
      <View style={styles.listHeader}>
        <TouchableOpacity 
          style={styles.backButtonList} 
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.listHeaderTitle}>Support Tickets</Text>
        <Text style={styles.listHeaderSubtitle}>{tickets.length} Active Tickets</Text>
      </View>

      {tickets.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="chatbubbles-outline" size={40} color={colors.textSecondary} />
          </View>
          <Text style={styles.emptyTitle}>No tickets found</Text>
          <Text style={styles.emptySubtitle}>When you contact support, your tickets will appear here.</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Support')}
          >
            <Text style={styles.actionButtonText}>Open a Ticket</Text>
          </TouchableOpacity>
        </View>
      ) : (
        tickets.map((ticket) => {
          const status = getStatusConfig(ticket.status);
          return (
            <TouchableOpacity
              key={ticket.id}
              style={styles.ticketCard}
              activeOpacity={0.7}
              onPress={() => setSelectedTicket(ticket)}
            >
              <View style={styles.ticketCardHeader}>
                <View style={[styles.statusPill, { backgroundColor: status.color + '20' }]}>
                  <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                  <Text style={[styles.statusPillText, { color: status.color }]}>{status.label}</Text>
                </View>
                <Text style={styles.ticketCardDate}>{new Date(ticket.createdAt).toLocaleDateString()}</Text>
              </View>

              <Text style={styles.ticketCardSubject} numberOfLines={1}>{ticket.subject}</Text>
              <Text style={styles.ticketCardMessage} numberOfLines={2}>{ticket.message}</Text>

              <View style={styles.ticketCardFooter}>
                <Text style={styles.ticketIdText}>ID: #{ticket.ticketId || ticket.id.substring(0, 8).toUpperCase()}</Text>
                {ticket.responses && ticket.responses.length > 0 && (
                  <View style={styles.replyBadge}>
                    <Ionicons name="return-down-forward" size={14} color={colors.primary} />
                    <Text style={styles.replyBadgeText}>{ticket.responses.length} Replies</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );

  const renderConversation = () => {
    if (!selectedTicket) return null;
    const status = getStatusConfig(selectedTicket.status);

    return (
      <View style={styles.detailContainer}>
        {/* Detail Header */}
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={() => setSelectedTicket(null)} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.detailHeaderInfo}>
            <Text style={styles.detailHeaderTitle} numberOfLines={1}>{selectedTicket.subject}</Text>
            <Text style={styles.detailHeaderSubtitle}>Ticket #{selectedTicket.ticketId || selectedTicket.id.substring(0, 8).toUpperCase()}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Support')} style={styles.headerIconButton}>
            <Ionicons name="add-circle-outline" size={26} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Status Bar */}
        <View style={[styles.statusBar, { borderBottomColor: colors.border }]}>
          <Ionicons name={status.icon as any} size={18} color={status.color} />
          <Text style={[styles.statusBarText, { color: status.color }]}>Status: {status.label}</Text>
        </View>

        <ScrollView
          style={styles.chatScroll}
          contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        >
          {conversationThread.map((msg) => {
            const isUser = msg.type === 'user';
            return (
              <View
                key={msg.id}
                style={[
                  styles.bubbleWrapper,
                  isUser ? styles.bubbleWrapperUser : styles.bubbleWrapperSupport
                ]}
              >
                {!isUser && (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{msg.senderName.charAt(0)}</Text>
                  </View>
                )}
                <View style={styles.bubbleContent}>
                  {!isUser && <Text style={styles.senderName}>{msg.senderName}</Text>}
                  <View
                    style={[
                      styles.bubble,
                      isUser ? styles.bubbleUser : styles.bubbleSupport
                    ]}
                  >
                    <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
                      {msg.message}
                    </Text>
                  </View>
                  <Text style={[styles.bubbleTime, isUser && { textAlign: 'right' }]}>
                    {formatMessageDate(msg.timestamp)}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {selectedTicket ? renderConversation() : renderTicketList()}
    </SafeAreaView>
  );
};

const getStyles = (themeColors: any, isDark: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: themeColors.background,
  },
  listHeader: {
    marginBottom: 24
  },
  backButtonList: {
    marginLeft: -8,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  listHeaderTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: themeColors.text,
    letterSpacing: -0.5,
  },
  listHeaderSubtitle: {
    fontSize: 16,
    color: themeColors.textSecondary,
    marginTop: 0,
  },
  ticketCard: {
    backgroundColor: themeColors.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.3 : 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
    }),
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  ticketCardDate: {
    fontSize: 12,
    color: themeColors.textSecondary,
  },
  ticketCardSubject: {
    fontSize: 18,
    fontWeight: 'bold',
    color: themeColors.text,
    marginBottom: 6,
  },
  ticketCardMessage: {
    fontSize: 14,
    color: themeColors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  ticketCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  ticketIdText: {
    fontSize: 12,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  replyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: themeColors.primary,
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: themeColors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: themeColors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: themeColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
    marginBottom: 24,
  },
  actionButton: {
    backgroundColor: themeColors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  detailContainer: {
    flex: 1,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  backButton: {
    padding: 8,
  },
  detailHeaderInfo: {
    flex: 1,
    marginLeft: 4,
  },
  detailHeaderTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: themeColors.text,
  },
  detailHeaderSubtitle: {
    fontSize: 12,
    color: themeColors.textSecondary,
    marginTop: 1,
  },
  headerIconButton: {
    padding: 8,
    marginRight: 4,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: themeColors.surface,
    borderBottomWidth: 1,
  },
  statusBarText: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  chatScroll: {
    flex: 1,
  },
  bubbleWrapper: {
    flexDirection: 'row',
    marginBottom: 20,
    maxWidth: '85%',
  },
  bubbleWrapperUser: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  bubbleWrapperSupport: {
    alignSelf: 'flex-start',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: themeColors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  bubbleContent: {
    flex: 1,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: themeColors.textSecondary,
    marginBottom: 4,
    marginLeft: 4,
  },
  bubble: {
    padding: 14,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleUser: {
    backgroundColor: themeColors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleSupport: {
    backgroundColor: themeColors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
    color: themeColors.text,
  },
  bubbleTextUser: {
    color: '#fff',
  },
  bubbleTime: {
    fontSize: 11,
    color: themeColors.textSecondary,
    marginTop: 6,
    marginHorizontal: 4,
  },
});

export default MyTicketsScreen;