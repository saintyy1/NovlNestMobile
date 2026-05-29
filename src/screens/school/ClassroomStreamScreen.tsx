import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnnouncementsList } from '../../components/school/AnnouncementsList';
import { StudentList } from '../../components/school/StudentList';
import { AssignmentList } from '../../components/school/AssignmentList';
import { SubmissionFeed } from '../../components/school/SubmissionFeed';
import { useTheme } from '../../contexts/ThemeContext';

export const ClassroomStreamScreen = ({ route, navigation }: any) => {
  const { colors } = useTheme();
  const { classId, className, schoolId } = route.params;
  const [activeTab, setActiveTab] = useState<'stream' | 'assignments' | 'students' | 'feed'>('stream');

  const renderContent = () => {
    switch (activeTab) {
      case 'stream':
        return <AnnouncementsList classId={classId} schoolId={schoolId} />;
      case 'assignments':
        return <AssignmentList classId={classId} schoolId={schoolId} />;
      case 'students':
        return <StudentList classId={classId} schoolId={schoolId} />;
      case 'feed':
        return <SubmissionFeed classId={classId} schoolId={schoolId} />;
      default:
        return <AnnouncementsList classId={classId} schoolId={schoolId} />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Premium Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.className}>{className || 'Classroom'}</Text>
            <Text style={styles.subTitle}>Institutional Hub</Text>
          </View>
          <TouchableOpacity style={styles.headerAction}>
            <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Internal Tabs */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'stream' && styles.activeTab]}
            onPress={() => setActiveTab('stream')}
          >
            <Text style={[styles.tabText, activeTab === 'stream' && styles.activeTabText]}>STREAM</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'feed' && styles.activeTab]}
            onPress={() => setActiveTab('feed')}
          >
            <Text style={[styles.tabText, activeTab === 'feed' && styles.activeTabText]}>FEED</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'assignments' && styles.activeTab]}
            onPress={() => setActiveTab('assignments')}
          >
            <Text style={[styles.tabText, activeTab === 'assignments' && styles.activeTabText]}>TASKS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'students' && styles.activeTab]}
            onPress={() => setActiveTab('students')}
          >
            <Text style={[styles.tabText, activeTab === 'students' && styles.activeTabText]}>STUDENTS</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        {renderContent()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 50,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  className: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  subTitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    marginTop: 2,
  },
  headerAction: {
    padding: 8,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
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
  content: {
    flex: 1,
    padding: 20,
  },
});
