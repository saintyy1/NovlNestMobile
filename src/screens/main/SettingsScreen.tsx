import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const SettingsScreen = ({ navigation }: any) => {
  const { currentUser, logout, updateUserProfile, updateUserEmail, changePassword, deleteUserAccount, refreshUser } = useAuth();
  const { theme, colors, toggleTheme } = useTheme();
  const [profileUser, setProfileUser] = useState<any>(null);

  // Edit profile states
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editInstagram, setEditInstagram] = useState('');
  const [editTwitter, setEditTwitter] = useState('');
  const [editSupportLink, setEditSupportLink] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editBankName, setEditBankName] = useState('');
  const [editAccountNumber, setEditAccountNumber] = useState('');
  const [editAccountName, setEditAccountName] = useState('');

  // Change Password states
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Change Email states
  const [showChangeEmailModal, setShowChangeEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');

  // Delete Account states
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  // Check if user is Google user
  const isGoogleUser = React.useMemo(() => {
    const providers = (currentUser?.providerData || []).map((p: any) => p.providerId);
    return providers.includes('google.com');
  }, [currentUser]);

  // Check if user is Apple user
  const isAppleUser = React.useMemo(() => {
    const providers = (currentUser?.providerData || []).map((p: any) => p.providerId);
    return providers.includes('apple.com') && !providers.includes('password');
  }, [currentUser]);

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    if (!currentUser) {
      return;
    }

    try {
      let fetchedUser: any = currentUser;
      setProfileUser(fetchedUser);
    } catch (err) {
      console.error('Error fetching user data:', err);
      Alert.alert('Error', 'Failed to load profile data');
    }
  }, [currentUser]);

  // Fetch user data on mount
  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
              // Navigation will be handled automatically by auth state change
            } catch (error) {
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleEditProfile = () => {
    if (!profileUser) return;
    setEditDisplayName(profileUser.displayName || '');
    setEditBio(profileUser.bio || '');
    setEditInstagram(profileUser.instagramUrl || '');
    setEditTwitter(profileUser.twitterUrl || '');
    setEditSupportLink(profileUser.supportLink || '');
    setEditLocation(profileUser.location || '');

    // Parse bank details if Nigerian
    if (profileUser.location === 'Nigerian' && profileUser.supportLink) {
      const match = profileUser.supportLink.match(/^(.+?):\s*(\d+),\s*(.+)$/);
      if (match) {
        setEditBankName(match[1].trim());
        setEditAccountNumber(match[2].trim());
        setEditAccountName(match[3].trim());
      }
    }

    setShowEditProfileModal(true);
  };

  const handleSaveProfile = async () => {
    if (!currentUser) return;

    try {
      let formattedSupportLink = editSupportLink;
      if (editLocation === 'Nigerian' && editBankName && editAccountNumber && editAccountName) {
        formattedSupportLink = `${editBankName}: ${editAccountNumber}, ${editAccountName}`;
      }

      await updateUserProfile(
        editDisplayName,
        editBio,
        editInstagram,
        editTwitter,
        formattedSupportLink,
        editLocation
      );

      Alert.alert('Success', 'Profile updated!');
      setShowEditProfileModal(false);
      fetchUserData();
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    }
  };

  const handleChangePassword = async () => {
    // 🚫 Apple users
    if (isAppleUser) {
      Alert.alert(
        'Not Allowed',
        'Apple ID users cannot change password. Please manage your password via Apple ID.'
      );
      return;
    }
    
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    Alert.alert(
      'Change Password',
      'Are you sure you want to change your password?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          onPress: async () => {
            try {
              await changePassword(currentPassword, newPassword);

              Alert.alert('Success', 'Password updated successfully');
              setShowChangePasswordModal(false);
              setCurrentPassword('');
              setNewPassword('');
              setConfirmNewPassword('');
            } catch (error: any) {
              console.error('Password change error:', error);
              Alert.alert('Error', error?.message || 'Failed to update password');
            }
          },
        },
      ]
    );
  };

  const handleChangeEmail = async () => {
    // 🚫 Apple users
    if (isAppleUser) {
      Alert.alert(
        'Not Allowed',
        'Apple ID users cannot change email. Please manage your email via Apple ID.'
      );
      return;
    }

    if (!newEmail || !confirmEmail) {
      Alert.alert('Error', 'Please enter your new email address');
      return;
    }

    if (newEmail !== confirmEmail) {
      Alert.alert('Error', 'Email addresses do not match');
      return;
    }

    if (newEmail === currentUser?.email) {
      Alert.alert('Error', 'Please enter a different email address');
      return;
    }

    Alert.alert(
      'Change Email',
      'Are you sure you want to change your email address?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          onPress: async () => {
            try {
              // Call updateUserEmail with new email
              await updateUserEmail(newEmail, confirmEmail, isGoogleUser ? undefined : emailPassword);

              Alert.alert('Success', 'Verification email sent. Please check your new email address and click the verification link. The app will automatically update once verified.');
              setShowChangeEmailModal(false);
              setNewEmail('');
              setConfirmEmail('');
              setEmailPassword('');

              // Refresh user data to show pending email
              await refreshUser();
            } catch (error: any) {
              console.error('Email change error:', error);
              Alert.alert('Error', error?.message || 'Failed to update email');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    if (!isGoogleUser && !isAppleUser && !deletePassword) {
      Alert.alert('Error', 'Password is required to delete account');
      return;
    }

    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This action cannot be undone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUserAccount(isGoogleUser || isAppleUser ? undefined : deletePassword);

              Alert.alert('Success', 'Account deleted successfully');
            } catch (error: any) {
              console.error('Account deletion error:', error);
              Alert.alert('Error', error?.message || 'Failed to delete account');
            }
          },
        },
      ]
    );
  };

  const SettingItem = ({
    icon,
    title,
    subtitle,
    onPress,
    showArrow = true,
    rightComponent
  }: any) => {
    const { colors } = useTheme();
    return (
      <TouchableOpacity
        style={[styles.settingItem, { borderBottomColor: colors.border }]}
        onPress={onPress}
        disabled={!onPress && !rightComponent}
      >
        <View style={styles.settingLeft}>
          <View style={[styles.iconContainer, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name={icon} size={22} color={colors.primary} />
          </View>
          <View style={styles.settingText}>
            <Text style={[styles.settingTitle, { color: colors.text }]}>{title}</Text>
            {subtitle && <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
          </View>
        </View>
        {rightComponent || (showArrow && (
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        ))}
      </TouchableOpacity>
    );
  };

  const SectionHeader = ({ title }: any) => {
    const { colors } = useTheme();
    return (
      <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{title}</Text>
    );
  };

  const ThemedTextInput = (props: any) => {
    const { colors } = useTheme();
    return (
      <TextInput
        {...props}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surfaceSecondary,
            borderColor: colors.border,
          },
          props.style,
        ]}
        placeholderTextColor={colors.textSecondary}
      />
    );
  };

  const ThemedText = ({ style, ...props }: any) => {
    const { colors } = useTheme();
    return (
      <Text {...props} style={[style, { color: style?.color || colors.text }]} />
    );
  };

  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Account Section */}
        <SectionHeader title="ACCOUNT" />
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <SettingItem
            icon="person-outline"
            title="Edit Profile"
            subtitle="Update your profile information"
            onPress={handleEditProfile}
          />
          <SettingItem
            icon="mail-outline"
            title="Email"
            subtitle={
              currentUser?.pendingEmail
                ? `${currentUser.email} → ${currentUser.pendingEmail} (pending verification)`
                : currentUser?.email || 'Not set'
            }
            onPress={() => setShowChangeEmailModal(true)}
          />
        </View>

        {/* Edit Profile Modal */}
        <Modal visible={showEditProfileModal} animationType="slide">
          <View style={[styles.modalWrapper, { backgroundColor: colors.background }]}>
            <View
              style={[
                styles.safeAreaHeader,
                {
                  backgroundColor: colors.background,
                  paddingTop: insets.top,
                },
              ]}
            >
              <View style={[styles.modalHeader, { backgroundColor: colors.background }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Profile</Text>
                <TouchableOpacity onPress={() => setShowEditProfileModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={styles.modalContent}>
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Display Name</Text>
                <TextInput
                  style={[styles.input, { color: colors.text, borderColor: colors.border, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' }]}
                  value={editDisplayName}
                  onChangeText={setEditDisplayName}
                  placeholder="Enter display name"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Bio</Text>
                <ThemedTextInput
                  value={editBio}
                  onChangeText={setEditBio}
                  placeholder="Tell us about yourself..."
                  style={styles.textArea}
                  multiline
                  maxLength={500}
                />
                <Text style={[styles.charCount, { color: colors.textSecondary }]}>{editBio.length}/500</Text>
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Instagram URL</Text>
                <TextInput
                  style={[styles.input]}
                  value={editInstagram}
                  onChangeText={setEditInstagram}
                  placeholder="https://instagram.com/yourprofile"
                  placeholderTextColor="#6B7280"
                  keyboardType="url"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Twitter URL</Text>
                <TextInput
                  style={styles.input}
                  value={editTwitter}
                  onChangeText={setEditTwitter}
                  placeholder="https://x.com/@yourprofile"
                  placeholderTextColor="#6B7280"
                  keyboardType="url"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Location</Text>
                <View style={styles.pickerContainer}>
                  <TouchableOpacity
                    style={[styles.pickerButton, editLocation === 'Nigerian' && styles.pickerButtonActive]}
                    onPress={() => setEditLocation('Nigerian')}
                  >
                    <Text style={[styles.pickerText, editLocation === 'Nigerian' && styles.pickerTextActive]}>
                      Nigerian
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pickerButton, editLocation === 'International' && styles.pickerButtonActive]}
                    onPress={() => setEditLocation('International')}
                  >
                    <Text style={[styles.pickerText, editLocation === 'International' && styles.pickerTextActive]}>
                      International
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {editLocation === 'Nigerian' ? (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Bank Name</Text>
                    <TextInput
                      style={styles.input}
                      value={editBankName}
                      onChangeText={setEditBankName}
                      placeholder="Select your bank"
                      placeholderTextColor="#6B7280"
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Account Number</Text>
                    <TextInput
                      style={styles.input}
                      value={editAccountNumber}
                      onChangeText={setEditAccountNumber}
                      placeholder="Enter account number"
                      placeholderTextColor="#6B7280"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Account Name</Text>
                    <TextInput
                      style={styles.input}
                      value={editAccountName}
                      onChangeText={setEditAccountName}
                      placeholder="Enter account name"
                      placeholderTextColor="#6B7280"
                    />
                  </View>
                </>
              ) : (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Support Link (PayPal, Ko-fi, etc.)</Text>
                  <TextInput
                    style={styles.input}
                    value={editSupportLink}
                    onChangeText={setEditSupportLink}
                    placeholder="https://paypal.me/yourname"
                    placeholderTextColor="#6B7280"
                    keyboardType="url"
                  />
                </View>
              )}
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile}>
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Modal>

        {/* Change Email Modal */}
        <Modal visible={showChangeEmailModal} animationType="slide">
          <View style={[styles.modalWrapper, { backgroundColor: colors.background }]}>
            <View
              style={[
                styles.safeAreaHeader,
                {
                  backgroundColor: colors.background,
                  paddingTop: insets.top,
                },
              ]}
            >
              <View style={[styles.modalHeader, { backgroundColor: colors.background }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Change Email
                </Text>

                <TouchableOpacity
                  onPress={() => {
                    setShowChangeEmailModal(false)
                    setNewEmail('')
                    setConfirmEmail('')
                    setEmailPassword('')
                  }}
                >
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.modalContent}>
              {isGoogleUser && (
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle" size={20} color="#8B5CF6" />
                  <Text style={styles.infoText}>
                    Using Google sign-in. You will be asked to reauthenticate via Google popup to verify your identity.
                  </Text>
                </View>
              )}

              {isAppleUser && (
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle" size={20} color="#8B5CF6" />
                  <Text style={styles.infoText}>
                    Using Sign in with Apple. You will be asked to confirm with Apple to verify your identity.
                  </Text>
                </View>
              )}

              {!isGoogleUser && !isAppleUser && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Current Password</Text>
                  <TextInput
                    style={styles.input}
                    value={emailPassword}
                    onChangeText={setEmailPassword}
                    placeholder="Enter your password"
                    placeholderTextColor="#6B7280"
                    secureTextEntry
                  />
                </View>
              )}

              {/* New email fields */}
              {!isAppleUser && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>New Email</Text>
                    <TextInput
                      style={styles.input}
                      value={newEmail}
                      onChangeText={setNewEmail}
                      placeholder="Enter new email address"
                      placeholderTextColor="#6B7280"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Confirm Email</Text>
                    <TextInput
                      style={styles.input}
                      value={confirmEmail}
                      onChangeText={setConfirmEmail}
                      placeholder="Confirm email address"
                      placeholderTextColor="#6B7280"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </>
              )}

              <TouchableOpacity style={styles.saveButton} onPress={handleChangeEmail}>
                <Text style={styles.saveButtonText}>Change Email</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Modal>

        {/* Change Password Modal */}
        <Modal visible={showChangePasswordModal} animationType="slide">
          <View style={[styles.modalWrapper, { backgroundColor: colors.background }]}>
            <View
              style={[
                styles.safeAreaHeader,
                {
                  backgroundColor: colors.background,
                  paddingTop: insets.top,
                },
              ]}
            >
              <View style={[styles.modalHeader, { backgroundColor: colors.background }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Change Password</Text>
                <TouchableOpacity onPress={() => {
                  setShowChangePasswordModal(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmNewPassword('');
                }}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={styles.modalContent}>

              {isGoogleUser && (
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle" size={20} color="#8B5CF6" />
                  <Text style={styles.infoText}>
                    Using Google sign-in. You will be asked to reauthenticate via Google to verify your identity.
                  </Text>
                </View>
              )}

              {isAppleUser && (
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle" size={20} color="#8B5CF6" />
                  <Text style={styles.infoText}>
                    Using Sign in with Apple. Passwords are managed by Apple. You will be asked to confirm your identity with Apple.
                  </Text>
                </View>
              )}

              {!isGoogleUser && !isAppleUser && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Current Password</Text>
                  <TextInput
                    style={styles.input}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Enter current password"
                    placeholderTextColor="#6B7280"
                    secureTextEntry
                  />
                </View>
              )}

              {!isAppleUser && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>New Password</Text>
                    <TextInput
                      style={styles.input}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="Enter new password (min 6 characters)"
                      placeholderTextColor="#6B7280"
                      secureTextEntry
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Confirm New Password</Text>
                    <TextInput
                      style={styles.input}
                      value={confirmNewPassword}
                      onChangeText={setConfirmNewPassword}
                      placeholder="Confirm new password"
                      placeholderTextColor="#6B7280"
                      secureTextEntry
                    />
                  </View>
                </>
              )}

              {/* ACTION BUTTON — ALWAYS VISIBLE */}
              <TouchableOpacity style={styles.saveButton} onPress={handleChangePassword}>
                <Text style={styles.saveButtonText}>Change Password</Text>
              </TouchableOpacity>
            </ScrollView>

          </View>
        </Modal>

        {/* Delete Account Modal */}
        <Modal visible={showDeleteAccountModal} animationType="slide">
          <View style={[styles.modalWrapper, { backgroundColor: colors.background }]}>
            <View
              style={[
                styles.safeAreaHeader,
                {
                  backgroundColor: colors.error,
                  paddingTop: insets.top,
                },
              ]}
            >
              <View style={[styles.modalHeader, styles.dangerModalHeader, { backgroundColor: colors.error }]}>
                <Text style={[styles.modalTitle, { color: '#fff' }]}>Delete Account</Text>
                <TouchableOpacity onPress={() => {
                  setShowDeleteAccountModal(false);
                  setDeletePassword('');
                }}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={styles.modalContent}>
              <View style={[styles.infoBox, styles.dangerInfoBox]}>
                <Ionicons name="warning" size={24} color="#EF4444" />
                <Text style={[styles.infoText, styles.dangerInfoText]}>
                  This will permanently delete your account, all your novels, poems, and data. This action cannot be undone!
                </Text>
              </View>
              {isGoogleUser ? (
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle" size={20} color="#8B5CF6" />
                  <Text style={styles.infoText}>
                    Using Google sign-in. You will be asked to reauthenticate via Google popup to verify your identity.
                  </Text>
                </View>
              ) : isAppleUser ? (
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle" size={20} color="#8B5CF6" />
                  <Text style={styles.infoText}>
                    Using Sign in with Apple. You will be asked to confirm with Apple to verify your identity.
                  </Text>
                </View>
              ) : (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <TextInput
                    style={styles.input}
                    value={deletePassword}
                    onChangeText={setDeletePassword}
                    placeholder="Enter your password to confirm"
                    placeholderTextColor="#6B7280"
                    secureTextEntry
                  />
                </View>
              )}
              <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteAccount}>
                <Text style={styles.dangerButtonText}>Delete My Account</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Modal>

        {/* Preferences Section */}
        <SectionHeader title="PREFERENCES" />
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <SettingItem
            icon="moon-outline"
            title={theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            subtitle={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            showArrow={false}
            rightComponent={
              <Switch
                value={theme === 'dark'}
                onValueChange={toggleTheme}
                trackColor={{ false: '#4B5563', true: colors.primary }}
                thumbColor="#fff"
              />
            }
          />
          <SettingItem
            icon="language-outline"
            title="Language"
            subtitle="English"
            showArrow={false}
          />
        </View>

        {/* Privacy & Security Section */}
        <SectionHeader title="PRIVACY & SECURITY" />
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <SettingItem
            icon="lock-closed-outline"
            title="Change Password"
            subtitle="Update your password"
            onPress={() => setShowChangePasswordModal(true)}
          />
          <SettingItem
            icon="eye-off-outline"
            title="Blocked Users"
            subtitle="Manage blocked users"
            onPress={() => Alert.alert('Coming Soon', 'Block list will be available soon.')}
          />
        </View>

        {/* About Section */}
        <SectionHeader title="ABOUT" />
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <SettingItem
            icon="document-text-outline"
            title="Terms of Service"
            onPress={() => navigation.navigate('TermsOfService')}
          />
          <SettingItem
            icon="shield-checkmark-outline"
            title="Privacy Policy"
            onPress={() => navigation.navigate('PrivacyPolicy')}
          />
          <SettingItem
            icon="help-circle-outline"
            title="Help & Support"
            onPress={() => navigation.navigate('Support')}
          />
        </View>

        {/* Danger Zone */}
        <SectionHeader title="DANGER ZONE" />
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <TouchableOpacity style={styles.dangerItem} onPress={handleLogout}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, styles.dangerIconContainer]}>
                <Ionicons name="log-out-outline" size={22} color="#EF4444" />
              </View>
              <Text style={styles.dangerText}>Logout</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dangerItem} onPress={() => setShowDeleteAccountModal(true)}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, styles.dangerIconContainer]}>
                <Ionicons name="trash-outline" size={22} color="#EF4444" />
              </View>
              <Text style={styles.dangerText}>Delete Account</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeAreaHeader: {
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 0,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 25,
    fontWeight: 'bold' as const,
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top' as const,
  },
  charCount: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'right' as const,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  pickerContainer: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  pickerButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center' as const,
    borderWidth: 2,
    borderColor: colors.border,
  },
  pickerButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pickerText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  pickerTextActive: {
    color: '#fff',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center' as const,
    marginTop: 8,
    marginBottom: 32,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
  infoBox: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    backgroundColor: colors.surfaceSecondary,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  dangerModalHeader: {
    backgroundColor: colors.error,
  },
  dangerInfoBox: {
    backgroundColor: `${colors.error}20`,
    borderWidth: 1,
    borderColor: colors.error,
  },
  dangerInfoText: {
    color: colors.error,
  },
  dangerButton: {
    backgroundColor: colors.error,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center' as const,
    marginTop: 8,
    marginBottom: 32,
  },
  dangerButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  section: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dangerIconContainer: {
    backgroundColor: `${colors.error}20`,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  settingSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  dangerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dangerText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.error,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
});

const styles = getStyles({
  background: '#111827',
  surface: '#1F2937',
  surfaceSecondary: '#374151',
  text: '#fff',
  textSecondary: '#9CA3AF',
  border: '#374151',
  primary: '#8B5CF6',
  error: '#EF4444',
});

export default SettingsScreen;