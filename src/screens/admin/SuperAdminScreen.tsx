import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase/config';
import { doc, setDoc, getDoc, collection, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation';

type NavigationProp = StackNavigationProp<RootStackParamList, 'SuperAdmin'>;

const SuperAdminScreen = () => {
  const { colors } = useTheme();
  const { currentUser } = useAuth();
  const navigation = useNavigation<NavigationProp>();

  const [schoolName, setSchoolName] = useState('');
  const [masterCode, setMasterCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Security Check: Only allow if user is specifically marked as Admin
  if (!currentUser?.isAdmin) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="lock-closed" size={64} color={colors.error} />
        <Text style={[styles.title, { color: colors.text, marginTop: 16 }]}>Access Denied</Text>
      </View>
    );
  }

  const handleCreateSchool = async () => {
    if (!schoolName.trim() || !masterCode.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    // Clean the code: All caps, no spaces
    const cleanCode = masterCode.trim().toUpperCase().replace(/\s+/g, '');
    setLoading(true);

    try {
      // 1. DUPLICATE CHECK: See if this code is already used
      const codeRef = doc(db, 'inviteCodes', cleanCode);
      const codeSnap = await getDoc(codeRef);

      if (codeSnap.exists()) {
        const existingData = codeSnap.data();
        // Try to find the school name to be helpful
        let existingSchoolName = 'another school';
        if (existingData.schoolPath) {
          const schoolSnap = await getDoc(doc(db, existingData.schoolPath));
          if (schoolSnap.exists()) {
            existingSchoolName = schoolSnap.data().name;
          }
        }

        Alert.alert(
          'Code Already Taken 🚫',
          `The code "${cleanCode}" is already assigned to: \n\n"${existingSchoolName}"\n\nPlease choose a different code for ${schoolName}.`
        );
        setLoading(false);
        return;
      }

      // 2. ATOMIC PROVISIONING: Create school and code together
      const batch = writeBatch(db);

      // Create a unique ID for the school
      const schoolRef = doc(collection(db, 'schools'));
      const schoolId = schoolRef.id;

      batch.set(schoolRef, {
        name: schoolName.trim(),
        createdAt: serverTimestamp(),
        adminIds: [],
        isActive: true,
      });

      // Link the Invite Code to this new school
      batch.set(codeRef, {
        schoolPath: `schools/${schoolId}`,
        role: 'school_admin',
        isActive: true,
        isMasterCode: true,
        usageCount: 0,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,
      });

      await batch.commit();

      Alert.alert(
        'School Provisioned! 🎓',
        `School: ${schoolName}\nCode: ${cleanCode}\n\nYou can now hand this code to the Principal.`,
        [{ text: 'Great!', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Error creating school:', error);
      Alert.alert('System Error', 'Failed to save school. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>School Provisioning</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              This tool allows you to manually onboard a new school after a successful pitch.
            </Text>
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>OFFICIAL SCHOOL NAME</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            placeholder="e.g. Lagos Grammar School"
            placeholderTextColor={colors.textSecondary}
            value={schoolName}
            onChangeText={setSchoolName}
          />

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 24 }]}>MASTER ACTIVATION CODE</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, fontWeight: '700', letterSpacing: 1 }]}
            placeholder="e.g. LGS-MASTER"
            placeholderTextColor={colors.textSecondary}
            value={masterCode}
            onChangeText={setMasterCode}
            autoCapitalize="characters"
          />

          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            If you get a "Code Taken" error, just add a suffix like -OREGUN or -2026.
          </Text>

          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: colors.primary }]}
            onPress={handleCreateSchool}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.createButtonText}>Provision School</Text>
                <Ionicons name="business" size={20} color="#fff" style={{ marginLeft: 8 }} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
  },
  card: {
    padding: 24,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  infoBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.03)',
    marginBottom: 24,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    height: 60,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    marginBottom: 32,
  },
  createButton: {
    height: 60,
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});

export default SuperAdminScreen;
