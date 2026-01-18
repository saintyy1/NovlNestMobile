import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

const PrivacyPolicyScreen = () => {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  const Section = ({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: colors.primary + '15' }]}>
          <Ionicons name={icon as any} size={20} color={colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionContent}>
        {children}
      </View>
    </View>
  );

  const BulletPoint = ({ text }: { text: string }) => (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletDot, { backgroundColor: colors.primary }]} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );

  const InfoCard = ({ icon, title, description }: { icon: string; title: string; description: string }) => (
    <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
      <View style={[styles.infoCardIcon, { backgroundColor: colors.primary + '15' }]}>
        <Ionicons name={icon as any} size={18} color={colors.primary} />
      </View>
      <View style={styles.infoCardContent}>
        <Text style={styles.infoCardTitle}>{title}</Text>
        <Text style={styles.infoCardDesc}>{description}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="shield-checkmark" size={32} color="#fff" />
          </View>
          <Text style={styles.title}>Privacy Policy</Text>
          <View style={styles.dateBadge}>
            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.lastUpdated}>Updated August 25, 2025</Text>
          </View>
        </View>

        {/* Intro Card */}
        <View style={[styles.introCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
          <Ionicons name="lock-closed" size={24} color={colors.primary} />
          <Text style={styles.introText}>
            Your privacy matters to us. This policy explains how we collect, use, and protect your information.
          </Text>
        </View>

        {/* Sections */}
        <Section icon="information-circle" title="Introduction">
          <Text style={styles.paragraph}>
            At NovlNest, we are committed to protecting your privacy and ensuring the security of your personal information.
          </Text>
        </Section>

        <Section icon="folder-open" title="Information We Collect">
          <Text style={styles.subsectionTitle}>Personal Information</Text>
          <Text style={styles.paragraph}>We collect information when you:</Text>
          <BulletPoint text="Register for an account" />
          <BulletPoint text="Submit novels or content" />
          <BulletPoint text="Contact us or participate in promotions" />

          <Text style={styles.subsectionTitle}>What We Collect</Text>
          <View style={styles.infoGrid}>
            <InfoCard icon="person" title="Profile Data" description="Name, email, profile picture" />
            <InfoCard icon="create" title="Content" description="Stories, comments, reviews" />
            <InfoCard icon="analytics" title="Usage Data" description="Pages visited, time spent" />
            <InfoCard icon="phone-portrait" title="Device Info" description="Browser, OS, IP address" />
          </View>
        </Section>

        <Section icon="settings" title="How We Use Your Information">
          <BulletPoint text="Operate and maintain the platform" />
          <BulletPoint text="Process registrations and manage profiles" />
          <BulletPoint text="Enable content publishing and sharing" />
          <BulletPoint text="Communicate about your account" />
          <BulletPoint text="Provide customer support" />
          <BulletPoint text="Send updates (with your consent)" />
          <BulletPoint text="Improve our services" />
          <BulletPoint text="Ensure security and prevent issues" />
        </Section>

        <Section icon="share-social" title="Information Sharing">
          <View style={[styles.highlightBox, { backgroundColor: colors.success + '15', borderLeftColor: colors.success }]}>
            <Text style={[styles.highlightTitle, { color: colors.success }]}>Public Content</Text>
            <Text style={styles.highlightText}>
              Your profile, published novels, and comments are visible to other users.
            </Text>
          </View>

          <Text style={styles.subsectionTitle}>Service Providers</Text>
          <Text style={styles.paragraph}>
            We share necessary data with trusted third parties (hosting, analytics) bound by confidentiality agreements.
          </Text>

          <Text style={styles.subsectionTitle}>Legal Requirements</Text>
          <Text style={styles.paragraph}>
            We may disclose information if required by law or valid legal requests.
          </Text>
        </Section>

        <Section icon="lock-closed" title="Data Security">
          <Text style={styles.paragraph}>
            We implement technical and organizational measures to protect your information. However, no internet transmission is 100% secure.
          </Text>
        </Section>

        <Section icon="hand-left" title="Your Rights">
          <View style={[styles.rightsGrid]}>
            <View style={[styles.rightItem, { backgroundColor: colors.card }]}>
              <Ionicons name="eye" size={24} color={colors.primary} />
              <Text style={styles.rightText}>Access your data</Text>
            </View>
            <View style={[styles.rightItem, { backgroundColor: colors.card }]}>
              <Ionicons name="create" size={24} color={colors.primary} />
              <Text style={styles.rightText}>Update info</Text>
            </View>
            <View style={[styles.rightItem, { backgroundColor: colors.card }]}>
              <Ionicons name="trash" size={24} color={colors.primary} />
              <Text style={styles.rightText}>Delete account</Text>
            </View>
            <View style={[styles.rightItem, { backgroundColor: colors.card }]}>
              <Ionicons name="download" size={24} color={colors.primary} />
              <Text style={styles.rightText}>Export data</Text>
            </View>
          </View>
          <Text style={[styles.paragraph, { marginTop: 12 }]}>
            Contact us at n0velnest999@gmail.com to exercise these rights.
          </Text>
        </Section>

        <Section icon="analytics" title="Cookies & Tracking">
          <Text style={styles.paragraph}>
            We use cookies to enhance your experience. You can control cookies through browser settings, though this may affect functionality.
          </Text>
        </Section>

        <Section icon="people" title="Children's Privacy">
          <View style={[styles.warningBox, { backgroundColor: colors.warning + '15', borderLeftColor: colors.warning }]}>
            <Text style={[styles.highlightTitle, { color: colors.warning }]}>Age Requirement</Text>
            <Text style={styles.highlightText}>
              NovlNest is not for users under 13. We don't knowingly collect data from children.
            </Text>
          </View>
        </Section>

        <Section icon="globe" title="International Users">
          <Text style={styles.paragraph}>
            Your data may be transferred internationally. We ensure compliance with applicable data protection laws.
          </Text>
        </Section>

        <Section icon="refresh" title="Policy Changes">
          <Text style={styles.paragraph}>
            We may update this policy periodically. Changes will be posted here with an updated date.
          </Text>
        </Section>

        <Section icon="mail" title="Contact Us">
          <Text style={styles.paragraph}>Questions about your privacy?</Text>
          <View style={styles.contactCard}>
            <Ionicons name="mail" size={24} color={colors.primary} />
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>Email</Text>
              <Text style={styles.contactValue}>n0velnest999@gmail.com</Text>
            </View>
          </View>
        </Section>

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
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 12,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: themeColors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  lastUpdated: {
    fontSize: 13,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  introText: {
    flex: 1,
    fontSize: 14,
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    lineHeight: 20,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: themeColors.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  sectionContent: {
    padding: 16,
  },
  subsectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginTop: 12,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    color: themeColors.textSecondary,
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingRight: 8,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    marginRight: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: themeColors.textSecondary,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  infoGrid: {
    gap: 10,
    marginTop: 8,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
  },
  infoCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCardContent: {
    flex: 1,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  infoCardDesc: {
    fontSize: 12,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  highlightBox: {
    padding: 14,
    borderRadius: 10,
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  warningBox: {
    padding: 14,
    borderRadius: 10,
    borderLeftWidth: 4,
  },
  highlightTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  highlightText: {
    fontSize: 13,
    color: themeColors.textSecondary,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  rightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  rightItem: {
    width: '47%',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  rightText: {
    fontSize: 13,
    fontWeight: '500',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign: 'center',
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: themeColors.card,
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 12,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  contactValue: {
    fontSize: 15,
    fontWeight: '600',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
});

export default PrivacyPolicyScreen;