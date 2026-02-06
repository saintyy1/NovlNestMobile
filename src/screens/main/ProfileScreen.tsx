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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome6, MaterialCommunityIcons } from '@expo/vector-icons';
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
import { ref, uploadBytes, deleteObject } from 'firebase/storage';
import { storage } from '../../firebase/config';
import CachedImage from '../../components/CachedImage';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2; // 2 columns with spacing

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
  const [showFollowListModal, setShowFollowListModal] = useState(false);
  const [followListType, setFollowListType] = useState<'followers' | 'following'>('followers');
  const [showEditNovelModal, setShowEditNovelModal] = useState(false);
  const [showEditPoemModal, setShowEditPoemModal] = useState(false);
  const [selectedNovel, setSelectedNovel] = useState<Novel | null>(null);
  const [selectedPoem, setSelectedPoem] = useState<Poem | null>(null);
  const [showTipModal, setShowTipModal] = useState(false);
  const [emailVisible, setEmailVisible] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [actionSheetNovel, setActionSheetNovel] = useState<Novel | null>(null);
  const [actionSheetPoem, setActionSheetPoem] = useState<Poem | null>(null);
  
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
  
  // Edit cover states
  const [uploadingEditCover, setUploadingEditCover] = useState(false);
  const [editCoverError, setEditCoverError] = useState('');
  const [uploadingEditPoemCover, setUploadingEditPoemCover] = useState(false);
  const [editPoemCoverError, setEditPoemCoverError] = useState('');
  
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

  const handleEditCoverUpload = useCallback(async () => {
    if (!selectedNovel || !isOwnProfile) return;

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Permission to access camera roll is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      try {
        setUploadingEditCover(true);
        setEditCoverError('');

        const uri = result.assets[0].uri;
        const response = await fetch(uri);
        const blob = await response.blob();

        // Upload large cover
        const coverRef = ref(storage, `covers-large/${selectedNovel.id}.jpg`);
        await uploadBytes(coverRef, blob, { contentType: 'image/jpeg' });

        // Create a small version by uploading the same blob with a different path
        // (In production, you could use Cloud Functions to resize)
        const coverSmallRef = ref(storage, `covers-small/${selectedNovel.id}.jpg`);
        await uploadBytes(coverSmallRef, blob, { contentType: 'image/jpeg' });

        const coverUrl = `https://storage.googleapis.com/novelnest-50ab1.firebasestorage.app/covers-large/${selectedNovel.id}.jpg`;
        const coverSmallUrl = `https://storage.googleapis.com/novelnest-50ab1.firebasestorage.app/covers-small/${selectedNovel.id}.jpg`;

        const novelRef = doc(db, 'novels', selectedNovel.id);
        await updateDoc(novelRef, { coverImage: coverUrl, coverSmallImage: coverSmallUrl });

        setUserNovels((prevNovels) =>
          prevNovels.map((novel) =>
            novel.id === selectedNovel.id ? { ...novel, coverImage: coverUrl, coverSmallImage: coverSmallUrl } : novel
          )
        );

        setSelectedNovel((prev: any) => (prev ? { ...prev, coverImage: coverUrl, coverSmallImage: coverSmallUrl } : prev));
        setEditCoverError('Novel cover updated successfully!');
        setTimeout(() => setEditCoverError(''), 3000);
      } catch (err) {
        console.error('Error uploading novel cover:', err);
        setEditCoverError('Failed to upload novel cover. Please try again.');
      } finally {
        setUploadingEditCover(false);
      }
    }
  }, [selectedNovel, isOwnProfile]);

  const removeEditCover = useCallback(async () => {
    if (!selectedNovel || !isOwnProfile) return;
    try {
      setUploadingEditCover(true);
      setEditCoverError('');

      const coverRef = ref(storage, `covers-large/${selectedNovel.id}.jpg`);
      const coverSmallRef = ref(storage, `covers-small/${selectedNovel.id}.jpg`);

      try {
        await Promise.all([deleteObject(coverRef), deleteObject(coverSmallRef)]);
      } catch (error) {
        console.log('Files may not exist in storage:', error);
      }

      const novelRef = doc(db, 'novels', selectedNovel.id);
      await updateDoc(novelRef, { coverImage: null, coverSmallImage: null });

      setUserNovels((prevNovels) =>
        prevNovels.map((novel) =>
          novel.id === selectedNovel.id ? { ...novel, coverImage: null, coverSmallImage: null } : novel
        )
      );

      setSelectedNovel((prev: any) => (prev ? { ...prev, coverImage: null, coverSmallImage: null } : prev));
      setEditCoverError('Novel cover removed successfully!');
      setTimeout(() => setEditCoverError(''), 3000);
    } catch (err) {
      console.error('Error removing novel cover:', err);
      setEditCoverError('Failed to remove novel cover. Please try again.');
    } finally {
      setUploadingEditCover(false);
    }
  }, [selectedNovel, isOwnProfile]);

  // Poem cover upload handler
  const handleEditPoemCoverUpload = useCallback(async () => {
    if (!selectedPoem || !isOwnProfile) return;

    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Permission to access camera roll is required!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      try {
        setUploadingEditPoemCover(true);
        setEditPoemCoverError('');

        const uri = result.assets[0].uri;
        const response = await fetch(uri);
        const blob = await response.blob();

        // Upload large cover
        const coverRef = ref(storage, `poem-covers-large/${selectedPoem.id}.jpg`);
        await uploadBytes(coverRef, blob, { contentType: 'image/jpeg' });

        // Create a small version by uploading the same blob with a different path
        const coverSmallRef = ref(storage, `poem-covers-small/${selectedPoem.id}.jpg`);
        await uploadBytes(coverSmallRef, blob, { contentType: 'image/jpeg' });

        const coverUrl = `https://storage.googleapis.com/novelnest-50ab1.firebasestorage.app/poem-covers-large/${selectedPoem.id}.jpg`;
        const coverSmallUrl = `https://storage.googleapis.com/novelnest-50ab1.firebasestorage.app/poem-covers-small/${selectedPoem.id}.jpg`;

        const poemRef = doc(db, 'poems', selectedPoem.id);
        await updateDoc(poemRef, { coverImage: coverUrl, coverSmallImage: coverSmallUrl });

        setUserPoems((prevPoems) =>
          prevPoems.map((poem) =>
            poem.id === selectedPoem.id ? { ...poem, coverImage: coverUrl, coverSmallImage: coverSmallUrl } : poem
          )
        );

        setSelectedPoem((prev: any) => (prev ? { ...prev, coverImage: coverUrl, coverSmallImage: coverSmallUrl } : prev));
        setEditPoemCoverError('Poem cover updated successfully!');
        setTimeout(() => setEditPoemCoverError(''), 3000);
      } catch (err) {
        console.error('Error uploading poem cover:', err);
        setEditPoemCoverError('Failed to upload poem cover. Please try again.');
      } finally {
        setUploadingEditPoemCover(false);
      }
    }
  }, [selectedPoem, isOwnProfile]);

  const removeEditPoemCover = useCallback(async () => {
    if (!selectedPoem || !isOwnProfile) return;
    try {
      setUploadingEditPoemCover(true);
      setEditPoemCoverError('');

      const coverRef = ref(storage, `poem-covers-large/${selectedPoem.id}.jpg`);
      const coverSmallRef = ref(storage, `poem-covers-small/${selectedPoem.id}.jpg`);

      try {
        await Promise.all([deleteObject(coverRef), deleteObject(coverSmallRef)]);
      } catch (error) {
        console.log('Files may not exist in storage:', error);
      }

      const poemRef = doc(db, 'poems', selectedPoem.id);
      await updateDoc(poemRef, { coverImage: null, coverSmallImage: null });

      setUserPoems((prevPoems) =>
        prevPoems.map((poem) =>
          poem.id === selectedPoem.id ? { ...poem, coverImage: null, coverSmallImage: null } : poem
        )
      );

      setSelectedPoem((prev: any) => (prev ? { ...prev, coverImage: null, coverSmallImage: null } : prev));
      setEditPoemCoverError('Cover removed successfully!');
      setTimeout(() => setEditPoemCoverError(''), 3000);
    } catch (error) {
      console.error('Error removing cover:', error);
      setEditPoemCoverError('Failed to remove cover. Please try again.');
    } finally {
      setUploadingEditPoemCover(false);
    }
  }, [selectedPoem, isOwnProfile]);

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
      {/* Custom Header with SafeAreaView */}
      <SafeAreaView style={[styles.customHeader, { backgroundColor: colors.primary }]} edges={['top', 'left', 'right']}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
            <Ionicons name="share-outline" size={24} color="#fff" />
          </TouchableOpacity>
          {isOwnProfile && (
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.headerButton}>
              <Ionicons name="settings-outline" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Header with Gradient Background */}
        <View style={[styles.heroHeader, { backgroundColor: colors.primary + '15' }]}>
          {/* Background Accent */}
          <View style={styles.heroAccent} />
          
          {/* Profile Info */}
          <View style={styles.heroContent}>
            {/* Avatar with Badge */}
            <View style={styles.avatarWrapper}>
              <TouchableOpacity
                onPress={() => profileUser?.photoURL && setShowPhotoModal(true)}
                style={styles.avatarContainer}
              >
                {profileUser?.photoURL ? (
                  <Image source={{ uri: profileUser.photoURL }} style={styles.heroAvatar} />
                ) : (
                  <View style={[styles.heroAvatarPlaceholder, { backgroundColor: colors.primary }]}>
                    <Text style={styles.heroAvatarText}>{getUserInitials(displayName)}</Text>
                  </View>
                )}
              </TouchableOpacity>
              
              {/* Edit Photo Floating Button */}
              {isOwnProfile && (
                <TouchableOpacity style={styles.editPhotoButton} onPress={handlePhotoUpload}>
                  <Ionicons name="camera-outline" size={16} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Name Section */}
            <View style={styles.nameSection}>
              <Text style={[styles.displayName, { color: colors.text }]}>{displayName}</Text>
              {profileUser?.bio && (
                <Text style={[styles.bio]}>{profileUser.bio}</Text>
              )}
            </View>
          </View>

          {/* Stats Bar - Horizontal Scrollable */}
          <View style={styles.statsBar}>
            <View style={[styles.statItem, { borderRightWidth: 1, borderRightColor: colors.cardBorder }]}>
              <Text style={[styles.statNumber, { color: colors.primary }]}>
                {userNovels.reduce((total, novel) => total + (novel.likes || 0), 0)}
              </Text>
              <Text style={[styles.statName, { color: colors.textSecondary }]}>Likes</Text>
            </View>
            
            <TouchableOpacity 
              style={[styles.statItem, { borderRightWidth: 1, borderRightColor: colors.cardBorder }]}
              onPress={() => {
                setFollowListType('followers');
                setShowFollowListModal(true);
              }}
            >
              <Text style={[styles.statNumber, { color: colors.primary }]}>{followersCount}</Text>
              <Text style={[styles.statName, { color: colors.textSecondary }]}>Followers</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.statItem}
              onPress={() => {
                setFollowListType('following');
                setShowFollowListModal(true);
              }}
            >
              <Text style={[styles.statNumber, { color: colors.primary }]}>{followingCount}</Text>
              <Text style={[styles.statName, { color: colors.textSecondary }]}>Following</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Action Buttons - Full Width Cards */}
        {!isOwnProfile && (
          <View style={[styles.actionSection, { backgroundColor: colors.surface }]}>
            <TouchableOpacity 
              style={[
                styles.actionCard,
                isFollowing 
                  ? { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary }
                  : { backgroundColor: colors.primary }
              ]}
              onPress={handleFollowToggle}
              disabled={isTogglingFollow}
            >
              <View style={styles.actionCardContent}>
                {isTogglingFollow ? (
                  <ActivityIndicator size="small" color={isFollowing ? colors.primary : '#fff'} />
                ) : (
                  <Ionicons 
                    name={isFollowing ? 'person-remove-outline' : 'person-add-outline'} 
                    size={20} 
                    color={isFollowing ? colors.primary : '#fff'} 
                  />
                )}
                <Text style={[
                  styles.actionCardText,
                  isFollowing && { color: colors.primary }
                ]}>
                  {isTogglingFollow ? 'Loading...' : (isFollowing ? 'Following' : 'Follow')}
                </Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionCard, { backgroundColor: colors.success }]}
              onPress={() => {
                // Navigate back to MainTabs, then to Messages tab with userId param
                navigation.navigate('MainTabs' as any, { 
                  screen: 'Messages',
                  params: { userId: profileUser.uid }
                });
              }}
            >
              <View style={styles.actionCardContent}>
                <Ionicons name="chatbubble-outline" size={20} color="#fff" />
                <Text style={styles.actionCardText}>Send Message</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Social Links Section */}
        {(profileUser?.instagramUrl || profileUser?.twitterUrl || profileUser?.supportLink || emailVisible) && (
          <View style={[styles.socialSection, { backgroundColor: colors.surface }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="link" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Connect</Text>
            </View>
            
            <View style={styles.socialLinksGrid}>
              {profileUser?.instagramUrl && (
                <TouchableOpacity 
                  style={[styles.socialCard, { backgroundColor: colors.card }]}
                  onPress={() => Linking.openURL(profileUser.instagramUrl)}
                >
                  <View style={[styles.socialCardIcon, { backgroundColor: '#FFC0E0' }]}>
                    <Ionicons name="logo-instagram" size={24} color="#E1306C" />
                  </View>
                  <Text style={[styles.socialCardText, { color: colors.text }]}>Instagram</Text>
                </TouchableOpacity>
              )}
              
              {profileUser?.twitterUrl && (
                <TouchableOpacity 
                  style={[styles.socialCard, { backgroundColor: colors.card }]}
                  onPress={() => Linking.openURL(profileUser.twitterUrl)}
                >
                  <View style={[styles.socialCardIcon, { backgroundColor: '#DBEAFE' }]}>
                    <FontAwesome6 name="x-twitter" size={24} />
                  </View>
                  <Text style={[styles.socialCardText, { color: colors.text }]}>X</Text>
                </TouchableOpacity>
              )}
              
              {profileUser?.supportLink && (
                <TouchableOpacity 
                  style={[styles.socialCard, { backgroundColor: colors.card }]}
                  onPress={() => setShowTipModal(true)}
                >
                  <View style={[styles.socialCardIcon, { backgroundColor: '#DCFCE7' }]}>
                    <Ionicons name="gift-outline" size={24} color="#10B981" />
                  </View>
                  <Text style={[styles.socialCardText, { color: colors.text }]}>Support</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Announcements Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ 
              backgroundColor: colors.primary, 
              borderRadius: 12, 
              padding: 8 
            }}>
              <Ionicons name="megaphone" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Announcements</Text>
              {announcements.length > 0 && (
                <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{announcements.length} recent update{announcements.length !== 1 ? 's' : ''}</Text>
              )}
            </View>
          </View>

          {isOwnProfile && (
            <View style={styles.announcementInput}>
              <TextInput
                style={styles.textArea}
                placeholder="Share an update with your followers..."
                placeholderTextColor={colors.textSecondary}
                value={newAnnouncementContent}
                onChangeText={setNewAnnouncementContent}
                multiline
                maxLength={500}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <Text style={styles.charCount}>{newAnnouncementContent.length}/500</Text>
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
            </View>
          )}

          {announcements.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="bell-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No announcements yet</Text>
            </View>
          ) : (
            announcements.map((announcement) => (
              <View key={announcement.id} style={styles.announcement}>
                <Text style={styles.announcementText}>{announcement.content}</Text>
                <View style={styles.announcementFooter}>
                  <Text style={styles.announcementDate}>{formatDateTime(announcement.createdAt)}</Text>
                  {isOwnProfile && (
                    <TouchableOpacity 
                      onPress={() => handleDeleteAnnouncement(announcement.id)}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
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
              <Ionicons name="book" size={20} color={contentType === 'novels' ? '#fff' : colors.textSecondary} />
              <View style={{ alignItems: 'center' }}>
                <Text style={[styles.contentTypeText, contentType === 'novels' && styles.activeContentTypeText]}>
                  Novels
                </Text>
                <Text style={[styles.contentTypeText, contentType === 'novels' && styles.activeContentTypeText, { fontSize: 11 }]}>
                  {userNovels.length}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contentTypeTab, contentType === 'poems' && styles.activeContentTypeTab]}
              onPress={() => setContentType('poems')}
            >
              <Ionicons name="rose" size={20} color={contentType === 'poems' ? '#fff' : colors.textSecondary} />
              <View style={{ alignItems: 'center' }}>
                <Text style={[styles.contentTypeText, contentType === 'poems' && styles.activeContentTypeText]}>
                  Poems
                </Text>
                <Text style={[styles.contentTypeText, contentType === 'poems' && styles.activeContentTypeText, { fontSize: 11 }]}>
                  {userPoems.length}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Status Tabs */}
          <View style={styles.statusTabs}>
            <TouchableOpacity
              style={[styles.statusTab, activeTab === 'all' && styles.activeStatusTab]}
              onPress={() => setActiveTab('all')}
            >
              <Text style={[styles.statusTabText, activeTab === 'all' && styles.activeStatusTabText]}>
                All
              </Text>
              <Text style={[styles.statusTabText, activeTab === 'all' && styles.activeStatusTabText, { fontSize: 10 }]}>
                ({contentType === 'novels' ? userNovels.length : userPoems.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statusTab, activeTab === 'published' && styles.activeStatusTab]}
              onPress={() => setActiveTab('published')}
            >
              <Text style={[styles.statusTabText, activeTab === 'published' && styles.activeStatusTabText]}>
                Published
              </Text>
              <Text style={[styles.statusTabText, activeTab === 'published' && styles.activeStatusTabText, { fontSize: 10 }]}>
                ({contentType === 'novels' ? filteredNovels.length : filteredPoems.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statusTab, activeTab === 'pending' && styles.activeStatusTab]}
              onPress={() => setActiveTab('pending')}
            >
              <Text style={[styles.statusTabText, activeTab === 'pending' && styles.activeStatusTabText]}>
                In Review
              </Text>
              <Text style={[styles.statusTabText, activeTab === 'pending' && styles.activeStatusTabText, { fontSize: 10 }]}>
                ({contentType === 'novels' ? userNovels.filter(n => !n.published).length : userPoems.filter(p => !p.published).length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Long press hint for own profile */}
          {isOwnProfile && (userNovels.length > 0 || userPoems.length > 0) && (
            <View style={styles.longPressHint}>
              <Ionicons name="finger-print-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.longPressHintText, { color: colors.textSecondary }]}>
                Long press to edit, add chapters, or promote
              </Text>
            </View>
          )}

          {/* Content Grid */}
          {contentType === 'novels' ? (
            filteredNovels.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="book-outline" size={56} color={colors.textSecondary} />
                <Text style={styles.emptyText}>No novels {activeTab === 'published' ? 'published' : 'yet'}</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {filteredNovels.map((novel) => (
                  <TouchableOpacity
                    key={novel.id}
                    style={styles.card}
                    onPress={() => novel.published && navigation.navigate('NovelOverview', { novelId: novel.id })}
                    onLongPress={() => {
                      if (isOwnProfile) {
                        setActionSheetNovel(novel);
                        setActionSheetPoem(null);
                        setShowActionSheet(true);
                      }
                    }}
                  >
                    {(novel.coverSmallImage || novel.coverImage) ? (
                      <CachedImage
                        uri={getFirebaseDownloadUrl(novel.coverSmallImage || novel.coverImage || '')}
                        style={styles.cover}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.coverPlaceholder, { backgroundColor: getGenreColorClass(novel.genres)[0] }]}>
                        <Text style={styles.coverTitle} numberOfLines={3}>{novel.title}</Text>
                      </View>
                    )}
                    {!novel.published && (
                      <View style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 6,
                      }}>
                        <Text style={{ fontSize: 10, color: '#fff', fontWeight: '600' }}>Draft</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )
          ) : (
            filteredPoems.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="rose-outline" size={56} color={colors.textSecondary} />
                <Text style={styles.emptyText}>No poems {activeTab === 'published' ? 'published' : 'yet'}</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {filteredPoems.map((poem) => (
                  <TouchableOpacity
                    key={poem.id}
                    style={styles.card}
                    onPress={() => poem.published && navigation.navigate('PoemOverview', { poemId: poem.id })}
                    onLongPress={() => {
                      if (isOwnProfile) {
                        setActionSheetPoem(poem);
                        setActionSheetNovel(null);
                        setShowActionSheet(true);
                      }
                    }}
                  >
                    {(poem.coverSmallImage || poem.coverImage) ? (
                      <CachedImage
                        uri={getFirebaseDownloadUrl(poem.coverSmallImage || poem.coverImage || '')}
                        style={styles.cover}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.coverPlaceholder, { backgroundColor: '#EC4899' }]}>
                        <Text style={styles.coverTitle} numberOfLines={3}>{poem.title}</Text>
                      </View>
                    )}
                    {!poem.published && (
                      <View style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 6,
                      }}>
                        <Text style={{ fontSize: 10, color: '#fff', fontWeight: '600' }}>Draft</Text>
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
          <CachedImage uri={profileUser?.photoURL} style={styles.fullPhoto} resizeMode="contain" />
        </View>
      </Modal>

      {/* Edit Novel Modal */}
      <Modal visible={showEditNovelModal} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Novel</Text>
            <TouchableOpacity onPress={() => setShowEditNovelModal(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
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

            {/* Cover Image */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Cover Image</Text>
              <View style={styles.coverUploadContainer}>
                <TouchableOpacity 
                  style={[styles.coverPreview, { backgroundColor: colors.surface }]}
                  onPress={handleEditCoverUpload}
                >
                  {selectedNovel?.coverImage ? (
                    <CachedImage
                      uri={getFirebaseDownloadUrl(selectedNovel.coverImage)}
                      style={styles.coverImage}
                    />
                  ) : (
                    <Ionicons name="book-outline" size={32} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
                
                <View style={styles.coverButtonGroup}>
                  <TouchableOpacity 
                    style={[styles.coverButton, { backgroundColor: colors.primary }]}
                    onPress={handleEditCoverUpload}
                    disabled={uploadingEditCover}
                  >
                    {uploadingEditCover ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={16} color="#fff" />
                        <Text style={styles.coverButtonText}>Change</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {selectedNovel?.coverImage && (
                    <TouchableOpacity 
                      style={[styles.coverButton, { backgroundColor: colors.error }]}
                      onPress={removeEditCover}
                      disabled={uploadingEditCover}
                    >
                      <Ionicons name="trash-outline" size={16} color="#fff" />
                      <Text style={styles.coverButtonText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              
              {editCoverError && (
                <Text 
                  style={[
                    styles.coverErrorText,
                    { color: editCoverError.includes('successfully') ? colors.success : colors.error }
                  ]}
                >
                  {editCoverError}
                </Text>
              )}
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
              <Ionicons name="close" size={24} color={colors.text} />
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

            {/* Cover Image */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Cover Image</Text>
              <View style={styles.coverUploadContainer}>
                <TouchableOpacity 
                  style={[styles.coverPreview, { backgroundColor: colors.surface }]}
                  onPress={handleEditPoemCoverUpload}
                >
                  {selectedPoem?.coverImage ? (
                    <CachedImage
                      uri={getFirebaseDownloadUrl(selectedPoem.coverImage)}
                      style={styles.coverImage}
                    />
                  ) : (
                    <Ionicons name="book-outline" size={32} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
                
                <View style={styles.coverButtonGroup}>
                  <TouchableOpacity 
                    style={[styles.coverButton, { backgroundColor: colors.primary }]}
                    onPress={handleEditPoemCoverUpload}
                    disabled={uploadingEditPoemCover}
                  >
                    {uploadingEditPoemCover ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={16} color="#fff" />
                        <Text style={styles.coverButtonText}>Change</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {selectedPoem?.coverImage && (
                    <TouchableOpacity 
                      style={[styles.coverButton, { backgroundColor: colors.error }]}
                      onPress={removeEditPoemCover}
                      disabled={uploadingEditPoemCover}
                    >
                      <Ionicons name="trash-outline" size={16} color="#fff" />
                      <Text style={styles.coverButtonText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              
              {editPoemCoverError && (
                <Text 
                  style={[
                    styles.coverErrorText,
                    { color: editPoemCoverError.includes('successfully') ? colors.success : colors.error }
                  ]}
                >
                  {editPoemCoverError}
                </Text>
              )}
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

      {/* Action Sheet Modal */}
      <Modal visible={showActionSheet} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.actionSheetOverlay} 
          activeOpacity={1} 
          onPress={() => setShowActionSheet(false)}
        >
          <View style={[styles.actionSheetContainer, { backgroundColor: colors.surface }]}>
            <View style={[styles.actionSheetHandle, { backgroundColor: colors.textSecondary }]} />
            
            <Text style={[styles.actionSheetTitle, { color: colors.text }]}>
              {actionSheetNovel ? actionSheetNovel.title : actionSheetPoem?.title}
            </Text>
            
            <TouchableOpacity 
              style={styles.actionSheetItem}
              onPress={() => {
                setShowActionSheet(false);
                if (actionSheetNovel) {
                  handleEditNovel(actionSheetNovel);
                } else if (actionSheetPoem) {
                  handleEditPoem(actionSheetPoem);
                }
              }}
            >
              <Ionicons name="create-outline" size={24} color={colors.primary} />
              <Text style={[styles.actionSheetItemText, { color: colors.text }]}>Edit</Text>
            </TouchableOpacity>
            
            {actionSheetNovel && (
              <TouchableOpacity 
                style={styles.actionSheetItem}
                onPress={() => {
                  setShowActionSheet(false);
                  navigation.navigate('AddChapters', { novelId: actionSheetNovel.id });
                }}
              >
                <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                <Text style={[styles.actionSheetItemText, { color: colors.text }]}>Add Chapter</Text>
              </TouchableOpacity>
            )}
            
            {actionSheetNovel && (
            <TouchableOpacity 
              style={styles.actionSheetItem}
              onPress={() => {
                setShowActionSheet(false);
                if (actionSheetNovel) {
                  navigation.navigate('PromoteScreen', { novelId: actionSheetNovel.id, type: 'novel' });
                }
              }}
            >
              <Ionicons name="megaphone-outline" size={24} color={colors.primary} />
              <Text style={[styles.actionSheetItemText, { color: colors.text }]}>Promote</Text>
            </TouchableOpacity>
            )}
            
            <TouchableOpacity 
              style={styles.actionSheetItem}
              onPress={() => {
                setShowActionSheet(false);
                if (actionSheetNovel) {
                  handleDeleteNovel(actionSheetNovel);
                } else if (actionSheetPoem) {
                  handleDeletePoem(actionSheetPoem);
                }
              }}
            >
              <Ionicons name="trash-outline" size={24} color={colors.error} />
              <Text style={[styles.actionSheetItemText, { color: colors.error }]}>Delete</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionSheetItem, styles.actionSheetCancel, { backgroundColor: colors.card }]}
              onPress={() => setShowActionSheet(false)}
            >
              <Text style={[styles.actionSheetCancelText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  // Custom Header
  customHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBackButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#fff',
    textAlign: 'center' as const,
  },
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  headerButton: {
    padding: 8,
  },
  // Modern Hero Header
  heroHeader: {
    paddingTop: 16,
    paddingHorizontal: 0,
    paddingBottom: 0,
    overflow: 'hidden' as const,
  },
  heroAccent: {
    position: 'absolute' as const,
    top: -50,
    right: -100,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: themeColors.primary + '30',
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    alignItems: 'center' as const,
    zIndex: 1,
  },
  avatarWrapper: {
    position: 'relative' as const,
    marginBottom: 16,
  },
  avatarContainer: {
    width: 100,
    height: 100,
  },
  heroAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: themeColors.primary,
  },
  heroAvatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: themeColors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  heroAvatarText: {
    fontSize: 42,
    fontWeight: '700' as const,
    color: '#fff',
  },
  editPhotoButton: {
    position: 'absolute' as const,
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: themeColors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  nameSection: {
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  displayName: {
    fontSize: 26,
    fontWeight: '700' as const,
    marginBottom: 6,
    textAlign: 'center' as const,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  bio: {
    fontSize: 14,
    lineHeight: 20,
    color: themeColors.text,
    textAlign: 'center' as const,
    paddingHorizontal: 16,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  statsBar: {
    flexDirection: 'row' as const,
    backgroundColor: themeColors.card,
    marginHorizontal: 0,
    borderTopWidth: 1,
    borderTopColor: themeColors.cardBorder,
  },
  statItem: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center' as const,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  statName: {
    fontSize: 12,
    fontWeight: '500' as const,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  // Action Section
  actionSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  actionCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    minHeight: 56,
  },
  actionCardContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    flex: 1,
  },
  actionCardText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  // Social Section
  socialSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginVertical: 8,
  },
  socialLinksGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
  },
  socialCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center' as const,
  },
  socialCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  socialCardText: {
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 4,
    textAlign: 'center' as const,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  socialCardValue: {
    fontSize: 11,
    textAlign: 'center' as const,
  },
  // Section Header
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '400' as const,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  // Announcements
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: themeColors.surface,
    marginVertical: 8,
  },
  announcementInput: {
    backgroundColor: themeColors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  inputPlaceholder: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: themeColors.primary,
    marginBottom: 8,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top' as const,
    fontSize: 14,
    color: themeColors.text,
    padding: 0,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  postButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: themeColors.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 6,
  },
  disabledButton: {
    opacity: 0.5,
  },
  postButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  charCount: {
    fontSize: 12,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  announcement: {
    backgroundColor: themeColors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  announcementText: {
    fontSize: 14,
    color: themeColors.text,
    marginBottom: 8,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  announcementFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  announcementDate: {
    fontSize: 11,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  emptyState: {
    alignItems: 'center' as const,
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: themeColors.textSecondary,
    marginTop: 10,
    fontWeight: '500' as const,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  // Content Tabs
  contentTypeTabs: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 12,
  },
  contentTypeTab: {
    flex: 1,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
    gap: 6,
  },
  activeContentTypeTab: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  contentTypeText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  activeContentTypeText: {
    color: '#fff',
  },
  statusTabs: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 14,
  },
  statusTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: themeColors.card,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  activeStatusTab: {
    backgroundColor: themeColors.primary,
    borderColor: themeColors.primary,
  },
  statusTabText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: themeColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  activeStatusTabText: {
    color: '#fff',
  },
  // Long press hint
  longPressHint: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    marginBottom: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: themeColors.primary + '10',
    borderRadius: 8,
  },
  longPressHintText: {
    fontSize: 12,
    fontWeight: '500' as const,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  // Grid
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 16,
    justifyContent: 'space-between' as const,
  },
  card: {
    width: CARD_WIDTH,
    aspectRatio: 3 / 4,
    borderRadius: 12,
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
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#fff',
    textAlign: 'center' as const,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  modalClose: {
    position: 'absolute' as const,
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    padding: 8,
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
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: themeColors.background,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.cardBorder,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: themeColors.text,
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
    color: themeColors.text,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  input: {
    backgroundColor: themeColors.card,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: themeColors.text,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  pickerContainer: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  pickerButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
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
    fontSize: 13,
    fontWeight: '600' as const,
    color: themeColors.textSecondary,
  },
  pickerTextActive: {
    color: '#fff',
  },
  saveButton: {
    backgroundColor: themeColors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center' as const,
    marginTop: 12,
    marginBottom: 32,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
  // Tip Modal
  tipModal: {
    backgroundColor: themeColors.surface,
    borderRadius: 20,
    padding: 20,
    width: '90%' as any,
    maxWidth: 400,
  },
  tipHeader: {
    alignItems: 'center' as const,
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.cardBorder,
  },
  tipTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: themeColors.text,
    marginTop: 10,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  tipClose: {
    position: 'absolute' as const,
    top: 14,
    right: 14,
  },
  tipContent: {
    marginBottom: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  tipLabel: {
    fontSize: 13,
    color: themeColors.text,
    marginBottom: 6,
    fontWeight: '600' as const,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  tipValue: {
    fontSize: 13,
    color: themeColors.textSecondary,
    marginBottom: 12,
    backgroundColor: themeColors.card,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  tipButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: themeColors.success,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  tipButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#fff',
  },
  // Cover Upload Styles
  coverUploadContainer: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
  },
  coverPreview: {
    width: 80,
    height: 120,
    borderRadius: 10,
    overflow: 'hidden' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  coverImage: {
    width: '100%' as any,
    height: '100%' as any,
  },
  coverButtonGroup: {
    flex: 1,
    gap: 8,
  },
  coverButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  coverButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#fff',
  },
  coverErrorText: {
    fontSize: 12,
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end' as const,
  },
  actionSheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 34,
    paddingHorizontal: 16,
  },
  actionSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center' as const,
    marginBottom: 16,
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    textAlign: 'center' as const,
    marginBottom: 16,
    paddingHorizontal: 16,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  actionSheetItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderRadius: 10,
  },
  actionSheetItemText: {
    fontSize: 16,
    fontWeight: '500' as const,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  actionSheetCancel: {
    marginTop: 8,
    justifyContent: 'center' as const,
  },
  actionSheetCancelText: {
    fontSize: 16,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
});

export default ProfileScreen;