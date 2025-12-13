import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';

const TermsOfServiceScreen = () => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Terms of Service</Text>
          <Text style={styles.lastUpdated}>Last updated: August 25, 2025</Text>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Agreement to Terms</Text>
          <Text style={styles.paragraph}>
            By accessing and using Novlnest, you accept and agree to be bound by the terms and
            provision of this agreement. If you do not agree to abide by the above, please do not use this service.
          </Text>

          <Text style={styles.sectionTitle}>Description of Service</Text>
          <Text style={styles.paragraph}>
            Novlnest is a platform that allows users to publish, share, and read original novels and stories. Our
            service includes features for content creation, community interaction, and content discovery.
          </Text>

          <Text style={styles.sectionTitle}>User Accounts</Text>
          <Text style={styles.paragraph}>
            To access certain features of our service, you must create an account. You agree to:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Provide accurate, current, and complete information during registration</Text>
            <Text style={styles.bulletItem}>• Maintain and promptly update your account information</Text>
            <Text style={styles.bulletItem}>• Maintain the security of your password and account</Text>
            <Text style={styles.bulletItem}>• Accept responsibility for all activities that occur under your account</Text>
            <Text style={styles.bulletItem}>• Notify us immediately of any unauthorized use of your account</Text>
          </View>

          <Text style={styles.sectionTitle}>User Content & Rights</Text>

          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Ownership: </Text>
            You retain full ownership of any content (stories, novels, comments, or other creative work) you publish on NovlNest.
          </Text>

          <Text style={styles.subsectionTitle}>License to NovlNest:</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• By posting your work, you grant NovlNest a non-exclusive, revocable, worldwide license to host, display, and share your content only on the NovlNest platform and its related services.</Text>
            <Text style={styles.bulletItem}>• This license does not give NovlNest permission to sell, republish, or license your work outside the platform.</Text>
            <Text style={styles.bulletItem}>• You may remove your content at any time, and the license will end once it is deleted.</Text>
          </View>

          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Publishing Rights Disclaimer: </Text>
            Posting your work on NovlNest may count as a form of publication. This can affect your ability to sell "first publication rights" to traditional publishers. If you plan to submit your work to publishers, you should carefully consider whether to share the full text on NovlNest.
          </Text>

          <Text style={styles.subsectionTitle}>Content Standards</Text>
          <Text style={styles.paragraph}>
            All content must comply with our community standards. You agree not to post content that:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Violates any applicable laws or regulations</Text>
            <Text style={styles.bulletItem}>• Infringes on intellectual property rights of others</Text>
            <Text style={styles.bulletItem}>• Contains hate speech, harassment, or discriminatory content</Text>
            <Text style={styles.bulletItem}>• Includes explicit sexual content involving minors</Text>
            <Text style={styles.bulletItem}>• Promotes violence or illegal activities</Text>
            <Text style={styles.bulletItem}>• Contains spam, malware, or malicious code</Text>
            <Text style={styles.bulletItem}>• Violates privacy rights of others</Text>
          </View>

          <Text style={styles.sectionTitle}>Intellectual Property</Text>
          <Text style={styles.paragraph}>
            All elements of the NovlNest platform (design, features, branding, and original site content) are owned by NovlNest and protected under copyright and trademark laws. This does not apply to user-submitted stories.
          </Text>

          <Text style={styles.sectionTitle}>Prohibited Uses</Text>
          <Text style={styles.paragraph}>You may not use our service:</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• For any unlawful purpose or to solicit others to perform unlawful acts</Text>
            <Text style={styles.bulletItem}>• To violate any international, federal, provincial, or state regulations, rules, laws, or local ordinances</Text>
            <Text style={styles.bulletItem}>• To infringe upon or violate our intellectual property rights or the intellectual property rights of others</Text>
            <Text style={styles.bulletItem}>• To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate</Text>
            <Text style={styles.bulletItem}>• To submit false or misleading information</Text>
            <Text style={styles.bulletItem}>• To upload or transmit viruses or any other type of malicious code</Text>
            <Text style={styles.bulletItem}>• To spam, phish, pharm, pretext, spider, crawl, or scrape</Text>
            <Text style={styles.bulletItem}>• For any obscene or immoral purpose</Text>
            <Text style={styles.bulletItem}>• To interfere with or circumvent the security features of the service</Text>
          </View>

          <Text style={styles.sectionTitle}>Content Moderation</Text>
          <Text style={styles.paragraph}>
            We reserve the right to review, moderate, and remove content that violates our terms of service or
            community guidelines. We may also suspend or terminate accounts that repeatedly violate our policies.
          </Text>

          <Text style={styles.sectionTitle}>Privacy Policy</Text>
          <Text style={styles.paragraph}>
            Your privacy is important to us. Please review our Privacy Policy, which also governs your use of the
            service, to understand our practices.
          </Text>

          <Text style={styles.sectionTitle}>Disclaimers</Text>
          <Text style={styles.paragraph}>
            The information on this website is provided on an "as is" basis. To the fullest extent permitted by law,
            this Company excludes all representations, warranties, conditions and terms whether express or implied,
            statutory or otherwise.
          </Text>

          <Text style={styles.sectionTitle}>Limitation of Liability</Text>
          <Text style={styles.paragraph}>
            In no event shall Novlnest, nor its directors, employees, partners, agents, suppliers, or affiliates, be
            liable for any indirect, incidental, punitive, consequential, or special damages arising out of or related
            to your use of the service.
          </Text>

          <Text style={styles.sectionTitle}>Termination</Text>
          <Text style={styles.paragraph}>
            We may terminate or suspend your account and bar access to the service immediately, without prior notice
            or liability, under our sole discretion, for any reason whatsoever, including but not limited to a breach
            of the Terms.
          </Text>

          <Text style={styles.sectionTitle}>Governing Law</Text>
          <Text style={styles.paragraph}>
            These Terms shall be interpreted and governed by the laws of the United States, without regard to its
            conflict of law provisions. Our failure to enforce any right or provision of these Terms will not be
            considered a waiver of those rights.
          </Text>

          <Text style={styles.sectionTitle}>Changes to Terms</Text>
          <Text style={styles.paragraph}>
            We reserve the right, at our sole discretion, to modify or replace these Terms from time to time. Material changes will be communicated to users in advance.
          </Text>

          <Text style={styles.sectionTitle}>Contact Information</Text>
          <Text style={styles.paragraph}>
            If you have any questions or concerns about these Terms of Service, please contact us at:
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

export default TermsOfServiceScreen;