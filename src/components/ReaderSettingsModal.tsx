import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  Dimensions,
  ScrollView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReaderSettings, ReaderThemeType, FontFamilyType, ReaderThemes } from '../contexts/ReaderSettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ReaderSettingsModalProps {
  isVisible: boolean;
  onClose: () => void;
  hideReadingMode?: boolean;
}

const ReaderSettingsModal: React.FC<ReaderSettingsModalProps> = ({ 
  isVisible, 
  onClose,
  hideReadingMode = false
}) => {
  const { colors: appColors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    fontSize,
    setFontSize,
    fontFamily,
    setFontFamily,
    readerTheme,
    setReaderTheme,
    isPagingEnabled,
    setIsPagingEnabled,
  } = useReaderSettings();

  const themes: { id: ReaderThemeType; label: string; bg: string; text: string }[] = [
    { id: 'light', label: 'Light', bg: '#FFFFFF', text: '#000000' },
    { id: 'sepia', label: 'Warm', bg: '#F4ECD8', text: '#5B4636' },
    { id: 'green', label: 'Green', bg: '#E6F4EA', text: '#064E3B' },
    { id: 'sky', label: 'Sky', bg: '#F0F9FF', text: '#0C4A6E' },
    { id: 'lavender', label: 'Lavender', bg: '#F5F3FF', text: '#4C1D95' },
    { id: 'rose', label: 'Rose', bg: '#FFF1F2', text: '#881337' },
    { id: 'slate', label: 'Slate', bg: '#1E293B', text: '#F1F5F9' },
    { id: 'coffee', label: 'Coffee', bg: '#3E2723', text: '#EFEBE9' },
    { id: 'dark', label: 'Night', bg: '#111827', text: '#F9FAFB' },
    { id: 'oled', label: 'OLED', bg: '#000000', text: '#FFFFFF' },
  ];

  const fonts: FontFamilyType[] = [
    'System', 'Georgia', 'Gill Sans', 'Grantha Sangam MN', 'Helvetica Neue',
    'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Noto Sans', 'Iowan Old Style',
    'Palatino', 'Baskerville', 'Times New Roman', 'Courier', 'Avenir',
    'Optima', 'Futura', 'Verdana', 'Trebuchet MS', 'Arial', 'Charter'
  ];

  return (
    <Modal
      visible={isVisible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.fullModalContainer, { backgroundColor: '#000' }]}>
        <StatusBar barStyle="light-content" />

        {/* Header Actions */}
        <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>APPEARANCE</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.settingsScroll}
          contentContainerStyle={styles.settingsContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Reading Mode Section */}
          {!hideReadingMode && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>READING EXPERIENCE</Text>
              <View style={styles.modeContainer}>
                <TouchableOpacity
                  style={[styles.modeButton, !isPagingEnabled && styles.modeButtonActive]}
                  onPress={() => setIsPagingEnabled(false)}
                >
                  <Ionicons name="swap-vertical" size={20} color={!isPagingEnabled ? '#fff' : '#6B7280'} />
                  <Text style={[styles.modeButtonText, !isPagingEnabled && styles.modeButtonTextActive]}>Vertical Scroll</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeButton, isPagingEnabled && styles.modeButtonActive]}
                  onPress={() => setIsPagingEnabled(true)}
                >
                  <Ionicons name="swap-horizontal" size={20} color={isPagingEnabled ? '#fff' : '#6B7280'} />
                  <Text style={[styles.modeButtonText, isPagingEnabled && styles.modeButtonTextActive]}>Page Turn</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Text Size Section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>TEXT SIZE</Text>
            <View style={styles.fontSizeControl}>
              <TouchableOpacity
                onPress={() => setFontSize(Math.max(12, fontSize - 1))}
                style={styles.sizeStep}
              >
                <Text style={[styles.sizeIcon, { fontSize: 14 }]}>A</Text>
              </TouchableOpacity>

              <View style={styles.sizeProgress}>
                <View style={[styles.sizeActiveBar, { width: `${((fontSize - 12) / (32 - 12)) * 100}%` }]} />
                <View style={styles.sizeTrack} />
              </View>

              <TouchableOpacity
                onPress={() => setFontSize(Math.min(32, fontSize + 1))}
                style={styles.sizeStep}
              >
                <Text style={[styles.sizeIcon, { fontSize: 24 }]}>A</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Theme Section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>COLOR PALETTE</Text>
            <View style={styles.themeGrid}>
              {themes.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setReaderTheme(t.id)}
                  style={[
                    styles.themeCircleWrapper,
                    readerTheme === t.id && styles.themeCircleActive
                  ]}
                >
                  <View style={[styles.themeCircle, { backgroundColor: t.bg }]}>
                    <Text style={[styles.themeA, { color: t.text }]}>Aa</Text>
                  </View>
                  <Text style={styles.themeName} numberOfLines={1}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Font Selection Section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>FONT FAMILY</Text>
            <View style={styles.fontList}>
              {fonts.map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFontFamily(f)}
                  style={[
                    styles.fontItem,
                    fontFamily === f && styles.fontItemActive
                  ]}
                >
                  <View style={styles.fontInfo}>
                    <Text style={[styles.fontPreview, {
                      fontFamily: Platform.OS === 'ios' ? f : 'serif'
                    }]}>
                      {f}
                    </Text>
                  </View>
                  {fontFamily === f && (
                    <Ionicons name="checkmark-circle" size={24} color="#8B5CF6" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </View>
    </Modal>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  fullModalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  closeButton: {
    padding: 8,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  settingsScroll: {
    flex: 1,
  },
  settingsContent: {
    padding: 24,
  },
  section: {
    marginBottom: 40,
  },
  sectionLabel: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  modeContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  modeButtonActive: {
    backgroundColor: '#8B5CF6',
  },
  modeButtonText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  fontSizeControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 12,
  },
  sizeStep: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sizeIcon: {
    color: '#fff',
    fontWeight: '600',
  },
  sizeProgress: {
    flex: 1,
    height: 4,
    marginHorizontal: 12,
    justifyContent: 'center',
  },
  sizeTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    width: '100%',
  },
  sizeActiveBar: {
    position: 'absolute',
    height: 4,
    backgroundColor: '#8B5CF6',
    borderRadius: 2,
    zIndex: 1,
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  themeCircleWrapper: {
    width: (width - 48 - 48) / 4,
    alignItems: 'center',
    marginBottom: 12,
  },
  themeCircleActive: {
    transform: [{ scale: 1.1 }],
  },
  themeCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  themeA: {
    fontSize: 18,
    fontWeight: '700',
  },
  themeName: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '600',
  },
  fontList: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    overflow: 'hidden',
  },
  fontItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  fontItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  fontInfo: {
    flex: 1,
    marginRight: 16,
  },
  fontPreview: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 4,
  },
  fontSample: {
    color: '#6B7280',
    fontSize: 12,
  },
});

export default ReaderSettingsModal;
