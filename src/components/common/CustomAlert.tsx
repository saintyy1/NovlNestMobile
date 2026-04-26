import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAlert } from '../../contexts/AlertContext';
import { useTheme } from '../../contexts/ThemeContext';

const { width } = Dimensions.get('window');

const CustomAlert = () => {
  const { activeAlert, hideAlert } = useAlert();
  const { colors, isDark } = useTheme();

  if (!activeAlert) return null;

  const { title, message, type, buttons, onDismiss } = activeAlert;

  const getIcon = () => {
    switch (type) {
      case 'success': return { name: 'checkmark-circle' as const, color: '#4ADE80' };
      case 'error': return { name: 'alert-circle' as const, color: '#F87171' };
      case 'warning': return { name: 'warning' as const, color: '#FBBF24' };
      default: return { name: 'information-circle' as const, color: colors.primary };
    }
  };

  const icon = getIcon();

  const handleButtonPress = (onPress?: () => void) => {
    hideAlert();
    if (onPress) onPress();
    if (onDismiss) onDismiss();
  };

  return (
    <Animated.View 
      entering={FadeIn.duration(200)} 
      exiting={FadeOut.duration(200)}
      style={[StyleSheet.absoluteFill, { zIndex: 9999 }]}
    >
      <View style={styles.overlay}>
        <TouchableOpacity 
          activeOpacity={1} 
          style={styles.backdrop} 
          onPress={hideAlert}
        />

        <Animated.View 
          entering={ZoomIn.duration(300).springify()}
          exiting={ZoomOut.duration(200)}
          style={styles.container}
        >
          <BlurView 
            intensity={Platform.OS === 'ios' ? 40 : 100} 
            tint={isDark ? 'dark' : 'light'} 
            style={[
              styles.alertBox, 
              { backgroundColor: isDark ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.9)' }
            ]}
          >
            <View style={styles.content}>
              <View style={[styles.iconContainer, { backgroundColor: `${icon.color}20` }]}>
                <Ionicons name={icon.name} size={32} color={icon.color} />
              </View>
              
              {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
              <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
            </View>

            <View style={styles.buttonContainer}>
              {buttons?.map((btn, index) => {
                const isDestructive = btn.style === 'destructive';
                const isCancel = btn.style === 'cancel';
                
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.button,
                      index > 0 && styles.buttonBorder,
                      { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }
                    ]}
                    onPress={() => handleButtonPress(btn.onPress)}
                  >
                    <Text style={[
                      styles.buttonText,
                      { color: isDestructive ? '#F87171' : isCancel ? colors.textSecondary : colors.primary },
                      !isDestructive && !isCancel && styles.boldText
                    ]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </BlurView>
        </Animated.View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  container: {
    width: width * 0.8,
    maxWidth: 320,
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  alertBox: {
    borderRadius: 24,
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  buttonContainer: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonBorder: {
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  buttonText: {
    fontSize: 17,
  },
  boldText: {
    fontWeight: '600',
  },
});

export default CustomAlert;
