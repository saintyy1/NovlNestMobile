import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Dimensions,
  Share,
  Linking,
  Platform,
  FlatList,
  Animated,
} from 'react-native';
import { Ionicons, FontAwesome6 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import UserListDrawer from '../../components/UserListDrawer';
import type { Novel } from '../../types/novel';
import type { Poem } from '../../types/poem';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { ref, uploadBytes, deleteObject, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebase/config';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 3; // 3 columns with spacing

// Helper function to convert Firebase Storage URL to download URL format that bypasses CORS
const getFirebaseDownloadUrl = (url: string) => {
  if (!url || !url.includes("firebasestorage.app")) {
    return url;
  }

  try {
    // Convert Firebase Storage URL to download URL format that bypasses CORS
    const urlParts = url.split("/");
    const bucketName = urlParts[3]; // Extract bucket name
    const filePath = urlParts.slice(4).join("/"); // Extract file path

    // Create download URL format that doesn't require CORS
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media`;
  } catch (error) {
    console.log(`Error converting Firebase URL: ${error}`);
    return url;
  }
};

interface Announcement {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
}

const ProfileScreen = ({ route, navigation }: any) => {
  const { userId } = route.params || {};
  const { currentUser, updateUserPhoto, toggleFollow, updateUserProfile } = useAuth();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [profileUser, setProfileUser] = useState<any>(null);
  const [userNovels, setUserNovels] = useState<Novel[]>([]);
  const [userPoems, setUserPoems] = useState<Poem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'published' | 'pending' | 'all'>('all');
  const [contentType, setContentType] = useState<'novels' | 'poems'>('novels');
  
  // Follow states
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);
  
  // Announcement states
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnouncementContent, setNewAnnouncementContent] = useState('');
  const [submittingAnnouncement, setSubmittingAnnouncement] = useState(false);
  
  // Modal states
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showFollowListModal, setShowFollowListModal] = useState(false);
  const [followListType, setFollowListType] = useState<'followers' | 'following'>('followers');
  const [showEditNovelModal, setShowEditNovelModal] = useState(false);
  const [showEditPoemModal, setShowEditPoemModal] = useState(false);
  const [selectedNovel, setSelectedNovel] = useState<Novel | null>(null);
  const [selectedPoem, setSelectedPoem] = useState<Poem | null>(null);
  const [showTipModal, setShowTipModal] = useState(false);
  const [emailVisible, setEmailVisible] = useState(false);
  
  // Edit novel states
  const [editNovelTitle, setEditNovelTitle] = useState('');
  const [editNovelDescription, setEditNovelDescription] = useState('');
  const [editNovelSummary, setEditNovelSummary] = useState('');
  const [editNovelAuthorsNote, setEditNovelAuthorsNote] = useState('');
  const [editNovelPrologue, setEditNovelPrologue] = useState('');
  
  // Edit poem states
  const [editPoemTitle, setEditPoemTitle] = useState('');
  const [editPoemDescription, setEditPoemDescription] = useState('');
  const [editPoemContent, setEditPoemContent] = useState('');
  
  const isOwnProfile = !userId || userId === currentUser?.uid;
  const displayName = profileUser?.displayName || currentUser?.displayName || 'User';

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    if (!currentUser && !userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      let fetchedUser: any = null;

      if (userId && userId !== currentUser?.uid) {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          fetchedUser = { uid: userDoc.id, ...userDoc.data() };
        }
      } else {
        fetchedUser = currentUser;
      }

      setProfileUser(fetchedUser);
      setFollowersCount(fetchedUser?.followers?.length || 0);
      setFollowingCount(fetchedUser?.following?.length || 0);
      setEmailVisible(fetchedUser?.emailVisible ?? false);

      if (currentUser && fetchedUser) {
        setIsFollowing(fetchedUser.followers?.includes(currentUser.uid) || false);
      }

      // Fetch novels
      const targetUserId = userId || currentUser?.uid;
      if (targetUserId) {
        const novelsQuery = query(
          collection(db, 'novels'),
          where('authorId', '==', targetUserId),
          orderBy('createdAt', 'desc')
        );
        const novelsSnapshot = await getDocs(novelsQuery);
        const novels: Novel[] = [];
        novelsSnapshot.forEach((doc) => {
          novels.push({ id: doc.id, ...doc.data() } as Novel);
        });
        setUserNovels(novels);

        // Fetch poems
        const poemsQuery = query(
          collection(db, 'poems'),
          where('poetId', '==', targetUserId),
          orderBy('createdAt', 'desc')
        );
        const poemsSnapshot = await getDocs(poemsQuery);
        const poems: Poem[] = [];
        poemsSnapshot.forEach((doc) => {
          poems.push({ id: doc.id, ...doc.data() } as Poem);
        });
        setUserPoems(poems);
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
      Alert.alert('Error', 'Failed to load profile data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser, userId]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  // Fetch announcements
  useEffect(() => {
    if (!profileUser?.uid) return;
    const announcementsQuery = query(
      collection(db, 'announcements'),
      where('authorId', '==', profileUser.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(announcementsQuery, (snapshot) => {
      const fetchedAnnouncements: Announcement[] = [];
      snapshot.forEach((doc) => {
        fetchedAnnouncements.push({ id: doc.id, ...doc.data() } as Announcement);
      });
      setAnnouncements(fetchedAnnouncements);
    });
    return () => unsubscribe();
  }, [profileUser?.uid]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUserData();
  }, [fetchUserData]);

  const handlePhotoUpload = async () => {
    if (!currentUser) return;

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Permission to access camera roll is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      try {
        const uri = result.assets[0].uri;
        const response = await fetch(uri);
        const blob = await response.blob();
        
        // Convert to base64 for Firestore
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          await updateUserPhoto(base64data);
          Alert.alert('Success', 'Profile picture updated!');
          fetchUserData();
        };
      } catch (error) {
        console.error('Error uploading photo:', error);
        Alert.alert('Error', 'Failed to upload photo');
      }
    }
  };

  const handleRemovePhoto = async () => {
    if (!currentUser) return;
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove your profile picture?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateUserPhoto(null);
              Alert.alert('Success', 'Profile picture removed!');
              fetchUserData();
            } catch (error) {
              Alert.alert('Error', 'Failed to remove photo');
            }
          },
        },
      ]
    );
  };

  const handleFollowToggle = async () => {
    if (!currentUser || !profileUser || isOwnProfile) return;

    setIsTogglingFollow(true);
    try {
      await toggleFollow(profileUser.uid, isFollowing);
      setIsFollowing(!isFollowing);
      setFollowersCount((prev) => (isFollowing ? prev - 1 : prev + 1));
      Alert.alert('Success', isFollowing ? 'Unfollowed' : 'Following');
    } catch (error) {
      Alert.alert('Error', 'Failed to update follow status');
    } finally {
      setIsTogglingFollow(false);
    }
  };

  const handlePostAnnouncement = async () => {
    if (!newAnnouncementContent.trim() || !currentUser) return;

    setSubmittingAnnouncement(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        authorId: currentUser.uid,
        content: newAnnouncementContent.trim(),
        createdAt: new Date().toISOString(),
      });

      // Notify followers
      if (profileUser?.followers?.length > 0) {
        const notificationPromises = profileUser.followers.map((followerId: string) =>
          addDoc(collection(db, 'notifications'), {
            toUserId: followerId,
            fromUserId: currentUser.uid,
            fromUserName: currentUser.displayName || 'Author',
            type: 'followed_author_announcement',
            announcementContent: newAnnouncementContent.trim(),
            createdAt: new Date().toISOString(),
            read: false,
          })
        );
        await Promise.all(notificationPromises);
      }

      setNewAnnouncementContent('');
      Alert.alert('Success', 'Announcement posted!');
    } catch (error) {
      Alert.alert('Error', 'Failed to post announcement');
    } finally {
      setSubmittingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = (announcementId: string) => {
    Alert.alert(
      'Delete Announcement',
      'Are you sure you want to delete this announcement?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'announcements', announcementId));
              Alert.alert('Success', 'Announcement deleted!');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete announcement');
            }
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${displayName}'s profile on NovlNest! https://novlnest.com/profile/${userId || currentUser?.uid}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleToggleEmailVisibility = async () => {
    if (!currentUser) return;
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, { emailVisible: !emailVisible });
      setEmailVisible(!emailVisible);
      Alert.alert('Success', emailVisible ? 'Email is now private' : 'Email is now visible');
    } catch (error) {
      Alert.alert('Error', 'Failed to update email visibility');
    }
  };

  const handleEditNovel = (novel: Novel) => {
    setSelectedNovel(novel);
    setEditNovelTitle(novel.title);
    setEditNovelDescription(novel.description);
    setEditNovelSummary(novel.summary);
    setEditNovelAuthorsNote(novel.authorsNote || '');
    setEditNovelPrologue(novel.prologue || '');
    setShowEditNovelModal(true);
  };

  const handleSaveNovel = async () => {
    if (!selectedNovel) return;

    try {
      await updateDoc(doc(db, 'novels', selectedNovel.id), {
        title: editNovelTitle,
        description: editNovelDescription,
        summary: editNovelSummary,
        authorsNote: editNovelAuthorsNote,
        prologue: editNovelPrologue,
        updatedAt: new Date().toISOString(),
      });

      setUserNovels((prev) =>
        prev.map((n) =>
          n.id === selectedNovel.id
            ? { ...n, title: editNovelTitle, description: editNovelDescription, summary: editNovelSummary }
            : n
        )
      );

      Alert.alert('Success', 'Novel updated!');
      setShowEditNovelModal(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to update novel');
    }
  };

  const handleDeleteNovel = (novel: Novel) => {
    Alert.alert(
      'Delete Novel',
      `Are you sure you want to delete "${novel.title}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'novels', novel.id));
              setUserNovels((prev) => prev.filter((n) => n.id !== novel.id));
              Alert.alert('Success', 'Novel deleted!');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete novel');
            }
          },
        },
      ]
    );
  };

  const handleEditPoem = (poem: Poem) => {
    setSelectedPoem(poem);
    setEditPoemTitle(poem.title);
    setEditPoemDescription(poem.description);
    setEditPoemContent(poem.content);
    setShowEditPoemModal(true);
  };

  const handleSavePoem = async () => {
    if (!selectedPoem) return;

    try {
      await updateDoc(doc(db, 'poems', selectedPoem.id), {
        title: editPoemTitle,
        description: editPoemDescription,
        content: editPoemContent,
        updatedAt: new Date().toISOString(),
      });

      setUserPoems((prev) =>
        prev.map((p) =>
          p.id === selectedPoem.id
            ? { ...p, title: editPoemTitle, description: editPoemDescription, content: editPoemContent }
            : p
        )
      );

      Alert.alert('Success', 'Poem updated!');
      setShowEditPoemModal(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to update poem');
    }
  };

  const handleDeletePoem = (poem: Poem) => {
    Alert.alert(
      'Delete Poem',
      `Are you sure you want to delete "${poem.title}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'poems', poem.id));
              setUserPoems((prev) => prev.filter((p) => p.id !== poem.id));
              Alert.alert('Success', 'Poem deleted!');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete poem');
            }
          },
        },
      ]
    );
  };

  const getGenreColorClass = (genres: string[]) => {
    if (genres.includes('Fantasy')) return ['#8B5CF6', '#6366F1'];
    if (genres.includes('Sci-Fi')) return ['#3B82F6', '#06B6D4'];
    if (genres.includes('Romance')) return ['#EC4899', '#F43F5E'];
    if (genres.includes('Mystery')) return ['#EAB308', '#F59E0B'];
    if (genres.includes('Horror')) return ['#EF4444', '#F43F5E'];
    return ['#6B7280', '#1F2937'];
  };

  const getUserInitials = (name: string) => {
    if (!name) return 'U';
    return name.charAt(0).toUpperCase();
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const filteredNovels = userNovels.filter((novel) => {
    if (activeTab === 'published') return novel.published;
    if (activeTab === 'pending') return !novel.published;
    return true;
  });

  const filteredPoems = userPoems.filter((poem) => {
    if (activeTab === 'published') return poem.published;
    if (activeTab === 'pending') return !poem.published;
    return true;
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={styles.header}>
          {/* Profile Picture */}
          <TouchableOpacity
            onPress={() => profileUser?.photoURL && setShowPhotoModal(true)}
            style={styles.avatarContainer}
          >
            {profileUser?.photoURL ? (
              <Image source={{ uri: profileUser.photoURL }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{getUserInitials(displayName)}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Photo Actions */}
          {isOwnProfile && (
            <View style={styles.photoActions}>
              <TouchableOpacity onPress={handlePhotoUpload} style={styles.photoButton}>
                <Ionicons name="camera" size={16} color="#fff" />
              </TouchableOpacity>
              {profileUser?.photoURL && (
                <TouchableOpacity onPress={handleRemovePhoto} style={[styles.photoButton, styles.removeButton]}>
                  <Ionicons name="trash" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Name and Email */}
          <Text style={styles.displayName}>{displayName}</Text>
          
          <View style={styles.emailRow}>
            {emailVisible && <Text style={styles.email}>{profileUser?.email}</Text>}
            {isOwnProfile && (
              <TouchableOpacity onPress={handleToggleEmailVisibility} style={styles.eyeButton}>
                <Ionicons name={emailVisible ? 'eye' : 'eye-off'} size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Bio */}
          {profileUser?.bio && <Text style={styles.bio}>{profileUser.bio}</Text>}

          {/* Social Links */}
          <View style={styles.socialLinks}>
            {profileUser?.instagramUrl && (
              <TouchableOpacity onPress={() => Linking.openURL(profileUser.instagramUrl)}>
                <Ionicons name="logo-instagram" size={24} color="#E1306C" />
              </TouchableOpacity>
            )}
            {profileUser?.twitterUrl && (
              <TouchableOpacity onPress={() => Linking.openURL(profileUser.twitterUrl)}>
                <FontAwesome6 name="x-twitter" size={24} />
              </TouchableOpacity>
            )}
            {profileUser?.supportLink && (
              <TouchableOpacity onPress={() => setShowTipModal(true)}>
                <Ionicons name="gift" size={24} color="#10B981" />
              </TouchableOpacity>
            )}
          </View>

          {/* Stats */}
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Ionicons name="heart" size={16} color="#EF4444" />
              <Text style={styles.statText}>
                {userNovels.reduce((total, novel) => total + (novel.likes || 0), 0)} Likes
              </Text>
            </View>
            <TouchableOpacity
              style={styles.stat}
              onPress={() => {
                setFollowListType('followers');
                setShowFollowListModal(true);
              }}
            >
              <Ionicons name="people" size={16} color="#8B5CF6" />
              <Text style={styles.statText}>{followersCount} Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stat}
              onPress={() => {
                setFollowListType('following');
                setShowFollowListModal(true);
              }}
            >
              <Ionicons name="person-add" size={16} color="#8B5CF6" />
              <Text style={styles.statText}>{followingCount} Following</Text>
            </TouchableOpacity>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            {isOwnProfile ? (
              <>
                <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
                  <Ionicons name="share-social" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>Share Profile</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.actionButton, isFollowing ? styles.secondaryButton : styles.primaryButton]}
                  onPress={handleFollowToggle}
                  disabled={isTogglingFollow}
                >
                  <Ionicons name={isFollowing ? 'person-remove' : 'person-add'} size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>{isFollowing ? 'Unfollow' : 'Follow'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.messageButton]}
                  onPress={() => navigation.navigate('Messages', { userId: profileUser.uid })}
                >
                  <Ionicons name="chatbubble" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>Message</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
                  <Ionicons name="share-social" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>Share</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Announcements Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="megaphone" size={24} color="#8B5CF6" />
            <Text style={styles.sectionTitle}>Announcements</Text>
          </View>

          {isOwnProfile && (
            <View style={styles.announcementInput}>
              <TextInput
                style={styles.textArea}
                placeholder="Post a new announcement..."
                placeholderTextColor="#6B7280"
                value={newAnnouncementContent}
                onChangeText={setNewAnnouncementContent}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.postButton, !newAnnouncementContent.trim() && styles.disabledButton]}
                onPress={handlePostAnnouncement}
                disabled={!newAnnouncementContent.trim() || submittingAnnouncement}
              >
                {submittingAnnouncement ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={styles.postButtonText}>Post</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {announcements.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No announcements yet</Text>
            </View>
          ) : (
            announcements.map((announcement) => (
              <View key={announcement.id} style={styles.announcement}>
                <Text style={styles.announcementText}>{announcement.content}</Text>
                <View style={styles.announcementFooter}>
                  <Text style={styles.announcementDate}>{formatDateTime(announcement.createdAt)}</Text>
                  {isOwnProfile && (
                    <TouchableOpacity onPress={() => handleDeleteAnnouncement(announcement.id)}>
                      <Ionicons name="trash" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        {/* Content Section */}
        <View style={styles.section}>
          {/* Content Type Tabs */}
          <View style={styles.contentTypeTabs}>
            <TouchableOpacity
              style={[styles.contentTypeTab, contentType === 'novels' && styles.activeContentTypeTab]}
              onPress={() => setContentType('novels')}
            >
              <Ionicons name="book" size={20} color={contentType === 'novels' ? '#fff' : '#9CA3AF'} />
              <Text style={[styles.contentTypeText, contentType === 'novels' && styles.activeContentTypeText]}>
                Novels ({userNovels.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contentTypeTab, contentType === 'poems' && styles.activeContentTypeTab]}
              onPress={() => setContentType('poems')}
            >
              <Ionicons name="rose" size={20} color={contentType === 'poems' ? '#fff' : '#9CA3AF'} />
              <Text style={[styles.contentTypeText, contentType === 'poems' && styles.activeContentTypeText]}>
                Poems ({userPoems.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Status Tabs */}
          <View style={styles.statusTabs}>
            <TouchableOpacity
              style={[styles.statusTab, activeTab === 'all' && styles.activeStatusTab]}
              onPress={() => setActiveTab('all')}
            >
              <Text style={[styles.statusTabText, activeTab === 'all' && styles.activeStatusTabText]}>
                All ({contentType === 'novels' ? userNovels.length : userPoems.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statusTab, activeTab === 'published' && styles.activeStatusTab]}
              onPress={() => setActiveTab('published')}
            >
              <Text style={[styles.statusTabText, activeTab === 'published' && styles.activeStatusTabText]}>
                Published ({contentType === 'novels' ? filteredNovels.length : filteredPoems.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statusTab, activeTab === 'pending' && styles.activeStatusTab]}
              onPress={() => setActiveTab('pending')}
            >
              <Text style={[styles.statusTabText, activeTab === 'pending' && styles.activeStatusTabText]}>
                Pending ({contentType === 'novels' ? userNovels.filter(n => !n.published).length : userPoems.filter(p => !p.published).length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content Grid */}
          {contentType === 'novels' ? (
            filteredNovels.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="book-outline" size={48} color="#6B7280" />
                <Text style={styles.emptyText}>No novels yet</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {filteredNovels.map((novel) => (
                  <TouchableOpacity
                    key={novel.id}
                    style={styles.card}
                    onPress={() => novel.published && navigation.navigate('NovelOverview', { novelId: novel.id })}
                    onLongPress={() => isOwnProfile && Alert.alert(
                      novel.title,
                      'Choose an action',
                      [
                        { text: 'Edit', onPress: () => handleEditNovel(novel) },
                        { text: 'Add Chapters', onPress: () => navigation.navigate('AddChapters', { novelId: novel.id }) },
                        { text: 'Delete', onPress: () => handleDeleteNovel(novel), style: 'destructive' },
                        { text: 'Cancel', style: 'cancel' },
                      ]
                    )}
                  >
                    {(novel.coverSmallImage || novel.coverImage) ? (
                      <Image 
                        source={{ uri: getFirebaseDownloadUrl(novel.coverSmallImage || novel.coverImage || '') }} 
                        style={styles.cover}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.coverPlaceholder, { backgroundColor: getGenreColorClass(novel.genres)[0] }]}>
                        <Text style={styles.coverTitle} numberOfLines={3}>{novel.title}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )
          ) : (
            filteredPoems.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="rose-outline" size={48} color="#6B7280" />
                <Text style={styles.emptyText}>No poems yet</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {filteredPoems.map((poem) => (
                  <TouchableOpacity
                    key={poem.id}
                    style={styles.card}
                    onPress={() => poem.published && navigation.navigate('PoemOverview', { poemId: poem.id })}
                    onLongPress={() => isOwnProfile && Alert.alert(
                      poem.title,
                      'Choose an action',
                      [
                        { text: 'Edit', onPress: () => handleEditPoem(poem) },
                        { text: 'Delete', onPress: () => handleDeletePoem(poem), style: 'destructive' },
                        { text: 'Cancel', style: 'cancel' },
                      ]
                    )}
                  >
                    {(poem.coverSmallImage || poem.coverImage) ? (
                      <Image 
                        source={{ uri: getFirebaseDownloadUrl(poem.coverSmallImage || poem.coverImage || '') }} 
                        style={styles.cover}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.coverPlaceholder, { backgroundColor: '#EC4899' }]}>
                        <Text style={styles.coverTitle} numberOfLines={3}>{poem.title}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )
          )}
        </View>
      </ScrollView>

      {/* Photo Modal */}
      <Modal visible={showPhotoModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalClose} onPress={() => setShowPhotoModal(false)}>
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          <Image source={{ uri: profileUser?.photoURL }} style={styles.fullPhoto} resizeMode="contain" />
        </View>
      </Modal>

      {/* Edit Novel Modal */}
      <Modal visible={showEditNovelModal} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Novel</Text>
            <TouchableOpacity onPress={() => setShowEditNovelModal(false)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                value={editNovelTitle}
                onChangeText={setEditNovelTitle}
                placeholder="Novel title"
                placeholderTextColor="#6B7280"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editNovelDescription}
                onChangeText={setEditNovelDescription}
                placeholder="Brief description"
                placeholderTextColor="#6B7280"
                multiline
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Summary</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editNovelSummary}
                onChangeText={setEditNovelSummary}
                placeholder="Detailed summary"
                placeholderTextColor="#6B7280"
                multiline
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Author's Note</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editNovelAuthorsNote}
                onChangeText={setEditNovelAuthorsNote}
                placeholder="Optional author's note"
                placeholderTextColor="#6B7280"
                multiline
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Prologue</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editNovelPrologue}
                onChangeText={setEditNovelPrologue}
                placeholder="Optional prologue"
                placeholderTextColor="#6B7280"
                multiline
              />
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveNovel}>
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Poem Modal */}
      <Modal visible={showEditPoemModal} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Poem</Text>
            <TouchableOpacity onPress={() => setShowEditPoemModal(false)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                value={editPoemTitle}
                onChangeText={setEditPoemTitle}
                placeholder="Poem title"
                placeholderTextColor="#6B7280"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editPoemDescription}
                onChangeText={setEditPoemDescription}
                placeholder="Brief description"
                placeholderTextColor="#6B7280"
                multiline
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Content</Text>
              <TextInput
                style={[styles.input, styles.textArea, { minHeight: 200 }]}
                value={editPoemContent}
                onChangeText={setEditPoemContent}
                placeholder="Your poem content..."
                placeholderTextColor="#6B7280"
                multiline
              />
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={handleSavePoem}>
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Tip Modal */}
      <Modal visible={showTipModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.tipModal}>
            <View style={styles.tipHeader}>
              <Ionicons name="gift" size={32} color="#10B981" />
              <Text style={styles.tipTitle}>Support this Author</Text>
              <TouchableOpacity onPress={() => setShowTipModal(false)} style={styles.tipClose}>
                <Ionicons name="close" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <View style={styles.tipContent}>
              {profileUser?.supportLink?.startsWith('http') ? (
                <>
                  <Text style={styles.tipLabel}>Support Link:</Text>
                  <Text style={styles.tipValue}>{profileUser.supportLink}</Text>
                  <TouchableOpacity
                    style={styles.tipButton}
                    onPress={() => Linking.openURL(profileUser.supportLink)}
                  >
                    <Ionicons name="open" size={20} color="#fff" />
                    <Text style={styles.tipButtonText}>Open Link</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.tipLabel}>Bank: {profileUser?.supportLink?.split(':')[0]}</Text>
                  <Text style={styles.tipLabel}>
                    Account: {profileUser?.supportLink?.split(':')[1]?.split(',')[0]?.trim()}
                  </Text>
                  <Text style={styles.tipLabel}>
                    Name: {profileUser?.supportLink?.split(',')[1]?.trim()}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Follow List Drawer */}
      <UserListDrawer
        isOpen={showFollowListModal}
        onClose={() => setShowFollowListModal(false)}
        userIds={followListType === 'followers' ? (profileUser?.followers || []) : (profileUser?.following || [])}
        title={followListType === 'followers' ? 'Followers' : 'Following'}
        navigation={navigation}
      />
    </View>
  );
};

const getStyles = (themeColors: any) => ({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: themeColors.background,
  },
  header: {
    padding: 20,
    backgroundColor: themeColors.surface,
    alignItems: 'center' as const,
  },
  avatarContainer: {
    marginBottom: 12,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: themeColors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold' as const,
    color: '#fff',
  },
  photoActions: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 12,
  },
  photoButton: {
    backgroundColor: themeColors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  removeButton: {
    backgroundColor: themeColors.error,
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: themeColors.text,
    marginBottom: 4,
  },
  emailRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 8,
  },
  email: {
    fontSize: 14,
    color: themeColors.textSecondary,
  },
  eyeButton: {
    padding: 4,
  },
  bio: {
    fontSize: 14,
    color: themeColors.text,
    textAlign: 'center' as const,
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  socialLinks: {
    flexDirection: 'row' as const,
    gap: 16,
    marginBottom: 16,
  },
  stats: {
    flexDirection: 'row' as const,
    justifyContent: 'space-around' as const,
    width: '100%' as any,
    marginBottom: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: themeColors.border,
  },
  stat: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  statText: {
    fontSize: 14,
    color: themeColors.text,
  },
  actionButtons: {
    flexDirection: 'row' as const,
    gap: 8,
    width: '100%' as any,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: themeColors.cardBorder,
    gap: 6,
  },
  primaryButton: {
    backgroundColor: themeColors.primary,
  },
  secondaryButton: {
    backgroundColor: themeColors.textSecondary,
  },
  messageButton: {
    backgroundColor: themeColors.success,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#fff',
  },
  section: {
    padding: 16,
    backgroundColor: themeColors.surface,
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: themeColors.text,
  },
  announcementInput: {
    backgroundColor: themeColors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top' as const,
  },
  postButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: themeColors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    gap: 6,
  },
  disabledButton: {
    opacity: 0.5,
  },
  postButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#fff',
  },
  announcement: {
    backgroundColor: themeColors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  announcementText: {
    fontSize: 14,
    color: themeColors.text,
    marginBottom: 8,
  },
  announcementFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  announcementDate: {
    fontSize: 12,
    color: themeColors.textSecondary,
  },
  emptyState: {
    alignItems: 'center' as const,
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: themeColors.textSecondary,
    marginTop: 8,
  },
  contentTypeTabs: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 16,
  },
  contentTypeTab: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: themeColors.card,
    gap: 8,
  },
  activeContentTypeTab: {
    backgroundColor: themeColors.primary,
  },
  contentTypeText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: themeColors.textSecondary,
  },
  activeContentTypeText: {
    color: '#fff',
  },
  statusTabs: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 16,
  },
  statusTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: themeColors.card,
    alignItems: 'center' as const,
  },
  activeStatusTab: {
    backgroundColor: themeColors.primary,
  },
  statusTabText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: themeColors.textSecondary,
  },
  activeStatusTabText: {
    color: '#fff',
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
  },
  card: {
    width: CARD_WIDTH,
    aspectRatio: 3 / 4,
    borderRadius: 8,
    overflow: 'hidden' as const,
  },
  cover: {
    width: '100%' as any,
    height: '100%' as any,
  },
  coverPlaceholder: {
    width: '100%' as any,
    height: '100%' as any,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 12,
  },
  coverTitle: {
    fontSize: 12,
    fontWeight: 'bold' as const,
    color: '#fff',
    textAlign: 'center' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  modalClose: {
    position: 'absolute' as const,
    top: 50,
    right: 20,
    zIndex: 10,
  },
  fullPhoto: {
    width: '100%' as any,
    height: '100%' as any,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingTop: 50,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: themeColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  modalTitle: {
    fontSize: 25,
    fontWeight: 'bold' as const,
    color: themeColors.text,
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
    color: themeColors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: themeColors.card,
    borderRadius: 8,
    padding: 12,
    color: themeColors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  charCount: {
    fontSize: 12,
    color: themeColors.textSecondary,
    marginTop: 4,
    textAlign: 'right' as const,
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
    backgroundColor: themeColors.card,
    alignItems: 'center' as const,
    borderWidth: 2,
    borderColor: themeColors.cardBorder,
  },
  pickerButtonActive: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  pickerText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: themeColors.textSecondary,
  },
  pickerTextActive: {
    color: '#fff',
  },
  saveButton: {
    backgroundColor: themeColors.primary,
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
  tipModal: {
    backgroundColor: themeColors.surface,
    borderRadius: 16,
    padding: 24,
    width: '90%' as any,
    maxWidth: 400,
  },
  tipHeader: {
    alignItems: 'center' as const,
    marginBottom: 20,
  },
  tipTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: themeColors.text,
    marginTop: 12,
  },
  tipClose: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
  },
  tipContent: {
    marginBottom: 20,
  },
  tipLabel: {
    fontSize: 14,
    color: themeColors.text,
    marginBottom: 8,
  },
  tipValue: {
    fontSize: 14,
    color: themeColors.text,
    marginBottom: 16,
  },
  tipButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: themeColors.success,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  tipButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#fff',
  },
});

export default ProfileScreen;