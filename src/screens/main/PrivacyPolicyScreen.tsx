import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';

const PrivacyPolicyScreen = () => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Privacy Policy</Text>
          <Text style={styles.lastUpdated}>Last updated: August 25, 2025</Text>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Introduction</Text>
          <Text style={styles.paragraph}>
            At Novlnest, we are committed to protecting your privacy and ensuring the security
            of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard
            your information when you visit our website and use our services.
          </Text>

          <Text style={styles.sectionTitle}>Information We Collect</Text>

          <Text style={styles.subsectionTitle}>Personal Information</Text>
          <Text style={styles.paragraph}>
            We may collect personal information that you voluntarily provide to us when you:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Register for an account</Text>
            <Text style={styles.bulletItem}>• Submit novels or other content</Text>
            <Text style={styles.bulletItem}>• Contact us through our contact form</Text>
            <Text style={styles.bulletItem}>• Participate in surveys or promotions</Text>
          </View>

          <Text style={styles.paragraph}>This information may include:</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Name and display name</Text>
            <Text style={styles.bulletItem}>• Email address</Text>
            <Text style={styles.bulletItem}>• Profile picture</Text>
            <Text style={styles.bulletItem}>• Biographical information</Text>
            <Text style={styles.bulletItem}>• Content you create and publish (novels, stories, comments, reviews)</Text>
          </View>

          <Text style={styles.subsectionTitle}>Automatically Collected Information</Text>
          <Text style={styles.paragraph}>
            When you visit our website, we may automatically collect certain information about your device and usage
            patterns, including:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• IP address and location data</Text>
            <Text style={styles.bulletItem}>• Browser type and version</Text>
            <Text style={styles.bulletItem}>• Operating system</Text>
            <Text style={styles.bulletItem}>• Pages visited and time spent on our site</Text>
            <Text style={styles.bulletItem}>• Referring website</Text>
          </View>

          <Text style={styles.sectionTitle}>How We Use Your Information</Text>
          <Text style={styles.paragraph}>We use the information we collect to:</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Operate and maintain the NovlNest platform</Text>
            <Text style={styles.bulletItem}>• Process your account registration and manage your profile</Text>
            <Text style={styles.bulletItem}>• Enable you to publish and share your content</Text>
            <Text style={styles.bulletItem}>• Communicate with you about your account and our services</Text>
            <Text style={styles.bulletItem}>• Respond to your inquiries and provide customer support</Text>
            <Text style={styles.bulletItem}>• Send you updates and promotional materials (with your consent)</Text>
            <Text style={styles.bulletItem}>• Improve NovlNest by analyzing usage patterns</Text>
            <Text style={styles.bulletItem}>• Detect, prevent, and address technical issues and security threats</Text>
            <Text style={styles.bulletItem}>• Comply with legal requirements</Text>
          </View>

          <Text style={styles.sectionTitle}>Information Sharing and Disclosure</Text>

          <Text style={styles.subsectionTitle}>Public Information</Text>
          <Text style={styles.paragraph}>
            Information you choose to make public (such as your profile information, published novels, and comments)
            will be visible to other users of our platform.
          </Text>

          <Text style={styles.subsectionTitle}>Service Providers</Text>
          <Text style={styles.paragraph}>
            We may share necessary data with trusted third parties (e.g., hosting, analytics, email delivery) to keep NovlNest running. They are bound by confidentiality agreements.
          </Text>

          <Text style={styles.subsectionTitle}>Legal Requirements</Text>
          <Text style={styles.paragraph}>
            We may disclose your information if required to do so by law or in response to valid requests by public
            authorities.
          </Text>

          <Text style={styles.sectionTitle}>Data Security</Text>
          <Text style={styles.paragraph}>
            We implement appropriate technical and organizational security measures to protect your personal
            information against unauthorized access, alteration, disclosure, or destruction. However, no method of
            transmission over the internet or electronic storage is 100% secure.
          </Text>

          <Text style={styles.sectionTitle}>Your Rights and Choices</Text>
          <Text style={styles.paragraph}>You have the right to:</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Access and update your personal information</Text>
            <Text style={styles.bulletItem}>• Delete your account and associated data</Text>
            <Text style={styles.bulletItem}>• Opt out of promotional communications</Text>
            <Text style={styles.bulletItem}>• Request a copy of your data</Text>
            <Text style={styles.bulletItem}>• Request correction of inaccurate information</Text>
          </View>
          <Text style={styles.paragraph}>
            To exercise these rights, please contact us at{' '}
            <Text style={styles.bold}>n0velnest999@gmail.com</Text>. We will respond to your request within a reasonable timeframe.
          </Text>

          <Text style={styles.sectionTitle}>Cookies and Tracking Technologies</Text>
          <Text style={styles.paragraph}>
            We use cookies and similar tracking technologies to enhance your experience on our website. You can
            control cookie settings through your browser preferences, though disabling cookies may affect the
            functionality of our services.
          </Text>

          <Text style={styles.sectionTitle}>Children's Privacy</Text>
          <Text style={styles.paragraph}>
            NovlNest is not intended for children under 13. We do not knowingly collect personal data from children under 13. If you believe a child has shared personal information with us, please contact us immediately.
          </Text>

          <Text style={styles.sectionTitle}>International Users</Text>
          <Text style={styles.paragraph}>
            Your information may be transferred to and processed in countries other than your own. We ensure that such
            transfers comply with applicable data protection laws and implement appropriate safeguards.
          </Text>

          <Text style={styles.sectionTitle}>Changes to This Privacy Policy</Text>
          <Text style={styles.paragraph}>
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
            Privacy Policy on this page and updating the "Last updated" date. We encourage you to review this Privacy
            Policy periodically.
          </Text>

          <Text style={styles.sectionTitle}>Contact Us</Text>
          <Text style={styles.paragraph}>
            If you have any questions or concerns about this Privacy Policy or our privacy practices, please contact us at:
          </Text>
          <View style={styles.contactBox}>
            <Text style={styles.contactText}>
              Email: <Text style={styles.bold}>n0velnest999@gmail.com</Text>
            </Text>
          </View>
        </View>

        {/* Bottom Spacing */}
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
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: 'center' as const,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: themeColors.text,
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  lastUpdated: {
    fontSize: 16,
    color: themeColors.textSecondary,
    textAlign: 'center' as const,
  },
  content: {
    backgroundColor: themeColors.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: themeColors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: themeColors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 15,
    color: themeColors.textSecondary,
    lineHeight: 22,
    marginBottom: 12,
  },
  bulletList: {
    marginLeft: 8,
    marginBottom: 12,
  },
  bulletItem: {
    fontSize: 15,
    color: themeColors.textSecondary,
    lineHeight: 22,
    marginBottom: 6,
  },
  bold: {
    fontWeight: 'bold' as const,
    color: themeColors.text,
  },
  contactBox: {
    backgroundColor: themeColors.card,
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  contactText: {
    fontSize: 15,
    color: themeColors.textSecondary,
  },
});

export default PrivacyPolicyScreen;