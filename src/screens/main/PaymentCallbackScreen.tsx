import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../contexts/ThemeContext';
import { sendPromotionApprovedNotification } from '../../services/notificationServices';
import * as Linking from 'expo-linking';

const PaymentCallbackScreen = ({ route, navigation }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const [message, setMessage] = useState('');

  const verifyPayment = async (reference: string) => {
    try {
        const response = await fetch('https://paystack-backend-six.vercel.app/api/index?route=verify-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reference }),
        });

        const data = await response.json();

        if (data.status) {
          setStatus('success');
          setMessage('Your novel has been successfully promoted!');
          
          // Send notification to the user
          let bookId = data.bookId;
          let userId = data.userId;
          let planId = data.planId;
          let novelTitle = null;
          let planName = null;
          let planDuration = null;
          
          // If backend doesn't return the data, use AsyncStorage fallback
          if (!bookId || !userId) {
            const pendingPayment = await AsyncStorage.getItem('pendingPromotionPayment');
            if (pendingPayment) {
              const paymentData = JSON.parse(pendingPayment);
              bookId = paymentData.bookId;
              userId = paymentData.userId;
              planId = paymentData.planId;
              novelTitle = paymentData.novelTitle;
              planName = paymentData.planName;
              planDuration = paymentData.planDuration;
            }
          }
          
          if (bookId && userId) {
            try {
              // If we don't have novel title from AsyncStorage, fetch from Firestore
              if (!novelTitle) {
                const novelDoc = await getDoc(doc(db, 'novels', bookId));
                if (novelDoc.exists()) {
                  novelTitle = novelDoc.data().title;
                }
              }
              
              // Determine plan details if not from AsyncStorage
              if (!planName || !planDuration) {
                planDuration = planId === '1-month' ? '30 days' : '60 days';
                planName = planId === '1-month' ? 'Essential Boost' : 'Premium Growth';
              }
              
              if (novelTitle && planName && planDuration) {
                await sendPromotionApprovedNotification(
                  userId,
                  bookId,
                  novelTitle,
                  planName,
                  planDuration
                );
              }
              
              // Clear AsyncStorage after successful notification
              await AsyncStorage.removeItem('pendingPromotionPayment');
            } catch (notificationError) {
              console.error('Error sending promotion notification:', notificationError);
              // Don't fail the whole process if notification fails
            }
          }
        } else {
          setStatus('failed');
          setMessage(data.message || 'Payment verification failed');
          // Clear AsyncStorage on failed payment
          await AsyncStorage.removeItem('pendingPromotionPayment');
        }
      } catch (error) {
        console.error('Payment verification error:', error);
        setStatus('failed');
        setMessage('An error occurred while verifying payment');
      }
  };

  useEffect(() => {
    // Add listener for incoming deep links
    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('Deep link received:', url);
      const parsed = Linking.parse(url);
      const reference = parsed.queryParams?.reference as string;
      if (reference) {
        verifyPayment(reference);
      }
    });

    // Check for initial URL
    const checkInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      console.log('Initial URL:', initialUrl);
      if (initialUrl) {
        const parsed = Linking.parse(initialUrl);
        const reference = parsed.queryParams?.reference as string;
        if (reference) {
          verifyPayment(reference);
          return;
        }
      }
      
      // Fallback to route params
      let reference = route.params?.reference;
      
      // If no reference in route params, try AsyncStorage
      if (!reference) {
        reference = await AsyncStorage.getItem('currentPaymentReference');
      }
      
      if (reference) {
        verifyPayment(reference);
        // Clean up the stored reference after using it
        await AsyncStorage.removeItem('currentPaymentReference');
      } else {
        setStatus('failed');
        setMessage('No payment reference found');
      }
    };

    checkInitialUrl();

    return () => {
      subscription.remove();
    };
  }, []);

  const handleReturnHome = () => {
    navigation.navigate('MainTabs', { screen: 'Home' });
  };

  const handleTryAgain = () => {
    navigation.navigate('PromoteScreen');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
            <Text style={[styles.title, { color: colors.text }]}>Verifying Payment...</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Please wait while we confirm your payment
            </Text>
          </>
        )}

        {status === 'success' && (
          <>
            <View style={[styles.iconContainer, { backgroundColor: colors.success + '20' }]}>
              <Ionicons name="checkmark-circle" size={80} color={colors.success} />
            </View>
            <Text style={[styles.title, { color: colors.success }]}>Payment Successful!</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{message}</Text>
            
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={handleReturnHome}
              >
                <Ionicons name="home-outline" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Return to Home</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {status === 'failed' && (
          <>
            <View style={[styles.iconContainer, { backgroundColor: colors.error + '20' }]}>
              <Ionicons name="close-circle" size={80} color={colors.error} />
            </View>
            <Text style={[styles.title, { color: colors.error }]}>Payment Failed</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{message}</Text>
            
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={handleTryAgain}
              >
                <Ionicons name="refresh-outline" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Try Again</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.primary }]}
                onPress={handleReturnHome}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                  Return to Home
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    spinner: {
      marginBottom: 24,
    },
    iconContainer: {
      width: 120,
      height: 120,
      borderRadius: 60,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      marginBottom: 12,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      textAlign: 'center',
      marginBottom: 32,
      lineHeight: 24,
    },
    buttonContainer: {
      width: '100%',
      gap: 12,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      paddingHorizontal: 32,
      borderRadius: 12,
      gap: 8,
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      paddingVertical: 16,
      paddingHorizontal: 32,
      borderRadius: 12,
      borderWidth: 2,
      alignItems: 'center',
    },
    secondaryButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
  });

export default PaymentCallbackScreen;
