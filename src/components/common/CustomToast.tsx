import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeInUp,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useAlert } from '../../contexts/AlertContext';
import { useTheme } from '../../contexts/ThemeContext';
import { BlurView } from 'expo-blur';

const CustomToast = () => {
  const { activeToast, hideToast } = useAlert();
  const { colors, isDark } = useTheme();

  const translateY = useSharedValue(0);

  // Reset position when a new toast appears
  React.useEffect(() => {
    if (activeToast) {
      translateY.value = 0;
    }
  }, [activeToast]);

  const gesture = Gesture.Pan()
    .onUpdate((event) => {
      // Only allow swiping UP
      if (event.translationY < 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY < -20 || event.velocityY < -500) {
        scheduleOnRN(hideToast);
      } else {
        translateY.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!activeToast) return null;

  const { message, type } = activeToast;

  const getIcon = () => {
    switch (type) {
      case 'success': return { name: 'checkmark-circle' as const, color: '#4ADE80' };
      case 'error': return { name: 'alert-circle' as const, color: '#F87171' };
      case 'warning': return { name: 'warning' as const, color: '#FBBF24' };
      default: return { name: 'information-circle' as const, color: colors.primary };
    }
  };

  const icon = getIcon();

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <SafeAreaView pointerEvents="box-none" style={styles.safeArea}>
        <GestureDetector gesture={gesture}>
          <Animated.View
            entering={FadeInUp.springify()}
            exiting={FadeOutUp}
            style={styles.container}
            pointerEvents="box-none"
          >
            <Animated.View style={[animatedStyle, { width: '100%', alignItems: 'center' }]}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={hideToast}
                style={styles.touchable}
              >
                <BlurView
                  intensity={Platform.OS === 'ios' ? 40 : 100}
                  tint={isDark ? 'dark' : 'light'}
                  style={[
                    styles.toast,
                    { backgroundColor: isDark ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.9)' }
                  ]}
                >
                  <View style={[styles.iconContainer, { backgroundColor: `${icon.color}20` }]}>
                    <Ionicons name={icon.name} size={20} color={icon.color} />
                  </View>
                  <Text
                    style={[styles.message, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {message}
                  </Text>
                </BlurView>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  safeArea: {
    flex: 1,
  },
  container: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 60 : 60,
    width: '100%',
  },
  touchable: {
    width: '90%',
    maxWidth: 400,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    borderRadius: 50,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  message: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
});

export default CustomToast;
