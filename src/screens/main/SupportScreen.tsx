import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const SupportScreen = ({ navigation }: any) => {
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

  const faqData: FAQItem[] = [
    {
      id: '1',
      question: 'How do I submit a novel?',
      answer: 'Navigate to the "Submit" section, fill out the novel details including title, description, genre, and content. Your novel will be published immediately.',
      category: 'content',
    },
    {
      id: '2',
      question: 'How do I read novels?',
      answer: 'Browse our library in the Browse tab, tap on any novel that interests you, and start reading. You can save novels to your library for easy access later.',
      category: 'reading',
    },
    {
      id: '3',
      question: 'How do I change my password?',
      answer: 'Go to Settings, then tap "Change Password". Enter your current password and new password. Make sure your new password is strong and unique.',
      category: 'account',
    },
    {
      id: '4',
      question: 'How do I add tip information to my profile?',
      answer: 'Go to your profile and tap "Edit Profile". In the edit modal, add your support link or bank details in the Support Link field. This can be a payment URL (PayPal, Ko-fi, etc.) or bank details.',
      category: 'account',
    },
    {
      id: '5',
      question: 'How do I track my ticket status?',
      answer: 'You can track your ticket status in "My Tickets" screen. View the status of your tickets and responses from the support team.',
      category: 'support',
    },
  ];

  const categories = [
    { id: 'all', name: 'All Topics' },
    { id: 'account', name: 'Account' },
    { id: 'content', name: 'Content' },
    { id: 'reading', name: 'Reading' },
    { id: 'support', name: 'Support' },
  ];

  const subjects = [
    { value: '', label: 'Select a subject' },
    { value: 'general', label: 'General Inquiry' },
    { value: 'technical', label: 'Technical Support' },
    { value: 'content', label: 'Content Issues' },
    { value: 'account', label: 'Account Help' },
    { value: 'payment', label: 'Payment Issues' },
    { value: 'feedback', label: 'Feedback & Suggestions' },
    { value: 'bug', label: 'Bug Report' },
    { value: 'other', label: 'Other' },
  ];

  const generateTicketId = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TKT-${timestamp}-${random}`;
  };

  const handleSubmit = async () => {
    if (!subject || !message.trim()) {
      Alert.alert('Error', 'Please fill out all fields');
      return;
    }

    setLoading(true);

    try {
      const ticketId = generateTicketId();

      await addDoc(collection(db, 'support_messages'), {
        name: currentUser?.displayName || 'Guest User',
        email: currentUser?.email || 'no-email@example.com',
        userId: currentUser?.uid,
        subject: subject,
        message: message,
        ticketId: ticketId,
        status: 'unread',
        createdAt: new Date().toISOString(),
        timestamp: new Date(),
        responses: [],
      });

      Alert.alert(
        'Success',
        `Your support ticket has been submitted!\n\nTicket ID: ${ticketId}\n\nYou can track your ticket in "My Tickets" screen.`,
        [
          {
            text: 'View Tickets',
            onPress: () => navigation.navigate('MyTickets'),
          },
          { text: 'OK' },
        ]
      );

      setSubject('');
      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredFAQs = faqData.filter((faq) => {
    const matchesSearch =
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleFAQ = (id: string) => {
    setExpandedFAQ(expandedFAQ === id ? null : id);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="help-circle" size={32} color="#fff" />
          </View>
          <Text style={styles.title}>How can we help you?</Text>
          <Text style={styles.subtitle}>Find answers or get in touch with support</Text>
          <TouchableOpacity
            style={styles.myTicketsButton}
            onPress={() => navigation.navigate('MyTickets')}
          >
            <Ionicons name="ticket-outline" size={20} color="#A78BFA" />
            <Text style={styles.myTicketsText}>View My Tickets</Text>
          </TouchableOpacity>
        </View>

        {/* FAQ Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search FAQs..."
              placeholderTextColor="#6B7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Category Filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {categories.map((category) => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.categoryButton,
                  selectedCategory === category.id && styles.categoryButtonActive,
                ]}
                onPress={() => setSelectedCategory(category.id)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    selectedCategory === category.id && styles.categoryTextActive,
                  ]}
                >
                  {category.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* FAQ List */}
          <View style={styles.faqList}>
            {filteredFAQs.map((faq) => (
              <View key={faq.id} style={styles.faqItem}>
                <TouchableOpacity
                  style={styles.faqHeader}
                  onPress={() => toggleFAQ(faq.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.faqQuestion}>{faq.question}</Text>
                  <Ionicons
                    name={expandedFAQ === faq.id ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#9CA3AF"
                  />
                </TouchableOpacity>
                {expandedFAQ === faq.id && (
                  <View style={styles.faqAnswer}>
                    <Text style={styles.faqAnswerText}>{faq.answer}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Contact Form */}
        <View style={styles.section}>
          <View style={styles.contactHeader}>
            <View style={styles.contactIconContainer}>
              <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
            </View>
            <View>
              <Text style={styles.contactTitle}>Still need help?</Text>
              <Text style={styles.contactSubtitle}>Send us a message</Text>
            </View>
          </View>

          <View style={styles.form}>
            {/* Name (Read-only) */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Full Name <Text style={styles.labelNote}>(from your account)</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.inputReadOnly]}
                value={currentUser?.displayName || ''}
                editable={false}
              />
            </View>

            {/* Email (Read-only) */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Email Address <Text style={styles.labelNote}>(from your account)</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.inputReadOnly]}
                value={currentUser?.email || ''}
                editable={false}
              />
            </View>

            {/* Subject Picker */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Subject *</Text>
              <View style={styles.pickerContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.pickerRow}>
                    {subjects.slice(1).map((item) => (
                      <TouchableOpacity
                        key={item.value}
                        style={[
                          styles.pickerButton,
                          subject === item.value && styles.pickerButtonActive,
                        ]}
                        onPress={() => setSubject(item.value)}
                      >
                        <Text
                          style={[
                            styles.pickerButtonText,
                            subject === item.value && styles.pickerButtonTextActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>

            {/* Message */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Message *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={message}
                onChangeText={setMessage}
                placeholder="Tell us how we can help you..."
                placeholderTextColor="#6B7280"
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={20} color="#fff" />
                  <Text style={styles.submitButtonText}>Send Message</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Contact Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Get in Touch</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="mail" size={20} color="#A78BFA" />
              </View>
              <View>
                <Text style={styles.infoTitle}>Email Support</Text>
                <Text style={styles.infoText}>n0velnest999@gmail.com</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="time" size={20} color="#10B981" />
              </View>
              <View>
                <Text style={styles.infoTitle}>Response Time</Text>
                <Text style={styles.infoText}>Within 24 hours</Text>
              </View>
            </View>
          </View>
        </View>

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
  header: {
    padding: 20,
    alignItems: 'center' as const,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: themeColors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: themeColors.text,
    textAlign: 'center' as const,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: themeColors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: 16,
  },
  myTicketsButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: themeColors.primary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.primary,
  },
  myTicketsText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600' as const,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: themeColors.text,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: themeColors.text,
    fontSize: 15,
  },
  categoryScroll: {
    marginBottom: 16,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: themeColors.surface,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  categoryButtonActive: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  categoryText: {
    color: themeColors.textSecondary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  categoryTextActive: {
    color: '#fff',
  },
  faqList: {
    gap: 12,
  },
  faqItem: {
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
    overflow: 'hidden' as const,
  },
  faqHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: 16,
  },
  faqQuestion: {
    flex: 1,
    color: themeColors.text,
    fontSize: 15,
    fontWeight: '600' as const,
    marginRight: 12,
  },
  faqAnswer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  faqAnswerText: {
    color: themeColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  contactHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 20,
  },
  contactIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: themeColors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
  },
  contactTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: themeColors.text,
  },
  contactSubtitle: {
    fontSize: 14,
    color: themeColors.textSecondary,
  },
  form: {
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    padding: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: themeColors.text,
    marginBottom: 8,
  },
  labelNote: {
    fontSize: 12,
    color: themeColors.textSecondary,
    fontWeight: 'normal' as const,
  },
  input: {
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
    borderRadius: 8,
    padding: 12,
    color: themeColors.text,
    fontSize: 15,
  },
  inputReadOnly: {
    opacity: 0.6,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top' as const,
  },
  pickerContainer: {
    marginBottom: 8,
  },
  pickerRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  pickerButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: themeColors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  pickerButtonActive: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  pickerButtonText: {
    color: themeColors.textSecondary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  pickerButtonTextActive: {
    color: '#fff',
  },
  submitButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: themeColors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  infoCard: {
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  infoRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: themeColors.card,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: themeColors.text,
  },
  infoText: {
    fontSize: 13,
    color: themeColors.textSecondary,
  },
});

export default SupportScreen;