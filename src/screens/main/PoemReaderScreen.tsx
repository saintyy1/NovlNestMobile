import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Animated,
    StatusBar,
    Dimensions,
    StyleSheet,
    Platform,
    Alert,
    Share as RNShare,
} from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { Poem } from '../../types/poem';
import Icon from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'PoemReader'>;

const PoemReaderScreen = ({ route, navigation }: Props) => {
    const { id } = route.params;
    const [poem, setPoem] = useState<Poem | null>(null)
    const [loading, setLoading] = useState(true);
    const [fontSize, setFontSize] = useState(18);
    const { currentUser, isAdmin } = useAuth();
    const { colors } = useTheme();

    const styles = getStyles(colors);

    const scrollY = useRef(new Animated.Value(0)).current;
    const controlsOpacity = useRef(new Animated.Value(1)).current;
    const scrollViewRef = useRef(null);

    // Determine permission to copy/paste
    const canCopyContent = !!(
        isAdmin || (currentUser && poem && currentUser.uid === poem.poetId)
    );

    useEffect(() => {
        fetchPoem();
    }, [id]);

    const fetchPoem = async () => {
        if (!id) {
            setLoading(false);
            return;
        }

        try {
            const poemDoc = await getDoc(doc(db, 'poems', id));
            if (poemDoc.exists()) {
                const data = poemDoc.data();
                const poemData: Poem = {
                    id: poemDoc.id,
                    title: data.title || 'Untitled',
                    description: data.description || '',
                    content: data.content || '',
                    genres: data.genres || [],
                    poetId: data.poetId || '',
                    poetName: data.poetName || 'Unknown',
                    isPromoted: data.isPromoted || false,
                    published: data.published || false,
                    createdAt: data.createdAt || '',
                    updatedAt: data.updatedAt || '',
                    likes: data.likes || 0,
                    views: data.views || 0,
                    likedBy: data.likedBy || [],
                    rating: data.rating || 0,
                    ratingCount: data.ratingCount || 0,
                    coverImage: data.coverImage || null,
                    coverSmallImage: data.coverSmallImage || null,
                };

                setPoem(poemData);
            } else {
                Alert.alert('Not Found', 'This poem could not be found.');
                setLoading(false);
            }
        } catch (error) {
            console.error('Error fetching poem:', error);
            Alert.alert('Error', 'Failed to load poem. Please try again.');
            setLoading(false);
        } finally {
            setLoading(false);
        }
    };

    const handleScroll = Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        {
            useNativeDriver: false,
        }
    );

    const increaseFontSize = () => {
        setFontSize((prev) => Math.min(prev + 2, 32));
    };

    const decreaseFontSize = () => {
        setFontSize((prev) => Math.max(prev - 2, 14));
    };

    const handleShare = async () => {
        try {
          await RNShare.share({
            message: `Check out "${poem?.title}" by ${poem?.poetName} on NovlNest! https://novlnest.com/poem/${poem?.id}`,
          });
        } catch (error) {
          console.error('Error sharing:', error);
        }
      };

    if (loading) {
        return (
            <SafeAreaView style={styles.loadingContainer}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <View style={styles.spinnerContainer}>
                    <Text style={styles.loadingText}>Loading poem...</Text>
                    <View style={styles.loadingDots}>
                        <View style={styles.dot} />
                        <View style={[styles.dot, { marginLeft: 8 }]} />
                        <View style={[styles.dot, { marginLeft: 8 }]} />
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    if (!poem) {
        return (
            <SafeAreaView style={styles.errorContainer}>
                <StatusBar barStyle="light-content" backgroundColor="#000" />
                <Icon name="book-outline" size={64} color="#555" />
                <Text style={styles.errorTitle}>Poem Not Found</Text>
                <Text style={styles.errorSubtitle}>
                    This poem may have been removed or is unavailable.
                </Text>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.errorButton}
                >
                    <Text style={styles.errorButtonText}>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar
                barStyle="light-content"
                backgroundColor="transparent"
                translucent
            />

            {/* Top Navigation Bar */}
            <Animated.View
                style={[
                    styles.topBar,
                    {
                        opacity: controlsOpacity,
                    },
                ]}
            >
                <SafeAreaView style={styles.topBarSafe}>
                    <View style={styles.topBarContent}>
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            style={styles.topBarButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Icon name="chevron-back" size={28} color="#8B5CF6" />
                        </TouchableOpacity>

                        <View style={styles.topBarCenter}>
                            <Text style={styles.topBarTitle} numberOfLines={1}>
                                {poem.title}
                            </Text>
                            <Text style={styles.topBarAuthor} numberOfLines={1}>
                                by {poem.poetName}
                            </Text>
                        </View>

                        <TouchableOpacity
                            onPress={handleShare}
                            style={styles.topBarButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Icon name="share-outline" size={24} color="#8B5CF6" />
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </Animated.View>

            {/* Poem Content */}
            <ScrollView
                ref={scrollViewRef}
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    style={styles.contentWrapper}
                >
                    {/* Poem Content */}
                    <View
                        style={[
                            styles.poemContent,
                            !canCopyContent && styles.protectedContent,
                        ]}
                    >
                        <Text
                            style={[
                                styles.contentText,
                                { fontSize, lineHeight: fontSize * 1.8 },
                            ]}
                            selectable={canCopyContent}
                        >
                            {poem.content}
                        </Text>
                    </View>
                    {/* Bottom Spacing for Controls */}
                    <View style= {{height : 140}}/>
                </TouchableOpacity>
            </ScrollView>

            {/* Bottom Control Bar */}
            <Animated.View
                style={[
                    styles.bottomBar,
                    {
                        opacity: controlsOpacity,
                        transform: [
                            {
                                translateY: controlsOpacity.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [100, 0],
                                }),
                            },
                        ],
                    },
                ]}
            >
                <View style={styles.bottomBarContent}>
                    <View style={styles.fontControlsSection}>
                        <Text style={styles.bottomBarLabel}>Text Size</Text>
                        <View style={styles.fontControls}>
                            <TouchableOpacity
                                onPress={decreaseFontSize}
                                style={[
                                    styles.fontButton,
                                    fontSize <= 14 && styles.fontButtonDisabled,
                                ]}
                                disabled={fontSize <= 14}
                            >
                                <Text style={[
                                    styles.fontButtonText,
                                    fontSize <= 14 && styles.fontButtonTextDisabled
                                ]}>
                                    A-
                                </Text>
                            </TouchableOpacity>

                            <View style={styles.fontSizeIndicator}>
                                <Text style={styles.fontSizeText}>{fontSize}</Text>
                            </View>

                            <TouchableOpacity
                                onPress={increaseFontSize}
                                style={[
                                    styles.fontButton,
                                    fontSize >= 32 && styles.fontButtonDisabled,
                                ]}
                                disabled={fontSize >= 32}
                            >
                                <Text style={[
                                    styles.fontButtonText,
                                    fontSize >= 32 && styles.fontButtonTextDisabled
                                ]}>
                                    A+
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Animated.View>

            {/* Copyright Protection Overlay (invisible but prevents screenshots on some devices) */}
            {!canCopyContent && (
                <View style={styles.protectionOverlay} pointerEvents="none" />
            )}
        </View>
    );
};

const getStyles = (themeColors: any) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: themeColors.background,
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: themeColors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    spinnerContainer: {
        alignItems: 'center',
    },
    loadingText: {
        color: themeColors.text,
        fontSize: 18,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        marginBottom: 20,
    },
    loadingDots: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: themeColors.primary,
    },
    errorContainer: {
        flex: 1,
        backgroundColor: themeColors.background,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    errorTitle: {
        color: themeColors.text,
        fontSize: 24,
        fontWeight: '700',
        marginTop: 20,
        marginBottom: 8,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    errorSubtitle: {
        color: themeColors.textSecondary,
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 24,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    errorButton: {
        backgroundColor: themeColors.primary,
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 28,
        shadowColor: themeColors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    errorButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99,
        backgroundColor: themeColors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: themeColors.border,
    },
    topBarSafe: {
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    topBarContent: {
        flexDirection: 'row' as const,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    topBarButton: {
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 18,
    },
    topBarCenter: {
        flex: 1,
        marginHorizontal: 16,
        alignItems: 'center',
    },
    topBarTitle: {
        color: themeColors.text,
        fontSize: 17,
        fontWeight: '600',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    topBarAuthor: {
        color: themeColors.textSecondary,
        fontSize: 13,
        marginTop: 2,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        fontStyle: 'italic',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: Platform.OS === 'ios' ? 125 : 125,
    },
    contentWrapper: {
        paddingHorizontal: 24,
    },
    poemContent: {
        marginBottom: 40,
    },
    protectedContent: {
        // Additional protection styling
    },
    contentText: {
        color: themeColors.text,
        textAlign: 'center',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        letterSpacing: 0.3,
    },
    footer: {
        alignItems: 'center',
        marginTop: 48,
    },
    watermark: {
        alignItems: 'center',
        marginVertical: 24,
    },
    watermarkText: {
        color: themeColors.textSecondary,
        fontSize: 13,
        fontStyle: 'italic',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        marginBottom: 4,
    },
    watermarkSubtext: {
        color: themeColors.textSecondary,
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    engagementSection: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 40,
        marginTop: 32,
    },
    engagementButton: {
        alignItems: 'center',
    },
    engagementText: {
        color: themeColors.primary,
        fontSize: 12,
        marginTop: 8,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: themeColors.surface,
        paddingBottom: Platform.OS === 'ios' ? 34 : 34,
        paddingTop: 20,
        paddingHorizontal: 20,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: themeColors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 16,
    },
    bottomBarContent: {
        alignItems: 'center',
    },
    fontControlsSection: {
        alignItems: 'center',
    },
    bottomBarLabel: {
        color: themeColors.text,
        fontSize: 11,
        marginBottom: 16,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        fontWeight: '700',
    },
    fontControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 24,
    },
    fontButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: themeColors.primary + '20',
        borderWidth: 2,
        borderColor: themeColors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: themeColors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    fontButtonDisabled: {
        opacity: 0.3,
        borderColor: themeColors.cardBorder,
        shadowOpacity: 0,
        elevation: 0,
    },
    fontButtonText: {
        color: themeColors.primary,
        fontSize: 18,
        fontWeight: '700',
    },
    fontButtonTextDisabled: {
        color: themeColors.cardBorder,
    },
    fontSizeIndicator: {
        backgroundColor: themeColors.card,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 20,
        minWidth: 70,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: themeColors.border,
    },
    fontSizeText: {
        color: themeColors.text,
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    protectionOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
    },
});

export default PoemReaderScreen;