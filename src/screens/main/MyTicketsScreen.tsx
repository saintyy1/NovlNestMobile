import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  const { colors } = useTheme();
  const styles = getStyles(colors);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'unread':
        return { bg: '#7F1D1D', text: '#FCA5A5', border: '#991B1B' };
      case 'in-progress':
        return { bg: '#78350F', text: '#FCD34D', border: '#92400E' };
      case 'resolved':
        return { bg: '#14532D', text: '#86EFAC', border: '#166534' };
      default:
        return { bg: '#374151', text: '#9CA3AF', border: '#4B5563' };
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'unread':
        return 'alert-circle';
      case 'in-progress':
        return 'time';
      case 'resolved':
        return 'checkmark-circle';
      default:
        return 'chatbubble-ellipses';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.iconContainer}>
              <Ionicons name="ticket" size={24} color="#fff" />
            </View>
            <Text style={styles.title}>My Support Tickets</Text>
            <Text style={styles.subtitle}>View your support requests and responses</Text>
          </View>
        </View>

        {tickets.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="ticket-outline" size={80} color="#4B5563" />
            </View>
            <Text style={styles.emptyTitle}>No support tickets yet</Text>
            <Text style={styles.emptyText}>You haven't submitted any support requests</Text>
            <TouchableOpacity
              style={styles.contactButton}
              onPress={() => navigation.navigate('Support')}
            >
              <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
              <Text style={styles.contactButtonText}>Contact Support</Text>
            </TouchableOpacity>
          </View>
        ) : selectedTicket ? (
          // Ticket Details View
          <View style={styles.detailsContainer}>
            <TouchableOpacity
              style={styles.backToListButton}
              onPress={() => setSelectedTicket(null)}
            >
              <Ionicons name="arrow-back" size={20} color="#A78BFA" />
              <Text style={styles.backToListText}>Back to List</Text>
            </TouchableOpacity>

            <View style={styles.detailsCard}>
              {/* Header */}
              <View style={styles.detailsHeader}>
                <Text style={styles.detailsTitle}>{selectedTicket.subject}</Text>
                <View style={styles.detailsInfo}>
                  {selectedTicket.ticketId && (
                    <View style={styles.ticketIdBadge}>
                      <Text style={styles.ticketIdText}>#{selectedTicket.ticketId}</Text>
                    </View>
                  )}
                  <Text style={styles.detailsDate}>
                    {new Date(selectedTicket.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(selectedTicket.status).bg },
                  ]}
                >
                  <Ionicons
                    name={getStatusIcon(selectedTicket.status) as any}
                    size={16}
                    color={getStatusColor(selectedTicket.status).text}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: getStatusColor(selectedTicket.status).text },
                    ]}
                  >
                    {selectedTicket.status.replace('-', ' ').toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Original Message */}
              <View style={styles.messageSection}>
                <Text style={styles.messageSectionTitle}>YOUR MESSAGE</Text>
                <View style={styles.messageCard}>
                  <Text style={styles.messageText}>{selectedTicket.message}</Text>
                  <View style={styles.messageDivider} />
                  <Text style={styles.messageDate}>
                    Submitted on {new Date(selectedTicket.createdAt).toLocaleString()}
                  </Text>
                </View>
              </View>

              {/* Responses */}
              {selectedTicket.responses && selectedTicket.responses.length > 0 ? (
                <View style={styles.responsesSection}>
                  <Text style={styles.messageSectionTitle}>SUPPORT TEAM RESPONSES</Text>
                  {selectedTicket.responses.map((response, index) => (
                    <View key={index} style={styles.responseCard}>
                      <View style={styles.responseHeader}>
                        <View style={styles.responseAvatar}>
                          <Text style={styles.responseAvatarText}>
                            {response.adminName.charAt(0)}
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.responseAdminName}>{response.adminName}</Text>
                          <Text style={styles.responseDate}>
                            {new Date(response.timestamp).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.responseText}>{response.message}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.noResponsesCard}>
                  <Ionicons name="time-outline" size={64} color="#4B5563" />
                  <Text style={styles.noResponsesTitle}>No responses yet</Text>
                  <Text style={styles.noResponsesText}>
                    Our support team will respond within 24 hours
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          // Tickets List View
          <View style={styles.ticketsList}>
            {tickets.map((ticket) => (
              <TouchableOpacity
                key={ticket.id}
                style={styles.ticketCard}
                onPress={() => setSelectedTicket(ticket)}
                activeOpacity={0.7}
              >
                <View style={styles.ticketHeader}>
                  <Text style={styles.ticketSubject} numberOfLines={1}>
                    {ticket.subject}
                  </Text>
                  <View
                    style={[
                      styles.ticketStatusBadge,
                      {
                        backgroundColor: getStatusColor(ticket.status).bg,
                        borderColor: getStatusColor(ticket.status).border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={getStatusIcon(ticket.status) as any}
                      size={14}
                      color={getStatusColor(ticket.status).text}
                    />
                    <Text
                      style={[styles.ticketStatusText, { color: getStatusColor(ticket.status).text }]}
                    >
                      {ticket.status.replace('-', ' ')}
                    </Text>
                  </View>
                </View>
                {ticket.ticketId && (
                  <View style={styles.ticketIdContainer}>
                    <Text style={styles.ticketIdSmall}>#{ticket.ticketId}</Text>
                  </View>
                )}
                <Text style={styles.ticketMessage} numberOfLines={2}>
                  {ticket.message}
                </Text>
                <View style={styles.ticketFooter}>
                  <Text style={styles.ticketDate}>
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </Text>
                  {ticket.responses && ticket.responses.length > 0 && (
                    <Text style={styles.ticketReplies}>
                      {ticket.responses.length} {ticket.responses.length === 1 ? 'reply' : 'replies'}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const getStyles = (themeColors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  header: {
    padding: 20,
  },
  backButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 24,
  },
  backText: {
    color: themeColors.primary,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  headerContent: {
    gap: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: themeColors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: themeColors.text,
  },
  subtitle: {
    fontSize: 15,
    color: themeColors.textSecondary,
  },
  emptyContainer: {
    paddingHorizontal: 20,
    paddingVertical: 60,
    alignItems: 'center' as const,
    backgroundColor: themeColors.surface,
    marginHorizontal: 16,
    borderRadius: 16,
  },
  emptyIconContainer: {
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: themeColors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: themeColors.textSecondary,
    marginBottom: 24,
    textAlign: 'center' as const,
  },
  contactButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: themeColors.primary,
    borderRadius: 12,
  },
  contactButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  ticketsList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  ticketCard: {
    backgroundColor: themeColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  ticketHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 8,
    gap: 12,
  },
  ticketSubject: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600' as const,
    color: themeColors.text,
  },
  ticketStatusBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  ticketStatusText: {
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'capitalize' as const,
  },
  ticketIdContainer: {
    marginBottom: 8,
  },
  ticketIdSmall: {
    fontSize: 12,
    color: themeColors.primary,
    fontFamily: 'monospace',
  },
  ticketMessage: {
    fontSize: 14,
    color: themeColors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  ticketFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  ticketDate: {
    fontSize: 12,
    color: themeColors.textSecondary,
  },
  ticketReplies: {
    fontSize: 12,
    color: themeColors.primary,
    fontWeight: '600' as const,
  },
  detailsContainer: {
    paddingHorizontal: 16,
  },
  backToListButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 16,
  },
  backToListText: {
    color: themeColors.primary,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  detailsCard: {
    backgroundColor: themeColors.surface,
    borderRadius: 16,
    overflow: 'hidden' as const,
  },
  detailsHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    gap: 12,
  },
  detailsTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: themeColors.text,
  },
  detailsInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  ticketIdBadge: {
    backgroundColor: themeColors.primary + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.primary,
  },
  ticketIdText: {
    color: themeColors.primary,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600' as const,
  },
  detailsDate: {
    color: themeColors.textSecondary,
    fontSize: 13,
  },
  statusBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignSelf: 'flex-start' as const,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  messageSection: {
    padding: 20,
  },
  messageSectionTitle: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: themeColors.textSecondary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  messageCard: {
    backgroundColor: themeColors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  messageText: {
    color: themeColors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  messageDivider: {
    height: 1,
    backgroundColor: themeColors.border,
    marginVertical: 12,
  },
  messageDate: {
    color: themeColors.textSecondary,
    fontSize: 13,
  },
  responsesSection: {
    padding: 20,
    paddingTop: 0,
    gap: 12,
  },
  responseCard: {
    backgroundColor: themeColors.primary + '20',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: themeColors.primary,
  },
  responseHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 12,
  },
  responseAvatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: themeColors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  responseAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold' as const,
  },
  responseAdminName: {
    color: themeColors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  responseDate: {
    color: themeColors.textSecondary,
    fontSize: 12,
  },
  responseText: {
    color: themeColors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  noResponsesCard: {
    padding: 40,
    alignItems: 'center' as const,
    gap: 12,
  },
  noResponsesTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: themeColors.text,
  },
  noResponsesText: {
    fontSize: 14,
    color: themeColors.textSecondary,
    textAlign: 'center' as const,
  },
});

export default MyTicketsScreen;