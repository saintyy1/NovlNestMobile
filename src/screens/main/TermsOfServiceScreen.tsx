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

const TermsOfServiceScreen = () => {
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="document-text" size={32} color="#fff" />
          </View>
          <Text style={styles.title}>Terms of Service</Text>
          <View style={styles.dateBadge}>
            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.lastUpdated}>Updated August 25, 2025</Text>
          </View>
        </View>

        {/* Intro Card */}
        <View style={[styles.introCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
          <Ionicons name="information-circle" size={24} color={colors.primary} />
          <Text style={styles.introText}>
            By using NovlNest, you agree to these terms. Please read them carefully.
          </Text>
        </View>

        {/* Sections */}
        <Section icon="checkmark-circle" title="Agreement to Terms">
          <Text style={styles.paragraph}>
            By accessing and using NovlNest, you accept and agree to be bound by these terms. If you do not agree, please do not use this service.
          </Text>
        </Section>

        <Section icon="apps" title="Description of Service">
          <Text style={styles.paragraph}>
            NovlNest is a platform for publishing, sharing, and reading original novels and stories. Features include content creation, community interaction, and content discovery.
          </Text>
        </Section>

        <Section icon="person-circle" title="User Accounts">
          <Text style={styles.paragraph}>When creating an account, you agree to:</Text>
          <BulletPoint text="Provide accurate and complete information" />
          <BulletPoint text="Keep your account information updated" />
          <BulletPoint text="Maintain password security" />
          <BulletPoint text="Accept responsibility for account activities" />
          <BulletPoint text="Report unauthorized access immediately" />
        </Section>

        <Section icon="create" title="User Content & Rights">
          <View style={[styles.highlightBox, { backgroundColor: colors.success + '15', borderLeftColor: colors.success }]}>
            <Text style={[styles.highlightTitle, { color: colors.success }]}>You Own Your Content</Text>
            <Text style={styles.highlightText}>
              You retain full ownership of all stories, novels, and creative work you publish.
            </Text>
          </View>

          <Text style={styles.subsectionTitle}>License to NovlNest</Text>
          <BulletPoint text="You grant us a non-exclusive license to host and display your content on our platform" />
          <BulletPoint text="We cannot sell or republish your work outside NovlNest" />
          <BulletPoint text="Remove your content anytime to end the license" />

          <View style={[styles.warningBox, { backgroundColor: colors.warning + '15', borderLeftColor: colors.warning }]}>
            <Text style={[styles.highlightTitle, { color: colors.warning }]}>Publishing Notice</Text>
            <Text style={styles.highlightText}>
              Posting on NovlNest may affect "first publication rights" for traditional publishers.
            </Text>
          </View>
        </Section>

        <Section icon="shield-checkmark" title="Content Standards">
          <Text style={styles.paragraph}>Do not post content that:</Text>
          <BulletPoint text="Violates laws or regulations" />
          <BulletPoint text="Infringes intellectual property rights" />
          <BulletPoint text="Contains hate speech or harassment" />
          <BulletPoint text="Includes explicit content involving minors" />
          <BulletPoint text="Promotes violence or illegal activities" />
          <BulletPoint text="Contains spam or malicious code" />
        </Section>

        <Section icon="ban" title="Prohibited Uses">
          <BulletPoint text="Unlawful purposes or soliciting illegal acts" />
          <BulletPoint text="Violating any laws or regulations" />
          <BulletPoint text="Harassing, defaming, or discriminating" />
          <BulletPoint text="Submitting false information" />
          <BulletPoint text="Uploading viruses or malicious code" />
          <BulletPoint text="Scraping or unauthorized data collection" />
        </Section>

        <Section icon="eye" title="Content Moderation">
          <Text style={styles.paragraph}>
            We may review, moderate, and remove content violating our terms. Accounts with repeated violations may be suspended or terminated.
          </Text>
        </Section>

        <Section icon="warning" title="Disclaimers & Liability">
          <Text style={styles.paragraph}>
            Our service is provided "as is" without warranties. We are not liable for indirect, incidental, or consequential damages from using our service.
          </Text>
        </Section>

        <Section icon="close-circle" title="Termination">
          <Text style={styles.paragraph}>
            We may terminate accounts at our discretion for any reason, including terms violations, without prior notice.
          </Text>
        </Section>

        <Section icon="globe" title="Governing Law">
          <Text style={styles.paragraph}>
            These Terms are governed by US law. Failure to enforce any provision does not waive our rights.
          </Text>
        </Section>

        <Section icon="refresh" title="Changes to Terms">
          <Text style={styles.paragraph}>
            We may modify these terms at any time. Material changes will be communicated in advance.
          </Text>
        </Section>

        <Section icon="mail" title="Contact Us">
          <Text style={styles.paragraph}>Questions about these terms?</Text>
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
    marginTop: 12,
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

export default TermsOfServiceScreen;