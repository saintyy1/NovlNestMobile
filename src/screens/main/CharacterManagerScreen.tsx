import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase/config';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAlert } from '../../contexts/AlertContext';
import { Character, Novel } from '../../types/novel';
import { spacing } from '../../theme';
import CachedImage from '../../components/CachedImage';
import { compressImage } from '../../utils/imageUtils';
import { invalidateCache } from '../../utils/cache';

const CharacterManagerScreen = ({ route, navigation }: any) => {
  const { novelId, initialCharacters = [] } = route.params;
  const { colors } = useTheme();
  const { currentUser } = useAuth();
  const { showAlert, showToast } = useAlert();
  const insets = useSafeAreaInsets();

  const [characters, setCharacters] = useState<Character[]>(initialCharacters);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!initialCharacters.length && novelId) {
      fetchNovel();
    }
  }, [novelId]);

  const fetchNovel = async () => {
    try {
      setLoading(true);
      const novelDoc = await getDoc(doc(db, 'novels', novelId));
      if (novelDoc.exists()) {
        const data = novelDoc.data() as Novel;
        setCharacters(data.characters || []);
      }
    } catch (error) {
      console.error('Error fetching characters:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast({ message: 'We need access to your gallery to upload character images.', type: 'error' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const openModal = (character?: Character) => {
    if (character) {
      setEditingCharacter(character);
      setName(character.name);
      setDescription(character.description);
      setImageUri(character.imageUrl || null);
    } else {
      setEditingCharacter(null);
      setName('');
      setDescription('');
      setImageUri(null);
    }
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingCharacter(null);
    setName('');
    setDescription('');
    setImageUri(null);
  };

  const handleSaveCharacter = async () => {
    if (!name.trim()) {
      showToast({ message: 'Character name is required', type: 'error' });
      return;
    }

    try {
      setIsUploading(true);
      let finalImageUrl = imageUri;

      // If image changed and is local, upload it
      if (imageUri && !imageUri.startsWith('http')) {
        const compressedUri = await compressImage(imageUri, 600, 0.6);
        const response = await fetch(compressedUri);
        const blob = await response.blob();
        const imageId = editingCharacter?.id || Date.now().toString();
        const imageRef = ref(storage, `characters/${novelId}/${imageId}.jpg`);

        await uploadBytes(imageRef, blob);
        finalImageUrl = await getDownloadURL(imageRef);
      }

      const newCharacter: Character = {
        id: editingCharacter?.id || Date.now().toString(),
        name: name.trim(),
        description: description.trim(),
        imageUrl: finalImageUrl,
      };

      let updatedCharacters;
      if (editingCharacter) {
        updatedCharacters = characters.map(c => c.id === editingCharacter.id ? newCharacter : c);
      } else {
        updatedCharacters = [...characters, newCharacter];
      }

      if (novelId && !novelId.startsWith('novel-')) {
        const novelRef = doc(db, 'novels', novelId);
        const novelSnap = await getDoc(novelRef);
        if (novelSnap.exists()) {
          await updateDoc(novelRef, {
            characters: updatedCharacters,
            updatedAt: new Date().toISOString(),
          });
          await invalidateCache(`novel_${novelId}`);
        }
      }

      setCharacters(updatedCharacters);
      closeModal();

      // If this is part of the "Submit Novel" flow, inform the previous screen
      if (route.params.onSave) {
        route.params.onSave(updatedCharacters);
      }

    } catch (error) {
      console.error('Error saving character:', error);
      showToast({ message: 'Failed to save character', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteCharacter = (id: string) => {
    showAlert({
      title: 'Delete Character',
      message: 'Are you sure you want to remove this character?',
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updatedCharacters = characters.filter(c => c.id !== id);
            if (novelId && !novelId.startsWith('novel-')) {
              const novelRef = doc(db, 'novels', novelId);
              const novelSnap = await getDoc(novelRef);
              if (novelSnap.exists()) {
                await updateDoc(novelRef, {
                  characters: updatedCharacters,
                  updatedAt: new Date().toISOString(),
                });
                await invalidateCache(`novel_${novelId}`);
              }
            }
            setCharacters(updatedCharacters);
            if (route.params.onSave) {
              route.params.onSave(updatedCharacters);
            }
          },
        },
      ]
    });
  };

  const styles = getStyles(colors, insets);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Character Manager</Text>
        <TouchableOpacity onPress={() => openModal()} style={styles.headerButton}>
          <Ionicons name="add" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : characters.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={80} color={colors.textSecondary} opacity={0.5} />
          <Text style={styles.emptyTitle}>No characters yet</Text>
          <Text style={styles.emptySubtitle}>Add the cast of your story to help readers keep track of them.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => openModal()}>
            <Text style={styles.primaryButtonText}>Add First Character</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {characters.map((char) => (
            <View key={char.id} style={styles.characterCard}>
              <View style={styles.characterRow}>
                {char.imageUrl ? (
                  <CachedImage uri={char.imageUrl} style={styles.characterAvatar} />
                ) : (
                  <View style={[styles.characterAvatar, styles.placeholderAvatar]}>
                    <Text style={styles.placeholderText}>{char.name.charAt(0)}</Text>
                  </View>
                )}
                <View style={styles.characterInfo}>
                  <Text style={styles.characterName}>{char.name}</Text>
                  <Text style={styles.characterDesc} numberOfLines={2}>{char.description}</Text>
                </View>
                <View style={styles.actionButtons}>
                  <TouchableOpacity onPress={() => openModal(char)} style={styles.actionButton}>
                    <Ionicons name="create-outline" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteCharacter(char.id)} style={styles.actionButton}>
                    <Ionicons name="trash-outline" size={22} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCharacter ? 'Edit Character' : 'Add Character'}</Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={styles.imageUpload} onPress={handlePickImage} disabled={isUploading}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="camera" size={40} color={colors.textSecondary} />
                    <Text style={styles.imagePlaceholderText}>Upload Character Image</Text>
                  </View>
                )}
                {isUploading && (
                  <View style={styles.uploadOverlay}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.inputLabel}>Name *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Character Name"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.inputLabel}>Description / Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Role in the story, personality, background..."
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={[styles.saveButton, isUploading && styles.disabledButton]}
                onPress={handleSaveCharacter}
                disabled={isUploading}
              >
                {isUploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Character</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const getStyles = (colors: any, insets: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  listContent: {
    padding: 16,
  },
  characterCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  characterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  characterAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  placeholderAvatar: {
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
  },
  characterInfo: {
    flex: 1,
  },
  characterName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  characterDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '90%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  modalBody: {
    flex: 1,
  },
  imageUpload: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  uploadedImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    alignItems: 'center',
  },
  imagePlaceholderText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    fontSize: 16,
    marginBottom: 16,
  },
  textArea: {
    minHeight: 100,
  },
  saveButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default CharacterManagerScreen;
