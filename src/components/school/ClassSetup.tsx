import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../firebase/config';
import { doc, setDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';

export const ClassSetup = () => {
  const { currentUser, refreshUser } = useAuth();
  const { colors } = useTheme();
  const [className, setClassName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateClass = async () => {
    if (!className.trim()) {
      Alert.alert("Required", "Please enter a class name (e.g. SS1A or Grade 10).");
      return;
    }

    if (!currentUser?.schoolId) {
      Alert.alert("Error", "No school association found. Please contact support.");
      return;
    }

    setLoading(true);
    try {
      // 1. Create the class document
      // We use a standardized ID format for classes too: BRAND-CLASSNAME
      const brand = currentUser.institutionName?.substring(0, 3).toUpperCase() || 'SCH';
      const cleanParts = className.trim().toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
      const shortParts = cleanParts.map((part, index) => {
        if (index === 0) return part.substring(0, 5); // Keep first word up to 5
        return part.substring(0, 3); // Truncate others to 3
      });
      const classId = shortParts.join('-').substring(0, 12);

      const classRef = doc(db, `schools/${currentUser.schoolId}/classes`, classId);
      await setDoc(classRef, {
        name: className.trim(),
        teacherId: currentUser.uid,
        teacherName: currentUser.displayName || 'Teacher',
        createdAt: serverTimestamp(),
        isArchived: false
      });

      // 2. Link teacher to class
      await updateDoc(doc(db, "users", currentUser.uid), {
        classId: classId
      });

      // 3. Create the student invite code for this class
      const studentCode = `${brand}-${classId}`;
      const codeRef = doc(db, "inviteCodes", studentCode);
      await setDoc(codeRef, {
        schoolPath: `schools/${currentUser.schoolId}`,
        classId: classId,
        role: 'student',
        isActive: true,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        institutionName: currentUser.institutionName
      });

      // 4. Refresh local user state
      if (refreshUser) {
        await refreshUser();
      }

      Alert.alert("Success!", `Class ${className} created. You can now invite students using the code: ${studentCode}`);
    } catch (error) {
      console.error("Error setting up class:", error);
      Alert.alert("Error", "Failed to create class. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.iconCircle, { backgroundColor: colors.primary + '20' }]}>
        <Ionicons name="school-outline" size={40} color={colors.primary} />
      </View>

      <Text style={[styles.title, { color: colors.text }]}>Welcome, Educator!</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        To get started, please create your classroom. This is where your students will join and submit their work.
      </Text>

      <View style={styles.inputWrapper}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>CLASS NAME</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          placeholder="e.g. SS1A, Grade 10, English IV"
          placeholderTextColor={colors.textSecondary}
          value={className}
          onChangeText={setClassName}
          autoCapitalize="characters"
        />
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        onPress={handleCreateClass}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.buttonText}>Initialize Classroom</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 40,
    marginHorizontal: 20,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 10,
  },
  inputWrapper: {
    width: '100%',
    marginBottom: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    width: '100%',
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
