import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAlert } from '../../contexts/AlertContext';
import { spacing, typography } from '../../theme';
import { db } from '../../firebase/config';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  getDoc,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { StaffManagement } from '../../components/school/StaffManagement';
import { StudentList } from '../../components/school/StudentList';
import { AssignmentList } from '../../components/school/AssignmentList';
import { ClassManagement } from '../../components/school/ClassManagement';
import { InstitutionalCover } from '../../components/school/InstitutionalCover';
import { PrincipalStats } from '../../components/school/PrincipalStats';

export const ClassroomDashboard = ({ navigation, route }: any) => {
  const { currentUser, leaveSchool } = useAuth();
  const { colors } = useTheme();
  const { showToast, showAlert } = useAlert();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isTeacher = currentUser?.schoolRole === 'teacher';
  const isPrincipal = currentUser?.schoolRole === 'school_admin';

  const [activeTab, setActiveTab] = useState<'overview' | 'assignments' | 'announcements' | 'showcase' | 'members'>(
    isPrincipal ? 'overview' : 'assignments'
  );
  const [peopleSubTab, setPeopleSubTab] = useState<'staff' | 'students' | 'classes'>('staff');
  const [showcaseWorks, setShowcaseWorks] = useState<any[]>([]);

  // Sync state with navigation params (for role-based bottom tabs)
  useEffect(() => {
    if (route.params?.activeTab) {
      setActiveTab(route.params.activeTab);
    }
    if (route.params?.peopleSubTab) {
      setPeopleSubTab(route.params.peopleSubTab);
    }
  }, [route.params]);

  useEffect(() => {
    if (!currentUser?.schoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const showcaseQ = query(
      collection(db, "submissions"),
      where("schoolId", "==", currentUser.schoolId),
      where("status", "==", "approved"),
      orderBy("approvedAt", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(showcaseQ, (snapshot) => {
      const works = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setShowcaseWorks(works);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to showcase:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser?.schoolId]);

  const fetchDashboardData = async () => {
    // This is a placeholder since children components handle their own data
    // but we can trigger a global refresh if needed by updating a timestamp
    setRefreshing(false);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: colors.primary }]}>
      <View style={styles.headerTop}>
        <View>
          <Text style={styles.userName}>{currentUser?.displayName || 'Educator'}</Text>
          <Text style={styles.schoolName}>{currentUser?.institutionName || 'My School'}</Text>
          <Text style={styles.className}>
            {currentUser?.schoolRole === 'school_admin' ? 'Administrative Hub' : `Classroom: ${currentUser?.classId || 'General'}`}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => {
              showAlert({
                title: 'Leave Class?',
                message: 'Are you sure you want to leave this class? You will lose access to school features until you join again.',
                type: 'warning',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Leave', 
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await leaveSchool();
                        showToast({ message: "Left class successfully", type: 'success' });
                      } catch (error) {
                        showToast({ message: "Failed to leave class", type: 'error' });
                      }
                    }
                  }
                ]
              });
            }}
          >
            <Ionicons name="exit-outline" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileBadge}
            onPress={() => navigation.navigate('Profile', { userId: currentUser?.uid })}
          >
            <Ionicons name="person-circle-outline" size={32} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {isPrincipal ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          <TabItem
            title="OVERVIEW"
            active={activeTab === 'overview'}
            onPress={() => setActiveTab('overview')}
          />
          <TabItem
            title="PEOPLE"
            active={activeTab === 'members'}
            onPress={() => setActiveTab('members')}
          />
          <TabItem
            title="SHOWCASE"
            active={activeTab === 'showcase'}
            onPress={() => setActiveTab('showcase')}
          />
        </ScrollView>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          <TabItem
            title="ASSIGNMENTS"
            active={activeTab === 'assignments'}
            onPress={() => setActiveTab('assignments')}
          />
          <TabItem
            title="UPDATES"
            active={activeTab === 'announcements'}
            onPress={() => setActiveTab('announcements')}
          />
          <TabItem
            title="PEOPLE"
            active={activeTab === 'members'}
            onPress={() => setActiveTab('members')}
          />
          <TabItem
            title="SHOWCASE"
            active={activeTab === 'showcase'}
            onPress={() => setActiveTab('showcase')}
          />
        </ScrollView>
      )}
    </View>
  );

  const TabItem = ({ title, active, onPress }: any) => (
    <TouchableOpacity
      style={[styles.tabItem, active && styles.activeTab]}
      onPress={onPress}
    >
      <Text style={[styles.tabText, active && styles.activeTabText]}>{title}</Text>
    </TouchableOpacity>
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {renderHeader()}

      <View style={styles.contentContainer}>
        {activeTab === 'overview' && isPrincipal && (
          <PrincipalStats />
        )}

        {activeTab === 'assignments' && !isPrincipal && (
          <AssignmentList />
        )}

        {activeTab === 'announcements' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Class Updates</Text>
            <View style={styles.emptyState}>
              <Ionicons name="notifications-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No new announcements</Text>
            </View>
          </View>
        )}

        {activeTab === 'showcase' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Class Showcase</Text>
            <View style={styles.showcaseGrid}>
              {showcaseWorks.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="sparkles-outline" size={48} color={colors.textSecondary} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>The showcase is empty</Text>
                  <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Approved works will appear here</Text>
                </View>
              ) : (
                <FlatList
                  data={showcaseWorks}
                  horizontal
                  renderItem={({ item }) => (
                    <View style={styles.showcaseItem}>
                      <InstitutionalCover
                        schoolName={currentUser?.institutionName || ''}
                        assignmentTitle={item.assignmentTitle}
                        studentName={item.studentName}
                        className={currentUser?.classId || ''}
                      />
                    </View>
                  )}
                  keyExtractor={item => item.id}
                />
              )}
            </View>
          </View>
        )}

        {activeTab === 'members' && (
          <View style={{ flex: 1 }}>
            {isPrincipal && activeTab === 'members' && (
              <View style={styles.segmentContainer}>
                <TouchableOpacity
                  style={[styles.segmentButton, peopleSubTab === 'staff' && { backgroundColor: colors.primary }]}
                  onPress={() => setPeopleSubTab('staff')}
                >
                  <Text style={[styles.segmentText, peopleSubTab === 'staff' && { color: '#fff' }]}>Staff</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentButton, peopleSubTab === 'students' && { backgroundColor: colors.primary }]}
                  onPress={() => setPeopleSubTab('students')}
                >
                  <Text style={[styles.segmentText, peopleSubTab === 'students' && { color: '#fff' }]}>Students</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentButton, peopleSubTab === 'classes' && { backgroundColor: colors.primary }]}
                  onPress={() => setPeopleSubTab('classes')}
                >
                  <Text style={[styles.segmentText, peopleSubTab === 'classes' && { color: '#fff' }]}>Classes</Text>
                </TouchableOpacity>
              </View>
            )}

            {isPrincipal ? (
              <>
                {peopleSubTab === 'staff' && <StaffManagement />}
                {peopleSubTab === 'students' && <StudentList />}
                {peopleSubTab === 'classes' && <ClassManagement />}
              </>
            ) : (
              <StudentList />
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  userName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  schoolName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  className: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  profileBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 5,
    paddingBottom: 4,
  },
  tabItem: {
    paddingVertical: 12,
    marginRight: 24,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#fff',
  },
  tabText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  activeTabText: {
    color: '#fff',
  },
  contentContainer: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  addButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    opacity: 0.5,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
  },
  emptySubtext: {
    marginTop: 4,
    fontSize: 14,
    textAlign: 'center',
  },
  showcaseGrid: {
    marginTop: 16,
  },
  showcaseItem: {
    marginRight: 16,
    width: 140,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(150,150,150,0.1)',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(150,150,150,0.6)',
  },
});

export default ClassroomDashboard;
