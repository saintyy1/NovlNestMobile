import React, { useRef } from "react"
import { View, Text, TouchableOpacity, Image, StyleSheet, Platform } from "react-native"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { CommonActions } from "@react-navigation/native"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../../contexts/AuthContext"
import { useNotifications } from "../../contexts/NotificationContext"
import { useChat } from "../../contexts/ChatContext"
import { useTheme } from "../../contexts/ThemeContext"
import { trackTabNavigation } from "../../utils/Analytics-utils"

// Import screens
import { HomeScreen } from "../../screens/main/HomeScreen"
import { BrowseScreen } from "../../screens/main/BrowseScreen"
import { LibraryScreen } from "../../screens/main/LibraryScreen"
import { SubmitScreen } from "../../screens/main/SubmitScreen"
import { MessagesScreen } from "../../screens/main/MessagesScreen"

export type MainTabParamList = {
  Home: undefined
  Browse: { resetBrowseType?: number }
  Library: undefined
  Submit: undefined
  Messages: undefined
  Notifications: undefined
  Profile: { userId?: string }
}

const Tab = createBottomTabNavigator<MainTabParamList>()

// Get user initials for avatar fallback
const getUserInitials = (name: string | null | undefined) => {
  if (!name) return "U"
  return name.charAt(0).toUpperCase()
}

// Submit Header Back Button Component
const SubmitBackButton = ({ navigation, route }: any) => {
  const params = route.params as any
  const showBackButton = params?.showBackButton === true

  if (!showBackButton) {
    return <View style={{ width: 40 }} />
  }

  return (
    <TouchableOpacity
      style={{ paddingLeft: 16 }}
      onPress={() => {
        navigation.setParams({ resetSubmitType: Date.now(), showBackButton: false })
      }}
    >
      <Ionicons name="arrow-back" size={24} color="#fff" />
    </TouchableOpacity>
  )
}

export const MainTabNavigator = () => {
  const { colors } = useTheme()
  const { unreadCount } = useChat()
  const previousTabRef = useRef<string>('Home')

  const styles = getStyles(colors)

  // Notifications Button Component
  const NotificationsButton = ({ navigation }: any) => {
    const { unreadCount } = useNotifications()
    const { colors } = useTheme()
    const styles = getStyles(colors)

    return (
      <TouchableOpacity onPress={() => navigation.navigate("Notifications")} style={styles.notificationButton}>
        <Ionicons name="notifications-outline" size={24} color="#fff" />
        {unreadCount > 0 && (
          <View style={styles.notificationBadge}>
            <Text style={styles.notificationBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    )
  }

  // User Avatar Component
  const UserAvatar = ({ navigation }: any) => {
    const { currentUser } = useAuth()
    const { colors } = useTheme()
    const [imageError, setImageError] = React.useState(false)
    const styles = getStyles(colors)

    return (
      <TouchableOpacity
        onPress={() => navigation.navigate("Profile", { userId: currentUser?.uid })}
        style={styles.avatarContainer}
      >
        {currentUser?.photoURL && !imageError ? (
          <Image
            source={{ uri: currentUser.photoURL }}
            style={styles.avatarImage}
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitials}>{getUserInitials(currentUser?.displayName)}</Text>
          </View>
        )}
      </TouchableOpacity>
    )
  }

  // Header Right Component (Notifications + Avatar)
  const HeaderRight = ({ navigation }: any) => {
    return (
      <View style={styles.headerRightContainer}>
        <NotificationsButton navigation={navigation} />
        <UserAvatar navigation={navigation} />
      </View>
    )
  }

  return (
    <Tab.Navigator
      screenListeners={({ navigation, route }) => ({
        tabPress: (e) => {
          const tabName = e.target?.split('-')[0] || ''
          
          // Track tab navigation for analytics
          if (tabName && tabName !== previousTabRef.current) {
            trackTabNavigation(tabName, previousTabRef.current)
            previousTabRef.current = tabName
          }
          
          // If tapping on the already active tab, reset to the root of that tab
          const isFocused = navigation.isFocused()
          if (isFocused) {
            // Prevent default behavior
            e.preventDefault()
            
            // Reset the tab's navigation stack to the initial route
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: route.name }],
              })
            )
          }
        },
      })}
      screenOptions={({ route }) => {
        // Access unreadCount in this scope so it's available in the closure
        const chatUnreadCount = unreadCount

        return {
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap

            switch (route.name) {
              case "Home":
                iconName = focused ? "home" : "home-outline"
                break
              case "Browse":
                iconName = focused ? "search" : "search-outline"
                break
              case "Library":
                iconName = focused ? "library" : "library-outline"
                break
              case "Submit":
                iconName = focused ? "create" : "create-outline"
                break
              case "Messages":
                iconName = focused ? "chatbubbles" : "chatbubbles-outline"
                break
              default:
                iconName = "ellipse"
            }

            return (
              <View style={{ position: "relative" }}>
                <Ionicons name={iconName} size={size} color={color} />
                {route.name === "Messages" && chatUnreadCount > 0 && (
                  <View style={styles.tabBarBadgeContainer}>
                    <Text style={styles.tabBarBadgeText}>{chatUnreadCount > 99 ? "99+" : chatUnreadCount}</Text>
                  </View>
                )}
              </View>
            )
          },
          tabBarShowLabel: true,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            paddingTop: 5,
            height: 80,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "500",
            fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
          },
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: "#fff",
          headerTitleStyle: {
            fontWeight: "600",
          },
        }
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          header: () => (
            <View style={styles.headerContainer}>
              <View style={styles.headerContent}>
                <View style={styles.logoContainer}>
                  <Image 
                    source={require('../../../assets/images/logo.png')} 
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </View>
                <HeaderRight navigation={navigation} />
              </View>
            </View>
          ),
        })}
      />
      <Tab.Screen
        name="Browse"
        component={BrowseScreen}
        options={({ navigation }) => ({
          tabBarLabel: "Browse",
          header: () => (
            <View style={styles.headerContainer}>
              <View style={styles.headerContent}>
                <View style={styles.logoContainer}>
                  <Text style={styles.logoText}>Browse</Text>
                </View>
                <HeaderRight navigation={navigation} />
              </View>
            </View>
          ),
        })}
      />
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={({ navigation }) => ({
          header: () => (
            <View style={styles.headerContainer}>
              <View style={styles.headerContent}>
                <View style={styles.logoContainer}>
                  <Text style={styles.logoText}>My Library</Text>
                </View>
                <HeaderRight navigation={navigation} />
              </View>
            </View>
          ),
        })}
      />
      <Tab.Screen
        name="Submit"
        component={SubmitScreen}
        options={({ navigation, route }) => ({
          title: "Write",
          tabBarLabel: "Write",
          headerLeft: () => <SubmitBackButton navigation={navigation} route={route} />,
          headerRight: () => (
            <View style={styles.submitHeaderRight}>
              <HeaderRight navigation={navigation} />
            </View>
          ),
        })}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={({ navigation }) => ({
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : undefined,
          tabBarBadgeStyle: styles.tabBarBadge,
          headerShown: false,
          tabBarStyle: {
            paddingTop: 5,
            height: 80,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            display: "flex", // Force tab bar to always be visible
          },
        })}
      />
    </Tab.Navigator>
  )
}

const getStyles = (themeColors: any) =>
  StyleSheet.create({
    headerContainer: {
      backgroundColor: themeColors.primary,
      paddingTop: 50,
      paddingBottom: 10,
      paddingHorizontal: 16,
    },
    headerContent: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    logoContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    logoImage: {
      width: 50,
      height: 50,
    },
    logoText: {
      color: "#fff",
      fontSize: 20,
      fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
      fontWeight: "600",
    },
    headerRightContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
    },
    notificationButton: {
      position: "relative",
      width: 36,
      height: 36,
      justifyContent: "center",
      alignItems: "center",
    },
    notificationBadge: {
      position: "absolute",
      top: 0,
      right: 0,
      backgroundColor: themeColors.error,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 4,
    },
    notificationBadgeText: {
      color: "#fff",
      fontSize: 10,
      fontWeight: "700",
    },
    avatarContainer: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: "hidden",
    },
    avatarImage: {
      width: "100%",
      height: "100%",
    },
    avatarFallback: {
      width: "100%",
      height: "100%",
      backgroundColor: themeColors.secondary,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarInitials: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700",
    },
    submitHeaderRight: {
      paddingRight: 16,
    },
    tabBarBadgeContainer: {
      position: "absolute",
      top: -4,
      right: -10,
      backgroundColor: themeColors.error,
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 4,
    },
    tabBarBadgeText: {
      color: "#fff",
      fontSize: 10,
      fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
      fontWeight: "700",
    },
    tabBarBadge: {
      backgroundColor: themeColors.error,
      color: "#fff",
      fontSize: 10,
      fontWeight: "700",
      fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
  })
