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
  Modal,
  Linking,
  SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import CachedImage from '../../components/CachedImage';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../theme';
import { Novel } from '../../types/novel';
import {
  detectUserCurrency,
  convertFromNaira,
  formatCurrency,
  getAvailableCurrencies,
  getCurrencyByCode,
} from '../../utils/currencyUtils';

type Step = 'select-book' | 'choose-plan';

interface Plan {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  duration: string;
  features: string[];
  popular: boolean;
  icon: string;
}

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
    return url;
  }
};

export const PromoteScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const { currentUser, loading: authLoading } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<Novel | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>('select-book');
  const [userBooks, setUserBooks] = useState<Novel[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('NGN');
  const [showCurrencySelector, setShowCurrencySelector] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const styles = getStyles(colors);

  const plans: Plan[] = [
    {
      id: '1-month',
      name: 'Essential Boost',
      price: 1000,
      originalPrice: 1500,
      duration: '30 days',
      features: [
        'Promoted sections feature',
        'Increased visibility in search',
        'Priority in carousels',
        'Email support',
      ],
      popular: false,
      icon: '🚀',
    },
    {
      id: '2-months',
      name: 'Premium Growth',
      price: 2000,
      originalPrice: 2500,
      duration: '60 days',
      features: [
        'Everything in Essential Boost',
        'Extended promotion period',
        'Higher priority placement',
        'Priority customer support',
      ],
      popular: false,
      icon: '⭐',
    },
  ];

  useEffect(() => {
    const fetchUserBooks = async () => {
      if (!currentUser) return;

      try {
        const q = query(
          collection(db, 'novels'),
          where('authorId', '==', currentUser.uid),
          where('isPromoted', '==', false)
        );
        const querySnapshot = await getDocs(q);
        const books = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Novel[];
        setUserBooks(books);
      } catch (error) {
        console.error('Error fetching user books:', error);
      } finally {
        setLoadingBooks(false);
      }
    };

    if (currentUser) {
      fetchUserBooks();
    }
  }, [currentUser]);

  const handleBookSelect = (book: Novel) => {
    setSelectedBook(book);
    setCurrentStep('choose-plan');
  };

  const goBackToBookSelection = () => {
    setCurrentStep('select-book');
    setSelectedPlan(null);
  };

  const getDisplayPrice = (nairaPrice: number) => {
    if (selectedCurrency === 'NGN') {
      return formatCurrency(nairaPrice, 'NGN');
    }
    const convertedPrice = convertFromNaira(nairaPrice, selectedCurrency);
    return formatCurrency(convertedPrice, selectedCurrency);
  };

  const currentCurrency = getCurrencyByCode(selectedCurrency);

  const handlePayment = async () => {
    if (!selectedPlan || !selectedBook || !currentUser) return;

    setProcessingPayment(true);

    try {
      const selectedPlanData = plans.find((p) => p.id === selectedPlan);
      const bookId = selectedBook.id;

      // Store payment data in AsyncStorage for verification later
      await AsyncStorage.setItem(
        'pendingPromotionPayment',
        JSON.stringify({
          bookId: bookId,
          userId: currentUser.uid,
          planId: selectedPlan,
          novelTitle: selectedBook.title,
          planName: selectedPlanData?.name,
          planDuration: selectedPlanData?.duration,
        })
      );

      // Initialize payment with Paystack
      const response = await fetch(
        'https://paystack-backend-six.vercel.app/api/index?route=initialize-transaction',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: currentUser.email,
            amount: selectedPlanData?.price,
            planId: selectedPlan,
            bookId: bookId,
            userId: currentUser.uid,
            callback_url: 'https://checkout.paystack.com/close',
          }),
        }
      );

      const data = await response.json();
      console.log('Payment initialization response:', data);

      if (data.status && data.authorization_url) {
        // Store the reference from Paystack response
        if (data.reference) {
          await AsyncStorage.setItem('currentPaymentReference', data.reference);
        }
        
        // Open Paystack payment page in WebView modal
        setPaymentUrl(data.authorization_url);
        setShowPaymentModal(true);
      } else {
        Alert.alert('Error', 'Failed to initialize payment. Please try again.');
      }
    } catch (error) {
      console.error('Payment error:', error);
      Alert.alert('Error', 'An error occurred. Please try again.');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleWebViewNavigationStateChange = async (navState: any) => {
    const { url, title } = navState;
    console.log('WebView navigating to:', url, 'Title:', title);

    // Check if Paystack redirected to close page or success page
    if (
      url.includes('checkout.paystack.com/close') || 
      url.includes('trxref=') || 
      url.includes('reference=') ||
      title?.toLowerCase().includes('successful')
    ) {
      try {
        // Extract the reference from the URL or AsyncStorage
        let reference = null;
        
        // Try parsing reference from URL
        if (url.includes('trxref=')) {
          const urlParts = url.split('trxref=');
          if (urlParts.length > 1) {
            reference = urlParts[1].split('&')[0];
          }
        } else if (url.includes('reference=')) {
          const urlParts = url.split('reference=');
          if (urlParts.length > 1) {
            reference = urlParts[1].split('&')[0];
          }
        }
        
        // If no reference in URL, get from AsyncStorage
        if (!reference) {
          reference = await AsyncStorage.getItem('currentPaymentReference');
        }
        
        console.log('Payment completed, reference:', reference);
        
        // Close the modal
        setShowPaymentModal(false);
        setPaymentUrl(null);
        
        // Navigate to PaymentCallbackScreen
        navigation.navigate('PaymentCallback', { reference: reference || undefined });
      } catch (error) {
        console.error('Error processing payment completion:', error);
        // Still try to navigate even if there's an error
        setShowPaymentModal(false);
        setPaymentUrl(null);
        navigation.navigate('PaymentCallback', {});
      }
      
      return false; // Prevent WebView from navigating
    }
    
    return true; // Allow navigation
  };

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!currentUser) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="log-in-outline" size={64} color={colors.textSecondary} />
        <Text style={styles.emptyTitle}>Please Sign In</Text>
        <Text style={styles.emptyText}>You need to be signed in to promote your novels</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.primaryButtonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeIcon}>📚</Text>
          <Text style={styles.badgeText}>New Feature Launch</Text>
        </View>

        <Text style={styles.title}>
          {currentStep === 'select-book' ? 'Choose Your Novel to ' : 'Promote Your Novel to '}
          <Text style={styles.titleHighlight}>
            {currentStep === 'select-book' ? 'Promote' : 'More Readers'}
          </Text>
        </Text>

        <Text style={styles.subtitle}>
          {currentStep === 'select-book'
            ? 'Select which of your published novels you\'d like to promote to reach more readers'
            : 'Get your novel featured in our promoted sections and reach readers who are actively looking for their next great read'}
        </Text>

        {/* Step Indicator */}
        <View style={styles.stepIndicator}>
          <View
            style={[
              styles.stepItem,
              currentStep === 'select-book' && styles.stepItemActive,
            ]}
          >
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.stepLabel}>Select Book</Text>
          </View>

          <View style={styles.stepDivider} />

          <View
            style={[
              styles.stepItem,
              currentStep === 'choose-plan' && styles.stepItemActive,
            ]}
          >
            <View
              style={[
                styles.stepNumber,
                currentStep === 'choose-plan' && styles.stepNumberActive,
              ]}
            >
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={styles.stepLabel}>Choose Plan</Text>
          </View>
        </View>
      </View>

      {/* Select Book Step */}
      {currentStep === 'select-book' && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionBadge}>📖 Your Published Novels</Text>
          </View>
          <Text style={styles.sectionTitle}>Select a Book to Promote</Text>
          <Text style={styles.sectionSubtitle}>
            Choose from your published novels to start promoting and reaching more readers
          </Text>

          {loadingBooks ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading your novels...</Text>
            </View>
          ) : userBooks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📚</Text>
              <Text style={styles.emptyStateTitle}>No Published Novels Found</Text>
              <Text style={styles.emptyStateText}>
                You need to publish a novel before you can promote it
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => navigation.navigate('Submit')}
              >
                <Text style={styles.primaryButtonText}>Write Your First Novel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.booksGrid}>
              {userBooks.map((book) => (
                <TouchableOpacity
                  key={book.id}
                  style={styles.bookCard}
                  onPress={() => handleBookSelect(book)}
                  activeOpacity={0.7}
                >
                  <CachedImage
                    uri={getFirebaseDownloadUrl(book.coverSmallImage || book.coverImage || '')}
                    style={styles.bookCover}
                    resizeMode="cover"
                  />

                  <View style={styles.bookStats}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {Array.isArray(book.chapters) ? book.chapters.length : 0}
                      </Text>
                      <Text style={styles.statLabel}>Chapters</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>
                        {(book.views || 0).toLocaleString()}
                      </Text>
                      <Text style={styles.statLabel}>Views</Text>
                    </View>
                  </View>

                  <View style={styles.promoteButton}>
                    <Text style={styles.promoteButtonText}>Promote This Novel</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Choose Plan Step */}
      {currentStep === 'choose-plan' && selectedBook && (
        <View style={styles.section}>
          {/* Selected Book Display */}
          <View style={styles.selectedBookCard}>
            <TouchableOpacity
              style={styles.changeBookButton}
              onPress={goBackToBookSelection}
            >
              <Ionicons name="arrow-back" size={20} color={colors.primary} />
              <Text style={styles.changeBookText}>Change Book</Text>
            </TouchableOpacity>

            <View style={styles.selectedBookContent}>
              <CachedImage
                uri={getFirebaseDownloadUrl(selectedBook.coverSmallImage || selectedBook.coverImage || '')}
                style={styles.selectedBookCover}
                resizeMode="cover"
              />
              <View style={styles.selectedBookInfo}>
                <Text style={styles.selectedBookTitle} numberOfLines={2}>
                  {selectedBook.title}
                </Text>
                <View style={styles.genreContainer}>
                  {selectedBook.genres.slice(0, 2).map((genre, index) => (
                    <View key={index} style={styles.genreBadge}>
                      <Text style={styles.genreText}>{genre}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* Plans Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionBadge}>💎 Promotion Plans</Text>
          </View>
          <Text style={styles.sectionTitle}>Choose Your Plan</Text>
          <Text style={styles.sectionSubtitle}>
            Select the perfect promotion package to boost your novel's visibility
          </Text>

          {/* Currency Selector */}
          <View style={styles.currencyContainer}>
            <TouchableOpacity
              style={styles.currencyButton}
              onPress={() => setShowCurrencySelector(true)}
            >
              <Text style={styles.currencySymbol}>{currentCurrency?.symbol}</Text>
              <Text style={styles.currencyCode}>{currentCurrency?.code}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Currency Conversion Notice */}
          {selectedCurrency !== 'NGN' && (
            <View style={styles.noticeCard}>
              <Ionicons name="information-circle" size={24} color="#3B82F6" />
              <View style={styles.noticeContent}>
                <Text style={styles.noticeTitle}>Currency Conversion Notice</Text>
                <Text style={styles.noticeText}>
                  Prices are displayed in {currentCurrency?.name} for your convenience.
                  Payment will be processed in Nigerian Naira (₦).
                </Text>
              </View>
            </View>
          )}

          {/* Plans */}
          <View style={styles.plansContainer}>
            {plans.map((plan) => (
              <TouchableOpacity
                key={plan.id}
                style={[
                  styles.planCard,
                  selectedPlan === plan.id && styles.planCardSelected,
                ]}
                onPress={() => setSelectedPlan(plan.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.planIcon}>{plan.icon}</Text>
                <Text style={styles.planName}>{plan.name}</Text>

                <View style={styles.priceContainer}>
                  <Text style={styles.planPrice}>{getDisplayPrice(plan.price)}</Text>
                  <Text style={styles.planOriginalPrice}>
                    {formatCurrency(
                      convertFromNaira(plan.originalPrice, selectedCurrency),
                      selectedCurrency
                    )}
                  </Text>
                </View>

                <Text style={styles.planDuration}>{plan.duration} of premium promotion</Text>

                <View style={styles.featuresContainer}>
                  {plan.features.map((feature, index) => (
                    <View key={index} style={styles.featureItem}>
                      <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>

                <View
                  style={[
                    styles.selectPlanButton,
                    selectedPlan === plan.id && styles.selectPlanButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.selectPlanButtonText,
                      selectedPlan === plan.id && styles.selectPlanButtonTextActive,
                    ]}
                  >
                    {selectedPlan === plan.id ? '✓ Plan Selected' : 'Choose This Plan'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Payment Button */}
          <View style={styles.paymentSection}>
            <Text style={styles.paymentIcon}>🚀</Text>
            <Text style={styles.paymentTitle}>Ready to Promote Your Novel?</Text>
            <Text style={styles.paymentSubtitle}>
              Start promoting your novel today and reach readers who are actively looking for
              their next great read
            </Text>

            <TouchableOpacity
              style={[
                styles.paymentButton,
                (!selectedPlan || processingPayment) && styles.paymentButtonDisabled,
              ]}
              onPress={handlePayment}
              disabled={!selectedPlan || processingPayment}
            >
              {processingPayment ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.paymentButtonText}>
                  {selectedPlan
                    ? '🚀 Launch My Promotion Now'
                    : '👆 Select a Plan Above to Continue'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backLink}>← Return to Home</Text>
            </TouchableOpacity>
          </View>

          {/* FAQ Section */}
          <View style={styles.faqSection}>
            <Text style={styles.faqTitle}>Questions? We've Got Answers</Text>
            <Text style={styles.faqSubtitle}>
              Everything you need to know about promoting your novel
            </Text>

            <View style={styles.faqGrid}>
              <View style={styles.faqCard}>
                <Text style={styles.faqIcon}>⚡</Text>
                <Text style={styles.faqQuestion}>How quickly will my novel be featured?</Text>
                <Text style={styles.faqAnswer}>
                  Your novel will be featured in our promoted sections within 24 hours of payment
                  confirmation.
                </Text>
              </View>

              <View style={styles.faqCard}>
                <Text style={styles.faqIcon}>🎯</Text>
                <Text style={styles.faqQuestion}>Where will my novel be promoted?</Text>
                <Text style={styles.faqAnswer}>
                  Your novel will appear in dedicated promoted sections, get priority placement in
                  search results, and be featured in our carousel rotations.
                </Text>
              </View>

              <View style={styles.faqCard}>
                <Text style={styles.faqIcon}>📊</Text>
                <Text style={styles.faqQuestion}>Can I track my promotion performance?</Text>
                <Text style={styles.faqAnswer}>
                  Yes! You'll get access to analytics showing your novel's views, engagement
                  metrics, and reader interactions.
                </Text>
              </View>

              <View style={styles.faqCard}>
                <Text style={styles.faqIcon}>💯</Text>
                <Text style={styles.faqQuestion}>What if I need help with my promotion?</Text>
                <Text style={styles.faqAnswer}>
                  Our support team is here to help! Contact us anytime during your promotion
                  period.
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Currency Selector Modal */}
      <Modal
        visible={showCurrencySelector}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCurrencySelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Currency</Text>
              <TouchableOpacity onPress={() => setShowCurrencySelector(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.currencyList}>
              {getAvailableCurrencies().map((currency) => (
                <TouchableOpacity
                  key={currency.code}
                  style={[
                    styles.currencyItem,
                    selectedCurrency === currency.code && styles.currencyItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedCurrency(currency.code);
                    setShowCurrencySelector(false);
                  }}
                >
                  <Text style={styles.currencyItemSymbol}>{currency.symbol}</Text>
                  <View style={styles.currencyItemInfo}>
                    <Text style={styles.currencyItemCode}>{currency.code}</Text>
                    <Text style={styles.currencyItemName}>{currency.name}</Text>
                  </View>
                  {selectedCurrency === currency.code && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Payment WebView Modal */}
      <Modal
        visible={showPaymentModal}
        animationType="slide"
        onRequestClose={() => {
          setShowPaymentModal(false);
          setPaymentUrl(null);
        }}
      >
        <SafeAreaView style={styles.paymentModalContainer}>
          <View style={styles.paymentModalHeader}>
            <Text style={styles.paymentModalTitle}>Complete Payment</Text>
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  'Cancel Payment',
                  'Are you sure you want to cancel this payment?',
                  [
                    { text: 'No', style: 'cancel' },
                    {
                      text: 'Yes',
                      onPress: () => {
                        setShowPaymentModal(false);
                        setPaymentUrl(null);
                      },
                    },
                  ]
                );
              }}
            >
              <Ionicons name="close" size={28} color={colors.text} />
            </TouchableOpacity>
          </View>
          {paymentUrl && (
            <WebView
              source={{ uri: paymentUrl }}
              onNavigationStateChange={handleWebViewNavigationStateChange}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.webViewLoading}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.webViewLoadingText, { color: colors.text }]}>
                    Loading payment page...
                  </Text>
                </View>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>

      <View style={styles.bottomSpacing} />
    </ScrollView>
  );
};

const getStyles = (themeColors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: themeColors.background,
    },
    loadingText: {
      ...typography.body,
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
      marginBottom: spacing.lg,
    },
    header: {
      backgroundColor: themeColors.primary,
      padding: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.xl,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      borderRadius: 20,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: spacing.md,
    },
    badgeIcon: {
      fontSize: 20,
      marginRight: spacing.xs,
    },
    badgeText: {
      color: '#fff',
      fontWeight: '600',
    },
    title: {
      ...typography.h1,
      fontSize: 32,
      color: '#fff',
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    titleHighlight: {
      color: '#FCD34D',
    },
    subtitle: {
      ...typography.body,
      color: 'rgba(255, 255, 255, 0.9)',
      textAlign: 'center',
      marginBottom: spacing.lg,
      lineHeight: 24,
    },
    stepIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
    },
    stepItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: 20,
    },
    stepItemActive: {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },
    stepNumber: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepNumberActive: {
      backgroundColor: '#fff',
    },
    stepNumberText: {
      fontSize: 12,
      fontWeight: 'bold',
      color: themeColors.primary,
    },
    stepLabel: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    stepDivider: {
      width: 30,
      height: 2,
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    section: {
      padding: spacing.lg,
    },
    sectionHeader: {
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    sectionBadge: {
      backgroundColor: themeColors.backgroundSecondary,
      color: themeColors.primary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: 20,
      fontWeight: '600',
    },
    sectionTitle: {
      ...typography.h2,
      color: themeColors.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    sectionSubtitle: {
      ...typography.body,
      color: themeColors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.lg,
      lineHeight: 22,
    },
    centerContent: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.xl,
    },
    emptyState: {
      alignItems: 'center',
      padding: spacing.xl,
    },
    emptyIcon: {
      fontSize: 64,
      marginBottom: spacing.md,
    },
    emptyStateTitle: {
      ...typography.h3,
      color: themeColors.text,
      marginBottom: spacing.sm,
    },
    emptyStateText: {
      ...typography.body,
      color: themeColors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    primaryButton: {
      backgroundColor: themeColors.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: 12,
    },
    primaryButtonText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 16,
      textAlign: 'center',
    },
    booksGrid: {
      gap: spacing.md,
    },
    bookCard: {
      backgroundColor: themeColors.backgroundSecondary,
      borderRadius: 16,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    bookCover: {
      width: '100%',
      aspectRatio: 0.7,
      borderRadius: 12,
      marginBottom: spacing.md,
    },
    bookStats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: themeColors.border,
      marginBottom: spacing.md,
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      ...typography.h3,
      color: themeColors.primary,
      fontSize: 20,
    },
    statLabel: {
      ...typography.caption,
      color: themeColors.textSecondary,
    },
    statDivider: {
      width: 1,
      height: '100%',
      backgroundColor: themeColors.border,
    },
    promoteButton: {
      backgroundColor: themeColors.primary,
      paddingVertical: spacing.md,
      borderRadius: 12,
    },
    promoteButtonText: {
      color: '#fff',
      fontWeight: 'bold',
      textAlign: 'center',
      fontSize: 16,
    },
    selectedBookCard: {
      backgroundColor: themeColors.backgroundSecondary,
      borderRadius: 16,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    changeBookButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    changeBookText: {
      color: themeColors.primary,
      fontWeight: '600',
    },
    selectedBookContent: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    selectedBookCover: {
      width: 80,
      height: 120,
      borderRadius: 8,
    },
    selectedBookInfo: {
      flex: 1,
      justifyContent: 'center',
    },
    selectedBookTitle: {
      ...typography.h3,
      color: themeColors.text,
      marginBottom: spacing.sm,
    },
    genreContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    genreBadge: {
      backgroundColor: themeColors.primary + '20',
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: 12,
    },
    genreText: {
      color: themeColors.primary,
      fontSize: 12,
      fontWeight: '600',
    },
    currencyContainer: {
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    currencyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: themeColors.backgroundSecondary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: themeColors.border,
    },
    currencySymbol: {
      fontSize: 18,
      fontWeight: 'bold',
      color: themeColors.text,
    },
    currencyCode: {
      fontSize: 16,
      fontWeight: '600',
      color: themeColors.text,
    },
    noticeCard: {
      flexDirection: 'row',
      backgroundColor: '#DBEAFE',
      borderRadius: 12,
      padding: spacing.md,
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    noticeContent: {
      flex: 1,
    },
    noticeTitle: {
      fontWeight: '600',
      color: '#1E40AF',
      marginBottom: 4,
    },
    noticeText: {
      fontSize: 13,
      color: '#1E3A8A',
      lineHeight: 18,
    },
    plansContainer: {
      gap: spacing.md,
      marginBottom: spacing.xl,
    },
    planCard: {
      backgroundColor: themeColors.backgroundSecondary,
      borderRadius: 16,
      padding: spacing.lg,
      borderWidth: 2,
      borderColor: themeColors.border,
    },
    planCardSelected: {
      borderColor: themeColors.primary,
      backgroundColor: themeColors.primary + '10',
    },
    planIcon: {
      fontSize: 48,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    planName: {
      ...typography.h3,
      color: themeColors.text,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    priceContainer: {
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    planPrice: {
      fontSize: 36,
      fontWeight: 'bold',
      color: themeColors.primary,
    },
    planOriginalPrice: {
      fontSize: 16,
      color: themeColors.textSecondary,
      textDecorationLine: 'line-through',
      marginTop: 4,
    },
    planDuration: {
      ...typography.body,
      color: themeColors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    featuresContainer: {
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    featureText: {
      flex: 1,
      ...typography.body,
      color: themeColors.text,
      lineHeight: 20,
    },
    selectPlanButton: {
      backgroundColor: themeColors.backgroundSecondary,
      paddingVertical: spacing.md,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: themeColors.border,
    },
    selectPlanButtonActive: {
      backgroundColor: themeColors.primary,
      borderColor: themeColors.primary,
    },
    selectPlanButtonText: {
      ...typography.body,
      fontWeight: 'bold',
      textAlign: 'center',
      color: themeColors.textSecondary,
    },
    selectPlanButtonTextActive: {
      color: '#fff',
    },
    paymentSection: {
      backgroundColor: themeColors.primary,
      borderRadius: 20,
      padding: spacing.xl,
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    paymentIcon: {
      fontSize: 64,
      marginBottom: spacing.md,
    },
    paymentTitle: {
      ...typography.h2,
      color: '#fff',
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    paymentSubtitle: {
      ...typography.body,
      color: 'rgba(255, 255, 255, 0.9)',
      textAlign: 'center',
      marginBottom: spacing.xl,
      lineHeight: 22,
    },
    paymentButton: {
      backgroundColor: '#fff',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      borderRadius: 16,
      width: '100%',
      marginBottom: spacing.md,
    },
    paymentButtonDisabled: {
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    paymentButtonText: {
      color: themeColors.primary,
      fontWeight: 'bold',
      fontSize: 18,
      textAlign: 'center',
    },
    backLink: {
      color: 'rgba(255, 255, 255, 0.9)',
      fontSize: 16,
      fontWeight: '600',
    },
    faqSection: {
      marginTop: spacing.xl,
    },
    faqTitle: {
      ...typography.h2,
      color: themeColors.text,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    faqSubtitle: {
      ...typography.body,
      color: themeColors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    faqGrid: {
      gap: spacing.md,
    },
    faqCard: {
      backgroundColor: themeColors.backgroundSecondary,
      borderRadius: 16,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: themeColors.border,
    },
    faqIcon: {
      fontSize: 32,
      marginBottom: spacing.sm,
    },
    faqQuestion: {
      ...typography.h3,
      color: themeColors.text,
      marginBottom: spacing.sm,
    },
    faqAnswer: {
      ...typography.body,
      color: themeColors.textSecondary,
      lineHeight: 22,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: themeColors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '70%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    modalTitle: {
      ...typography.h3,
      color: themeColors.text,
    },
    currencyList: {
      padding: spacing.md,
    },
    currencyItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: 12,
      marginBottom: spacing.xs,
    },
    currencyItemSelected: {
      backgroundColor: themeColors.primary + '20',
    },
    currencyItemSymbol: {
      fontSize: 24,
      fontWeight: 'bold',
      width: 40,
      textAlign: 'center',
    },
    currencyItemInfo: {
      flex: 1,
    },
    currencyItemCode: {
      fontSize: 16,
      fontWeight: '600',
      color: themeColors.text,
    },
    currencyItemName: {
      fontSize: 14,
      color: themeColors.textSecondary,
    },
    bottomSpacing: {
      height: spacing.xl,
    },
    paymentModalContainer: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    paymentModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
      backgroundColor: themeColors.background,
    },
    paymentModalTitle: {
      ...typography.h3,
      color: themeColors.text,
    },
    webViewLoading: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: themeColors.background,
    },
    webViewLoadingText: {
      marginTop: spacing.md,
      fontSize: 16,
    },
  });
