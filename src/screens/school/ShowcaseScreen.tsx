import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SchoolHeader } from '../../components/school/SchoolHeader';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { InstitutionalCover } from '../../components/school/InstitutionalCover';
import { db } from '../../firebase/config';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';

export const ShowcaseScreen = () => {
  const { colors } = useTheme();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [works, setWorks] = useState<any[]>([]);

  useEffect(() => {
    if (!currentUser?.schoolId) return;

    const showcaseQ = query(
      collection(db, "submissions"),
      where("schoolId", "==", currentUser.schoolId),
      where("status", "==", "approved"),
      orderBy("approvedAt", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(showcaseQ, (snapshot) => {
      const showcaseWorks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setWorks(showcaseWorks);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to showcase:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser?.schoolId]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SchoolHeader title="Institutional Showcase" />
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
        ) : (
          <FlatList
            data={works}
            renderItem={({ item }) => (
              <InstitutionalCover 
                schoolName={item.schoolName || currentUser?.institutionName || 'Our School'}
                assignmentTitle={item.title || 'Creative Work'}
                studentName={item.authorName || 'Student'}
                className={item.className || 'General'}
              />
            )}
            keyExtractor={item => item.id}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="book-outline" size={64} color={colors.textSecondary} style={{ opacity: 0.5 }} />
                <Text style={[styles.emptyText, { color: colors.text }]}>No works showcased yet</Text>
                <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                  When teachers approve student submissions for the showcase, they will appear here.
                </Text>
              </View>
            }
            contentContainerStyle={styles.listContent}
            numColumns={2}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  listContent: {
    padding: 10,
    paddingBottom: 40,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});
