import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

interface UserListDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userIds: string[];
  title: string;
  navigation: any;
}

interface UserDisplayInfo {
  uid: string;
  displayName: string;
  photoURL: string | null;
  isFollowing: boolean;
}

const UserListDrawer: React.FC<UserListDrawerProps> = ({
  isOpen,
  onClose,
  userIds,
  title,
  navigation,
}) => {
  const { currentUser, toggleFollow } = useAuth();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const [usersToDisplay, setUsersToDisplay] = useState<UserDisplayInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingFollowId, setTogglingFollowId] = useState<string | null>(null);

  const fetchUserDetails = useCallback(async () => {
    setLoading(true);
    const fetchedUsers: UserDisplayInfo[] = [];
    const uniqueUserIds = Array.from(new Set(userIds)); // Ensure unique UIDs

    if (uniqueUserIds.length === 0) {
      setUsersToDisplay([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch all user documents in parallel
      const userPromises = uniqueUserIds.map(async (uid) => {
        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          return {
            uid: userDocSnap.id,
            displayName: userData.displayName || 'Anonymous',
            photoURL: userData.photoURL || null,
            isFollowing: currentUser?.following?.includes(userDocSnap.id) || false,
          };
        }
        return null;
      });

      const results = await Promise.all(userPromises);
      setUsersToDisplay(results.filter(Boolean) as UserDisplayInfo[]);
    } catch (error) {
      console.error('Error fetching user details for list:', error);
    } finally {
      setLoading(false);
    }
  }, [userIds, currentUser?.following]);

  useEffect(() => {
    if (isOpen) {
      fetchUserDetails();
    }
  }, [isOpen, fetchUserDetails]);

  const handleToggleFollow = useCallback(
    async (targetUserId: string, currentIsFollowing: boolean) => {
      if (!currentUser) return;

      setTogglingFollowId(targetUserId);
      try {
        await toggleFollow(targetUserId, currentIsFollowing);
        // Optimistically update the local state for the specific user
        setUsersToDisplay((prevUsers) =>
          prevUsers.map((user) =>
            user.uid === targetUserId ? { ...user, isFollowing: !currentIsFollowing } : user
          )
        );
      } catch (error) {
        console.error('Error toggling follow from list:', error);
        // Revert UI if error
        setUsersToDisplay((prevUsers) =>
          prevUsers.map((user) =>
            user.uid === targetUserId ? { ...user, isFollowing: currentIsFollowing } : user
          )
        );
      } finally {
        setTogglingFollowId(null);
      }
    },
    [currentUser, toggleFollow]
  );

  const getUserInitials = useCallback((name: string | null | undefined) => {
    if (!name) return 'U';
    return name.charAt(0).toUpperCase();
  }, []);

  const handleUserPress = (userId: string) => {
    onClose();
    navigation.navigate('Profile', { userId });
  };

  const renderUserItem = ({ item }: { item: UserDisplayInfo }) => (
    <View style={styles.userItem}>
      <TouchableOpacity
        style={styles.userInfo}
        onPress={() => handleUserPress(item.uid)}
      >
        <View style={styles.avatarContainer}>
          {item.photoURL ? (
            <Image source={{ uri: item.photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{getUserInitials(item.displayName)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.userName} numberOfLines={1}>
          {item.displayName}
        </Text>
      </TouchableOpacity>

      {currentUser?.uid !== item.uid && (
        <TouchableOpacity
          onPress={() => handleToggleFollow(item.uid, item.isFollowing)}
          disabled={togglingFollowId === item.uid}
          style={[
            styles.followButton,
            item.isFollowing ? styles.followingButton : styles.notFollowingButton,
            togglingFollowId === item.uid && styles.disabledButton,
          ]}
        >
          {togglingFollowId === item.uid ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons
                name={item.isFollowing ? 'person-remove' : 'person-add'}
                size={16}
                color="#fff"
              />
              <Text style={styles.followButtonText}>
                {item.isFollowing ? 'Unfollow' : 'Follow'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : 'overFullScreen'}
    >
      <View
        style={[
          styles.modalWrapper,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : usersToDisplay.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          ) : (
            <FlatList
              data={usersToDisplay}
              keyExtractor={(item) => item.uid}
              renderItem={renderUserItem}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (themeColors: any) => StyleSheet.create({
  modalWrapper: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 0,
    backgroundColor: themeColors.background,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: themeColors.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: themeColors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: themeColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: themeColors.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    flex: 1,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  notFollowingButton: {
    backgroundColor: themeColors.primary,
  },
  followingButton: {
    backgroundColor: themeColors.textSecondary,
  },
  disabledButton: {
    opacity: 0.5,
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
});

export default UserListDrawer;