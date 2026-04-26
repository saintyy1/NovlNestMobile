import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';

export type AlertType = 'success' | 'error' | 'info' | 'warning' | 'confirmation';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertConfig {
  title?: string;
  message: string;
  type?: AlertType;
  buttons?: AlertButton[];
  onDismiss?: () => void;
  cancelable?: boolean;
  useNative?: boolean;
}

export interface ToastConfig {
  message: string;
  type?: AlertType;
  duration?: number;
}

interface AlertContextType {
  showAlert: (config: AlertConfig) => void;
  showToast: (config: ToastConfig | string) => void;
  hideAlert: () => void;
  hideToast: () => void;
  activeAlert: AlertConfig | null;
  activeToast: ToastConfig | null;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider = ({ children }: { children: ReactNode }) => {
  const [activeAlert, setActiveAlert] = useState<AlertConfig | null>(null);
  const [activeToast, setActiveToast] = useState<ToastConfig | null>(null);

  const showAlert = useCallback((config: AlertConfig) => {
    // Basic Haptic Feedback for alerts
    Haptics.notificationAsync(
      config.type === 'error'
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Success
    ).catch(() => { });

    if (config.useNative) {
      Alert.alert(
        config.title || '',
        config.message,
        config.buttons?.map(btn => ({
          text: btn.text,
          onPress: btn.onPress,
          style: btn.style
        })),
        { cancelable: config.cancelable ?? true }
      );
      return;
    }

    setActiveAlert({
      ...config,
      type: config.type || 'info',
      buttons: config.buttons || [{ text: 'OK', style: 'default' }]
    });
  }, []);

  const showToast = useCallback((config: ToastConfig | string) => {
    const toastConfig = typeof config === 'string' ? { message: config } : config;

    // Light haptic for toasts
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });

    setActiveToast({
      ...toastConfig,
      type: toastConfig.type || 'success',
      duration: toastConfig.duration || 3000
    });

    // Auto-dismiss logic for toasts
    if (toastConfig.duration !== 0) {
      setTimeout(() => {
        setActiveToast((current) => {
          if (current?.message === toastConfig.message) return null;
          return current;
        });
      }, toastConfig.duration || 1500);
    }
  }, []);

  const hideAlert = useCallback(() => setActiveAlert(null), []);
  const hideToast = useCallback(() => setActiveToast(null), []);

  return (
    <AlertContext.Provider value={{
      showAlert,
      showToast,
      hideAlert,
      hideToast,
      activeAlert,
      activeToast
    }}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};
