import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase/config';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../contexts/AlertContext';
import { spacing } from '../../theme';

export const StaffManagement = () => {
  const { currentUser } = useAuth();
  const { colors } = useTheme();
  const { showToast } = useAlert();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<any[]>([]);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [activeInviteCode, setActiveInviteCode] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.schoolId) return;

    setLoading(true);
    const q = query(
      collection(db, "users"),
      where("schoolId", "==", currentUser.schoolId),
      where("schoolRole", "==", "teacher")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const staffList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStaff(staffList);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to staff:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser?.schoolId]);

  useEffect(() => {
    if (!currentUser?.schoolId || !currentUser?.institutionName) return;

    const brand = currentUser.institutionName.substring(0, 3).toUpperCase() || 'SCH';
    const code = `${brand}-STAFF`;
    const codeRef = doc(db, "inviteCodes", code);

    const unsub = onSnapshot(codeRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().isActive) {
        setActiveInviteCode(code);
      } else {
        setActiveInviteCode(null);
      }
    });

    return () => unsub();
  }, [currentUser?.schoolId, currentUser?.institutionName]);

  const generateTeacherCode = async () => {
    if (!currentUser?.schoolId) return;
    setGeneratingCode(true);
    try {
      // Generate a static, easy-to-remember code
      const brand = currentUser.institutionName?.substring(0, 3).toUpperCase() || 'SCH';
      const code = `${brand}-STAFF`;

      const codeRef = doc(db, "inviteCodes", code);
      await setDoc(codeRef, {
        schoolPath: `schools/${currentUser.schoolId}`,
        role: 'teacher',
        isActive: true,
        usageCount: 0,
        isMasterCode: false,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
      }, { merge: true });

      Alert.alert(
        "Teacher Code Generated",
        `Share this code with your teacher:\n\n${code}`,
        [
          {
            text: "Copy Code", onPress: () => {
              Clipboard.setString(code);
              Alert.alert("Copied!", "Code copied to clipboard.");
            }
          },
          { text: "Done" }
        ]
      );
    } catch (error) {
      console.error("Error generating teacher code:", error);
      Alert.alert("Error", "Failed to generate invite code.");
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleRevokeAccess = (teacher: any) => {
    Alert.alert(
      "Revoke Access",
      `Are you sure you want to revoke ${teacher.displayName}'s access? They will be removed from the school staff immediately.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Revoke", 
          style: "destructive", 
          onPress: async () => {
            try {
              const teacherRef = doc(db, "users", teacher.id);
              await setDoc(teacherRef, {
                schoolId: null,
                schoolRole: null,
                institutionName: null,
                classId: null
              }, { merge: true });
              Alert.alert("Success", "Staff access revoked.");
            } catch (error) {
              console.error("Revoke error:", error);
              Alert.alert("Error", "Failed to revoke access.");
            }
          }
        }
      ]
    );
  };

  const handleRotateCode = async () => {
    Alert.alert(
      "Rotate Staff Code",
      "This will deactivate the current staff code. You will need to generate a new one. Proceed?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Rotate", 
          onPress: async () => {
            if (activeInviteCode) {
              try {
                await setDoc(doc(db, "inviteCodes", activeInviteCode), { isActive: false }, { merge: true });
                setActiveInviteCode(null);
                showToast({ message: "Old code deactivated. Generate a new one.", type: 'info' });
              } catch (e) {
                Alert.alert("Error", "Failed to deactivate code.");
              }
            }
          }
        }
      ]
    );
  };

  const renderStaffItem = ({ item }: any) => (
    <View style={[styles.staffCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
        <Text style={[styles.avatarText, { color: colors.primary }]}>
          {item.displayName?.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.staffInfo}>
        <Text style={[styles.staffName, { color: colors.text }]}>{item.displayName}</Text>
        <Text style={[styles.staffEmail, { color: colors.textSecondary }]}>{item.email}</Text>
      </View>
      <TouchableOpacity 
        style={styles.manageButton}
        onPress={() => handleRevokeAccess(item)}
      >
        <Ionicons name="person-remove-outline" size={20} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Teaching Staff</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={generateTeacherCode}
          disabled={generatingCode}
        >
          {generatingCode ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name={activeInviteCode ? "refresh-outline" : "person-add-outline"} size={18} color="#fff" />
              <Text style={styles.addButtonText}>
                {activeInviteCode ? "Refresh Invite" : "Invite Teacher"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={staff}
          renderItem={renderStaffItem}
          keyExtractor={item => item.id}
          ListHeaderComponent={
            activeInviteCode ? (
              <View style={[styles.codeCard, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
                <View style={styles.codeInfo}>
                  <Text style={[styles.codeLabel, { color: colors.textSecondary }]}>STAFF INVITE CODE</Text>
                  <Text style={[styles.codeValue, { color: colors.text }]}>
                    {activeInviteCode}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={[styles.copyButton, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    Clipboard.setString(activeInviteCode);
                    showToast({ message: "Code copied to clipboard", type: 'success' });
                  }}
                >
                  <Ionicons name="copy-outline" size={20} color="#fff" />
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.copyButton, { backgroundColor: colors.error, marginLeft: 8 }]}
                  onPress={handleRotateCode}
                >
                  <Ionicons name="refresh-outline" size={20} color="#fff" />
                  <Text style={styles.copyButtonText}>Rotate</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.text }]}>No teachers joined yet</Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Share the code above to invite your first teacher</Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 40,
  },
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
    borderStyle: 'dashed',
  },
  codeInfo: {
    flex: 1,
  },
  codeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  codeValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  copyButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  staffInfo: {
    flex: 1,
  },
  staffName: {
    fontSize: 16,
    fontWeight: '600',
  },
  staffEmail: {
    fontSize: 13,
  },
  manageButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    opacity: 0.6,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
});
