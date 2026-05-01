import React, { createContext, useContext, useEffect, useState } from "react"
import {
  type User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  reauthenticateWithCredential,
  verifyBeforeUpdateEmail,
  applyActionCode,
  checkActionCode,
  updatePassword,
  deleteUser as firebaseDeleteUser,
  signInWithCredential,
  AuthCredential,
} from "firebase/auth"
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  orderBy,
  writeBatch,
  onSnapshot,
} from "firebase/firestore"
import * as AppleAuthentication from "expo-apple-authentication"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { auth, db, actionCodeSettings } from "../firebase/config"
import { sendPushNotification } from "../services/PushNotificationService"
import { deleteReadingProgress } from "../services/readingProgressService"
import {
  invalidateCache,
  invalidateByPrefix,
  invalidateProfileCache,
  invalidateUserPreviewCache,
  invalidateHomeCache,
  invalidateBrowseCache,
  invalidateNovelCache,
  invalidatePoemCache
} from "../utils/cache"

// Extend the Firebase User type with custom properties
export interface ExtendedUser extends User {
  isAdmin?: boolean
  createdAt?: string
  updatedAt?: string
  disabled?: boolean
  bio?: string
  followers?: string[]
  following?: string[]
  instagramUrl?: string
  twitterUrl?: string
  supportLink?: string
  location?: string
  library?: string[]
  poemLibrary?: string[]
  finishedReads?: string[]
  pendingEmail?: string | null
  emailVisible?: boolean
  pushToken?: string
  pushNotificationsEnabled?: boolean
  displayNameLower?: string
}

interface AuthContextType {
  currentUser: ExtendedUser | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  sendEmailVerificationLink: (email?: string, password?: string) => Promise<void>
  verifyEmail: (actionCode: string) => Promise<any>
  loading: boolean
  isAdmin: boolean
  refreshUser: () => Promise<void>
  checkAccountStatus: (user: User) => Promise<void>
  signInWithSocialCredential: (credential: AuthCredential) => Promise<void>
  updateUserPhoto: (photoBase64: string | null) => Promise<void>
  updateUserProfile: (
    displayName?: string,
    bio?: string,
    instagramUrl?: string,
    twitterUrl?: string,
    supportLink?: string,
    location?: string,
    pushNotificationsEnabled?: boolean
  ) => Promise<void>
  toggleFollow: (targetUserId: string, isFollowing: boolean) => Promise<void>
  updateUserLibrary: (novelId: string, add: boolean, novelTitle: string, novelAuthorId: string) => Promise<void>
  updatePoemLibrary: (poemId: string, add: boolean, poemTitle: string, poetId: string) => Promise<void>
  markNovelAsFinished: (novelId: string, novelTitle: string, novelAuthorId: string) => Promise<void>
  markAllNotificationsAsRead: () => Promise<void>
  clearAllNotifications: () => Promise<void>
  updateUserEmail: (newEmail: string, confirmEmail: string, password?: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  deleteUserAccount: (password?: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export const useAuth = () => {
  return useContext(AuthContext)
}

// Cooldown management using AsyncStorage
const TWENTY_FOUR_HOURS_IN_MS = 24 * 60 * 60 * 1000
const TWELVE_HOURS_IN_MS = 12 * 60 * 60 * 1000

// Novel cooldown functions
const getNovelLikeCooldownKey = (userId: string, novelId: string) => `novel_like_cooldown_${userId}_${novelId}`
const getNovelAddedToLibraryCooldownKey = (userId: string, novelId: string) =>
  `novel_added_to_library_cooldown_${userId}_${novelId}`

const setNovelLikeCooldown = async (userId: string, novelId: string) => {
  try {
    await AsyncStorage.setItem(getNovelLikeCooldownKey(userId, novelId), Date.now().toString())
  } catch (error) {
    console.error("Error setting novel like cooldown:", error)
  }
}

const clearNovelLikeCooldown = async (userId: string, novelId: string) => {
  try {
    await AsyncStorage.removeItem(getNovelLikeCooldownKey(userId, novelId))
  } catch (error) {
    console.error("Error clearing novel like cooldown:", error)
  }
}

const checkNovelLikeCooldown = async (userId: string, novelId: string): Promise<boolean> => {
  try {
    const lastLikeTimestamp = await AsyncStorage.getItem(getNovelLikeCooldownKey(userId, novelId))
    if (!lastLikeTimestamp) return false
    const now = Date.now()
    return now - Number(lastLikeTimestamp) < TWENTY_FOUR_HOURS_IN_MS
  } catch (error) {
    console.error("Error checking novel like cooldown:", error)
    return false
  }
}

const setNovelAddedToLibraryCooldown = async (userId: string, novelId: string) => {
  try {
    await AsyncStorage.setItem(getNovelAddedToLibraryCooldownKey(userId, novelId), Date.now().toString())
  } catch (error) {
    console.error("Error setting novel library cooldown:", error)
  }
}

const clearNovelAddedToLibraryCooldown = async (userId: string, novelId: string) => {
  try {
    await AsyncStorage.removeItem(getNovelAddedToLibraryCooldownKey(userId, novelId))
  } catch (error) {
    console.error("Error clearing novel library cooldown:", error)
  }
}

const checkNovelAddedToLibraryCooldown = async (userId: string, novelId: string): Promise<boolean> => {
  try {
    const lastAddedTimestamp = await AsyncStorage.getItem(getNovelAddedToLibraryCooldownKey(userId, novelId))
    if (!lastAddedTimestamp) return false
    const now = Date.now()
    return now - Number(lastAddedTimestamp) < TWENTY_FOUR_HOURS_IN_MS
  } catch (error) {
    console.error("Error checking novel library cooldown:", error)
    return false
  }
}

// Poem cooldown functions
const getPoemLikeCooldownKey = (userId: string, poemId: string) => `poem_like_cooldown_${userId}_${poemId}`
const getPoemAddedToLibraryCooldownKey = (userId: string, poemId: string) =>
  `poem_added_to_library_cooldown_${userId}_${poemId}`

const setPoemLikeCooldown = async (userId: string, poemId: string) => {
  try {
    await AsyncStorage.setItem(getPoemLikeCooldownKey(userId, poemId), Date.now().toString())
  } catch (error) {
    console.error("Error setting poem like cooldown:", error)
  }
}

const clearPoemLikeCooldown = async (userId: string, poemId: string) => {
  try {
    await AsyncStorage.removeItem(getPoemLikeCooldownKey(userId, poemId))
  } catch (error) {
    console.error("Error clearing poem like cooldown:", error)
  }
}

const checkPoemLikeCooldown = async (userId: string, poemId: string): Promise<boolean> => {
  try {
    const lastLikeTimestamp = await AsyncStorage.getItem(getPoemLikeCooldownKey(userId, poemId))
    if (!lastLikeTimestamp) return false
    const now = Date.now()
    return now - Number(lastLikeTimestamp) < TWENTY_FOUR_HOURS_IN_MS
  } catch (error) {
    console.error("Error checking poem like cooldown:", error)
    return false
  }
}

const setPoemAddedToLibraryCooldown = async (userId: string, poemId: string) => {
  try {
    await AsyncStorage.setItem(getPoemAddedToLibraryCooldownKey(userId, poemId), Date.now().toString())
  } catch (error) {
    console.error("Error setting poem library cooldown:", error)
  }
}

const clearPoemAddedToLibraryCooldown = async (userId: string, poemId: string) => {
  try {
    await AsyncStorage.removeItem(getPoemAddedToLibraryCooldownKey(userId, poemId))
  } catch (error) {
    console.error("Error clearing poem library cooldown:", error)
  }
}

const checkPoemAddedToLibraryCooldown = async (userId: string, poemId: string): Promise<boolean> => {
  try {
    const lastAddedTimestamp = await AsyncStorage.getItem(getPoemAddedToLibraryCooldownKey(userId, poemId))
    if (!lastAddedTimestamp) return false
    const now = Date.now()
    return now - Number(lastAddedTimestamp) < TWENTY_FOUR_HOURS_IN_MS
  } catch (error) {
    console.error("Error checking poem library cooldown:", error)
    return false
  }
}

// Follow/unfollow tracking
const followCooldowns = new Map<string, NodeJS.Timeout>()
const lastUnfollowTimestamps = new Map<string, number>()

// Global flag to temporarily ignore auth state changes during system actions
let isSystemAuthAction = false

// Helper to check if a user is within the 24-hour verification grace period
const isGracePeriodActive = (createdAt: string | undefined): boolean => {
  if (!createdAt) return true // Assume active if we can't determine age yet
  const createdDate = new Date(createdAt)
  const now = new Date()
  const diffInMs = now.getTime() - createdDate.getTime()
  const twentyFourHoursInMs = 24 * 60 * 60 * 1000
  return diffInMs < twentyFourHoursInMs
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<ExtendedUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)

  const fetchUserData = async (user: User) => {
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid))
      if (userDoc.exists()) {
        const data = userDoc.data()

        // Sync email verification status from Firebase Auth to Firestore if needed
        if (data.isVerified === false && user.emailVerified === true) {
          try {
            await updateDoc(doc(db, "users", user.uid), {
              isVerified: true,
              updatedAt: new Date().toISOString(),
            })
            data.isVerified = true // Update local data object for state sync below
          } catch (e) {
            console.error("Error syncing verification status:", e)
          }
        }

        const extendedUser = {
          ...user,
          isAdmin: data.isAdmin || false,
          emailVisible: data.emailVisible || false,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          photoURL: data.photoURL || user.photoURL,
          displayName: data.displayName || user.displayName || user.email?.split("@")[0] || "User",
          displayNameLower: data.displayNameLower,
          bio: data.bio || "",
          followers: data.followers || [],
          following: data.following || [],
          instagramUrl: data.instagramUrl || "",
          twitterUrl: data.twitterUrl || "",
          supportLink: data.supportLink || "",
          location: data.location || "",
          library: data.library || [],
          poemLibrary: data.poemLibrary || [],
          finishedReads: data.finishedReads || [],
          pendingEmail: data.pendingEmail,
          pushToken: data.pushToken,
          pushNotificationsEnabled: data.pushNotificationsEnabled,
        } as ExtendedUser

        setCurrentUser(extendedUser)
        setFirebaseUser(user)
        setIsAdmin(data.isAdmin === true)
        return extendedUser
      } else {
        // Create user document if it doesn't exist
        const newUserData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split("@")[0] || "User",
          displayNameLower: (user.displayName || user.email?.split("@")[0] || "User").toLowerCase().replace(/\s+/g, " ").trim(),
          photoURL: user.photoURL,
          isAdmin: false,
          emailVisible: false,
          createdAt: new Date().toISOString(),
          bio: "",
          followers: [],
          following: [],
          instagramUrl: "",
          twitterUrl: "",
          supportLink: "",
          location: "",
          library: [],
          poemLibrary: [],
          finishedReads: [],
          pendingEmail: null,
          pushNotificationsEnabled: true,
          isActive: true,
          isVerified: false, // Initialized for new users
        }
        await setDoc(doc(db, "users", user.uid), newUserData)
        const extendedUser = {
          ...user,
          displayName: user.displayName || user.email?.split("@")[0] || "User",
          displayNameLower: (user.displayName || user.email?.split("@")[0] || "User").toLowerCase().replace(/\s+/g, " ").trim(),
          photoURL: user.photoURL,
          isAdmin: false,
          emailVisible: false,
          createdAt: newUserData.createdAt,
          bio: newUserData.bio,
          followers: newUserData.followers,
          following: newUserData.following,
          instagramUrl: newUserData.instagramUrl,
          twitterUrl: newUserData.twitterUrl,
          supportLink: "",
          location: "",
          library: newUserData.library,
          poemLibrary: newUserData.poemLibrary,
          finishedReads: newUserData.finishedReads,
          pendingEmail: newUserData.pendingEmail,
          pushNotificationsEnabled: true,
          isActive: true,
          isVerified: false,
        } as ExtendedUser
        setCurrentUser(extendedUser)
        setFirebaseUser(user)
        setIsAdmin(false)
        return extendedUser
      }
    } catch (error) {
      console.error("Error fetching user data:", error)
      setIsAdmin(false)
      setCurrentUser(user as ExtendedUser)
      setFirebaseUser(user)
      return user
    }
  }

  const refreshUser = async () => {
    if (firebaseUser) {
      // Reload the Firebase auth user to get latest data (especially email changes)
      await firebaseUser.reload()
      // Get the refreshed user from auth
      const refreshedUser = auth.currentUser
      if (refreshedUser) {
        await fetchUserData(refreshedUser)
      }
    }
  }

  const updateUserPhoto = async (photoBase64: string | null) => {
    if (!currentUser || !firebaseUser) throw new Error("No user logged in")
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        photoURL: photoBase64,
        updatedAt: new Date().toISOString(),
      })

      // 🚀 Invalidate caches
      await invalidateProfileCache(currentUser.uid)
      await invalidateUserPreviewCache(currentUser.uid)

      setCurrentUser((prev) => (prev ? { ...prev, photoURL: photoBase64 } : null))
    } catch (error) {
      console.error("Error updating user photo:", error)
      throw error
    }
  }

  const updateUserProfile = async (
    displayName?: string,
    bio?: string,
    instagramUrl?: string,
    twitterUrl?: string,
    supportLink?: string,
    location?: string,
    pushNotificationsEnabled?: boolean
  ) => {
    if (!currentUser || !firebaseUser) throw new Error("No user logged in")
    const previousUser = { ...currentUser };

    // 1. Validation & Uniqueness check if displayName is changing
    if (displayName !== undefined && displayName !== currentUser.displayName) {
      if (!displayName || displayName.trim().length === 0) {
        throw new Error("Display name is required")
      }

      const trimmedDisplayName = displayName.trim()

      if (trimmedDisplayName.length < 3) {
        throw new Error("Display name must be at least 3 characters long")
      }

      if (trimmedDisplayName.length > 25) {
        throw new Error("Display name must be less than 25 characters long")
      }

      const validNamePattern = /^[a-zA-Z0-9\s\-']+$/
      if (!validNamePattern.test(trimmedDisplayName)) {
        throw new Error("Display name can only contain letters, numbers, spaces, hyphens, and apostrophes")
      }

      const normalizedDisplayName = trimmedDisplayName.toLowerCase().replace(/\s+/g, " ").trim()

      // 🔍 Efficiently check if username exists (Case-insensitive)
      const nameQuery = query(
        collection(db, "users"),
        where("displayNameLower", "==", normalizedDisplayName)
      )

      const nameSnapshot = await getDocs(nameQuery)

      if (!nameSnapshot.empty) {
        // Double check it's not just the current user
        const isTakenByOther = nameSnapshot.docs.some(doc => doc.id !== currentUser.uid)
        if (isTakenByOther) {
          throw new Error("This display name is already taken")
        }
      }
    }

    try {
      const updates: any = {
        updatedAt: new Date().toISOString(),
      };

      if (displayName !== undefined) {
        updates.displayName = displayName.trim();
        updates.displayNameLower = displayName.trim().toLowerCase().replace(/\s+/g, " ").trim();
      }
      if (bio !== undefined) updates.bio = bio;
      if (instagramUrl !== undefined) updates.instagramUrl = instagramUrl;
      if (twitterUrl !== undefined) updates.twitterUrl = twitterUrl;
      if (supportLink !== undefined) updates.supportLink = supportLink;
      if (location !== undefined) updates.location = location;
      if (pushNotificationsEnabled !== undefined) updates.pushNotificationsEnabled = pushNotificationsEnabled;

      // 🚀 Optimistic update
      setCurrentUser((prev) =>
        prev ? {
          ...prev,
          displayName: displayName !== undefined ? displayName : prev.displayName,
          bio: bio !== undefined ? bio : prev.bio,
          instagramUrl: instagramUrl !== undefined ? instagramUrl : prev.instagramUrl,
          twitterUrl: twitterUrl !== undefined ? twitterUrl : prev.twitterUrl,
          supportLink: supportLink !== undefined ? supportLink : prev.supportLink,
          location: location !== undefined ? location : prev.location,
          pushNotificationsEnabled: pushNotificationsEnabled !== undefined ? pushNotificationsEnabled : (prev.pushNotificationsEnabled ?? true)
        } : null
      )

      await updateDoc(doc(db, "users", currentUser.uid), updates)

      // 🚀 Invalidate caches for current user
      await invalidateProfileCache(currentUser.uid)
      await invalidateUserPreviewCache(currentUser.uid)

      if (displayName !== undefined && firebaseUser.displayName !== displayName) {
        await updateProfile(firebaseUser, { displayName })
      }

      if (displayName !== undefined && previousUser.displayName !== displayName) {
        const novelsRef = collection(db, "novels")
        const q = query(novelsRef, where("authorId", "==", currentUser.uid))
        const querySnapshot = await getDocs(q)
        for (const novelDoc of querySnapshot.docs) {
          const novelRef = doc(db, "novels", novelDoc.id)
          await updateDoc(novelRef, { authorName: displayName })
        }
      }
    } catch (error) {
      console.error("Error updating user profile:", error)
      // ⏪ Rollback on error
      setCurrentUser(previousUser)
      throw error
    }
  }

  const updateUserEmail = async (
    newEmail: string,
    confirmEmail: string,
    password?: string
  ) => {
    if (!currentUser) throw new Error("No user logged in")
    const authUser = auth.currentUser
    if (!authUser) throw new Error("No authenticated user")

    try {
      const providers = authUser.providerData.map(p => p.providerId)

      const isAppleUser = providers.includes("apple.com")
      const isGoogleUser = providers.includes("google.com")
      const isEmailUser = providers.includes("password")

      // 🍎 Apple users — EXIT IMMEDIATELY
      if (isAppleUser) {
        throw new Error(
          "You signed in with Apple. Email changes are managed by Apple."
        )
      }

      // ✅ Validate email ONLY for non-Apple users
      if (newEmail !== confirmEmail) {
        throw new Error("Email addresses do not match")
      }

      if (!newEmail.includes("@")) {
        throw new Error("Please enter a valid email address")
      }

      if (newEmail === currentUser.email) {
        throw new Error("New email must be different from current email")
      }

      // 🔵 Google users
      if (isGoogleUser) {
        await reauthenticateWithGoogle()
      }

      // ✉️ Email/password users
      else if (isEmailUser) {
        if (!password) {
          throw new Error("Password is required to change email")
        }

        if (!authUser.email) {
          throw new Error("Current user email not found")
        }

        const credential = EmailAuthProvider.credential(
          authUser.email,
          password
        )
        await reauthenticateWithCredential(authUser, credential)
      }

      // 📧 Send verification + update
      try {
        await verifyBeforeUpdateEmail(authUser, newEmail)
      } catch (e) {
        console.error("Failed to send email change verification:", e)
        throw new Error(
          "Could not send verification email to new address. Please check if the email address is valid."
        )
      }

      await updateDoc(doc(db, "users", currentUser.uid), {
        pendingEmail: newEmail,
        updatedAt: new Date().toISOString(),
      })

      setCurrentUser(prev =>
        prev ? { ...prev, pendingEmail: newEmail } : null
      )
    } catch (error) {
      console.error("Error updating email:", error)

      if (error instanceof Error) {
        if (error.message.includes("operation-not-allowed")) {
          throw new Error(
            "Email verification is required. Please check your email and click the verification link."
          )
        }
        if (error.message.includes("user-mismatch")) {
          throw new Error(
            "Please use your current email and password for verification."
          )
        }
      }

      throw error
    }
  }

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ) => {
    if (!currentUser) throw new Error("No user logged in")
    const authUser = auth.currentUser
    if (!authUser) throw new Error("No authenticated user")

    try {
      const providers = authUser.providerData.map(p => p.providerId)

      const isAppleUser = providers.includes("apple.com")
      const isGoogleUser = providers.includes("google.com")
      const isEmailUser = providers.includes("password")

      if (isAppleUser) {
        throw new Error(
          "You signed in with Apple. Password changes are not available for Apple accounts."
        )
      }

      if (isGoogleUser) {
        await reauthenticateWithGoogle()
      }

      if (isEmailUser) {
        if (newPassword.length < 6) {
          throw new Error("New password must be at least 6 characters long")
        }

        if (!authUser.email) {
          throw new Error("Current user email not found")
        }

        const credential = EmailAuthProvider.credential(
          authUser.email,
          currentPassword
        )
        await reauthenticateWithCredential(authUser, credential)
      }

      // 🔐 Update password (email users only)
      await updatePassword(authUser, newPassword)

      await updateDoc(doc(db, "users", currentUser.uid), {
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      console.error("Error changing password:", error)

      if (error instanceof Error) {
        if (
          error.message.includes("wrong-password") ||
          error.message.includes("invalid-credential")
        ) {
          throw new Error("Current password is incorrect")
        }
      }

      throw error
    }
  }

  const deleteUserAccount = async (password?: string) => {
    if (!currentUser) throw new Error("No user logged in")
    const authUser = auth.currentUser
    if (!authUser) throw new Error("No authenticated user")

    try {
      const providers = authUser.providerData.map(p => p.providerId)

      const isGoogleUser = providers.includes("google.com")
      const isAppleUser = providers.includes("apple.com")
      const isEmailUser = providers.includes("password")


      if (isAppleUser) {
        await reauthenticateWithApple()
      }

      if (isGoogleUser) {
        await reauthenticateWithGoogle()
      }

      if (isEmailUser) {
        if (!password) {
          throw new Error("Password is required to delete account")
        }
        if (!authUser.email) {
          throw new Error("Current user email not found")
        }

        const credential = EmailAuthProvider.credential(
          authUser.email,
          password
        )
        await reauthenticateWithCredential(authUser, credential)
      }

      const userId = authUser.uid

      const batch = writeBatch(db)

      // Cleanup followers/following references in other users
      const followersToUpdateQuery = query(collection(db, "users"), where("following", "array-contains", userId))
      const followingToUpdateQuery = query(collection(db, "users"), where("followers", "array-contains", userId))

      const [followersToUpdateSnapshot, followingToUpdateSnapshot] = await Promise.all([
        getDocs(followersToUpdateQuery),
        getDocs(followingToUpdateQuery)
      ])

      followersToUpdateSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { following: arrayRemove(userId) })
      })

      followingToUpdateSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { followers: arrayRemove(userId) })
      })

      batch.delete(doc(db, "users", userId))

      const novelsQuery = query(collection(db, "novels"), where("authorId", "==", userId))
      const novelsSnapshot = await getDocs(novelsQuery)
      novelsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref)
      })

      const poemsQuery = query(collection(db, "poems"), where("poetId", "==", userId))
      const poemsSnapshot = await getDocs(poemsQuery)
      poemsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref)
      })

      const sentNotificationsQuery = query(collection(db, "notifications"), where("fromUserId", "==", userId))
      const sentNotificationsSnapshot = await getDocs(sentNotificationsQuery)
      sentNotificationsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref)
      })

      const receivedNotificationsQuery = query(collection(db, "notifications"), where("toUserId", "==", userId))
      const receivedNotificationsSnapshot = await getDocs(receivedNotificationsQuery)
      receivedNotificationsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref)
      })

      const announcementsQuery = query(collection(db, "announcements"), where("authorId", "==", userId))
      const announcementsSnapshot = await getDocs(announcementsQuery)
      announcementsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref)
      })

      await batch.commit()

      // Preserve local app data (drafts, preferences) across logout.
      // Do not clear AsyncStorage here to avoid deleting user drafts.

      await firebaseDeleteUser(authUser)

      setCurrentUser(null)
      setFirebaseUser(null)
      setIsAdmin(false)

      followCooldowns.forEach((timeout) => clearTimeout(timeout))
      followCooldowns.clear()
      lastUnfollowTimestamps.clear()
    } catch (error) {
      console.error("Error deleting user account:", error)
      if (error instanceof Error) {
        if (error.message.includes("wrong-password") || error.message.includes("invalid-credential")) {
          throw new Error("Password is incorrect")
        }
        if (error.message.includes("requires-recent-login")) {
          throw new Error("Please sign in again before deleting your account")
        }
      }
      throw error
    }
  }

  const toggleFollow = async (targetUserId: string, isCurrentlyFollowing: boolean) => {
    if (!currentUser) throw new Error("No user logged in")
    if (currentUser.uid === targetUserId) throw new Error("Cannot follow yourself")

    const currentUserRef = doc(db, "users", currentUser.uid)
    const targetUserRef = doc(db, "users", targetUserId)
    const cooldownKey = `${currentUser.uid}-${targetUserId}`

    try {
      await updateDoc(currentUserRef, {
        following: isCurrentlyFollowing ? arrayRemove(targetUserId) : arrayUnion(targetUserId),
        updatedAt: new Date().toISOString(),
      })

      await updateDoc(targetUserRef, {
        followers: isCurrentlyFollowing ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
        updatedAt: new Date().toISOString(),
      })

      // 🚀 Invalidate caches for both users
      await invalidateProfileCache(currentUser.uid)
      await invalidateProfileCache(targetUserId)
      // Also invalidate user previews just in case following status is cached there
      await invalidateUserPreviewCache(currentUser.uid)
      await invalidateUserPreviewCache(targetUserId)

      if (!isCurrentlyFollowing) {
        const lastUnfollowTime = lastUnfollowTimestamps.get(cooldownKey)
        const currentTime = Date.now()

        if (lastUnfollowTime && currentTime - lastUnfollowTime < TWELVE_HOURS_IN_MS) {
          console.log("Follow notification suppressed due to re-follow within 12 hours")
          lastUnfollowTimestamps.delete(cooldownKey)
          return
        }

        if (followCooldowns.has(cooldownKey)) {
          console.log("Follow notification debounced for rapid clicks")
          return
        }

        const timeout = setTimeout(() => {
          followCooldowns.delete(cooldownKey)
        }, 5000)
        followCooldowns.set(cooldownKey, timeout)

        await addDoc(collection(db, "notifications"), {
          toUserId: targetUserId,
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || "Anonymous User",
          type: "follow",
          createdAt: new Date().toISOString(),
          read: false,
        })

        // Send Push Notification
        await sendPushNotification(
          targetUserId,
          `${currentUser.displayName || "Someone"} 👤`,
          `Started following you`,
          { url: `novlnest://profile/${currentUser.uid}` }
        )

        const announcementsQuery = query(
          collection(db, "announcements"),
          where("authorId", "==", targetUserId),
          orderBy("createdAt", "desc")
        )
        const announcementsSnapshot = await getDocs(announcementsQuery)

        for (const doc of announcementsSnapshot.docs) {
          const announcementData = doc.data()
          await addDoc(collection(db, "notifications"), {
            toUserId: currentUser.uid,
            fromUserId: targetUserId,
            fromUserName: announcementData.authorName || "Author",
            type: "followed_author_announcement",
            announcementContent: announcementData.content,
            createdAt: new Date().toISOString(),
            read: false,
          })
        }

        lastUnfollowTimestamps.delete(cooldownKey)
      } else {
        lastUnfollowTimestamps.set(cooldownKey, Date.now())
      }

      await refreshUser()
    } catch (error) {
      console.error("Error toggling follow status:", error)
      if (followCooldowns.has(cooldownKey)) {
        clearTimeout(followCooldowns.get(cooldownKey)!)
        followCooldowns.delete(cooldownKey)
      }
      throw error
    }
  }

  const updateUserLibrary = async (novelId: string, add: boolean, novelTitle: string, novelAuthorId: string) => {
    if (!currentUser) throw new Error("No user logged in")
    const userRef = doc(db, "users", currentUser.uid)
    try {
      await updateDoc(userRef, {
        library: add ? arrayUnion(novelId) : arrayRemove(novelId),
        updatedAt: new Date().toISOString(),
      })
      setCurrentUser((prev) =>
        prev
          ? {
            ...prev,
            library: add
              ? (prev.library?.includes(novelId) ? prev.library : [...(prev.library || []), novelId])
              : (prev.library || []).filter((id) => id !== novelId),
          }
          : null
      )

      if (add && novelAuthorId !== currentUser.uid) {
        const likeCooldownActive = await checkNovelLikeCooldown(currentUser.uid, novelId)
        if (!likeCooldownActive) {
          await addDoc(collection(db, "notifications"), {
            toUserId: novelAuthorId,
            fromUserId: currentUser.uid,
            fromUserName: currentUser.displayName || "Anonymous User",
            type: "novel_like",
            novelId: novelId,
            novelTitle: novelTitle,
            createdAt: new Date().toISOString(),
            read: false,
          })
          await setNovelLikeCooldown(currentUser.uid, novelId)

          // Send Push Notification
          await sendPushNotification(
            novelAuthorId,
            `${currentUser.displayName || "Someone"} ❤️`,
            `Liked your novel "${novelTitle}"`,
            { url: `novlnest://novel/${novelId}` }
          )
        }

        const libraryCooldownActive = await checkNovelAddedToLibraryCooldown(currentUser.uid, novelId)
        if (!libraryCooldownActive) {
          await addDoc(collection(db, "notifications"), {
            toUserId: novelAuthorId,
            fromUserId: currentUser.uid,
            fromUserName: currentUser.displayName || "Anonymous User",
            type: "novel_added_to_library",
            novelId: novelId,
            novelTitle: novelTitle,
            createdAt: new Date().toISOString(),
            read: false,
          })
          await setNovelAddedToLibraryCooldown(currentUser.uid, novelId)

          // Send Push Notification
          await sendPushNotification(
            novelAuthorId,
            `${currentUser.displayName || "Someone"} 📚`,
            `Added "${novelTitle}" to their library`,
            { url: `novlnest://novel/${novelId}` }
          )
        }
        await clearNovelLikeCooldown(currentUser.uid, novelId)
        await clearNovelAddedToLibraryCooldown(currentUser.uid, novelId)
      }

      // 🚀 Invalidate novel cache and relevant feeds
      await invalidateCache(`novel_${novelId}`)
      await invalidateHomeCache()
      await invalidateBrowseCache()
      await invalidateProfileCache(currentUser.uid)
    } catch (error) {
      console.error("Error updating user library:", error)
      throw error
    }
  }

  const markNovelAsFinished = async (novelId: string, novelTitle: string, novelAuthorId: string) => {
    if (!currentUser) throw new Error("No user logged in")
    const userRef = doc(db, "users", currentUser.uid)
    try {
      const isCurrentlyFinished = currentUser.finishedReads?.includes(novelId) || false

      if (!isCurrentlyFinished) {
        if (novelAuthorId !== currentUser.uid) {
          await addDoc(collection(db, "notifications"), {
            toUserId: novelAuthorId,
            fromUserId: currentUser.uid,
            fromUserName: currentUser.displayName || "Anonymous User",
            type: "novel_finished",
            novelId: novelId,
            novelTitle: novelTitle,
            createdAt: new Date().toISOString(),
            read: false,
          })

          // Send Push Notification
          await sendPushNotification(
            novelAuthorId,
            `${currentUser.displayName || "Someone"} 🎉`,
            `Finished reading "${novelTitle}"`,
            { url: `novlnest://novel/${novelId}` }
          )
        }
        await updateDoc(userRef, {
          finishedReads: arrayUnion(novelId),
          library: arrayRemove(novelId),
          updatedAt: new Date().toISOString(),
        })

        // Remove from continue reading section
        await deleteReadingProgress(currentUser.uid, novelId);
        setCurrentUser((prev) =>
          prev
            ? {
              ...prev,
              finishedReads: (prev.finishedReads?.includes(novelId) ? prev.finishedReads : [...(prev.finishedReads || []), novelId]),
              library: (prev.library || []).filter((id) => id !== novelId),
            }
            : null
        )
      } else {
        await updateDoc(userRef, {
          finishedReads: arrayRemove(novelId),
          library: arrayUnion(novelId),
          updatedAt: new Date().toISOString(),
        })
        setCurrentUser((prev) =>
          prev
            ? {
              ...prev,
              finishedReads: (prev.finishedReads || []).filter((id) => id !== novelId),
              library: (prev.library?.includes(novelId) ? prev.library : [...(prev.library || []), novelId]),
            }
            : null
        )
      }
    } catch (error) {
      console.error("Error toggling novel finished status:", error)
      throw error
    }
  }

  const updatePoemLibrary = async (poemId: string, add: boolean, poemTitle: string, poetId: string) => {
    if (!currentUser) throw new Error("No user logged in")
    const userRef = doc(db, "users", currentUser.uid)
    try {
      await updateDoc(userRef, {
        poemLibrary: add ? arrayUnion(poemId) : arrayRemove(poemId),
        updatedAt: new Date().toISOString(),
      })
      setCurrentUser((prev) =>
        prev
          ? {
            ...prev,
            poemLibrary: add
              ? (prev.poemLibrary?.includes(poemId) ? prev.poemLibrary : [...(prev.poemLibrary || []), poemId])
              : (prev.poemLibrary || []).filter((id) => id !== poemId),
          }
          : null
      )

      if (add && poetId !== currentUser.uid) {
        const likeCooldownActive = await checkPoemLikeCooldown(currentUser.uid, poemId)
        if (!likeCooldownActive) {
          await addDoc(collection(db, "notifications"), {
            toUserId: poetId,
            fromUserId: currentUser.uid,
            fromUserName: currentUser.displayName || "Anonymous User",
            type: "poem_like",
            poemId: poemId,
            poemTitle: poemTitle,
            createdAt: new Date().toISOString(),
            read: false,
          })
          await setPoemLikeCooldown(currentUser.uid, poemId)

          // Send Push Notification
          await sendPushNotification(
            poetId,
            `${currentUser.displayName || "Someone"} ❤️`,
            `Liked your poem "${poemTitle}"`,
            { url: `novlnest://poem/${poemId}` }
          )
        }

        const libraryCooldownActive = await checkPoemAddedToLibraryCooldown(currentUser.uid, poemId)
        if (!libraryCooldownActive) {
          await addDoc(collection(db, "notifications"), {
            toUserId: poetId,
            fromUserId: currentUser.uid,
            fromUserName: currentUser.displayName || "Anonymous User",
            type: "poem_added_to_library",
            poemId: poemId,
            poemTitle: poemTitle,
            createdAt: new Date().toISOString(),
            read: false,
          })
          await setPoemAddedToLibraryCooldown(currentUser.uid, poemId)

          // Send Push Notification
          await sendPushNotification(
            poetId,
            `${currentUser.displayName || "Someone"} 📚`,
            `Added "${poemTitle}" to their library`,
            { url: `novlnest://poem/${poemId}` }
          )
        }
        await clearPoemLikeCooldown(currentUser.uid, poemId)
        await clearPoemAddedToLibraryCooldown(currentUser.uid, poemId)
      }

      // 🚀 Invalidate poem cache and relevant feeds
      await invalidateCache(`poem_${poemId}`)
      await invalidateHomeCache()
      await invalidateBrowseCache()
      await invalidateProfileCache(currentUser.uid)
    } catch (error) {
      console.error("Error updating poem library:", error)
      throw error
    }
  }

  const register = async (email: string, password: string, displayName: string) => {
    if (!displayName || displayName.trim().length === 0) {
      throw new Error("Display name is required")
    }

    const trimmedDisplayName = displayName.trim()

    if (trimmedDisplayName.length < 2) {
      throw new Error("Display name must be at least 2 characters long")
    }

    if (trimmedDisplayName.length > 50) {
      throw new Error("Display name must not exceed 50 characters")
    }

    const validNamePattern = /^[a-zA-Z0-9\s\-']+$/
    if (!validNamePattern.test(trimmedDisplayName)) {
      throw new Error("Display name can only contain letters, numbers, spaces, hyphens, and apostrophes")
    }

    const normalizedDisplayName = trimmedDisplayName.toLowerCase().replace(/\s+/g, " ").trim()

    const nameQuery = query(
      collection(db, "users"),
      where("displayNameLower", "==", normalizedDisplayName)
    )
    const nameSnapshot = await getDocs(nameQuery)

    if (!nameSnapshot.empty) {
      throw new Error("This display name is already taken. Try another one.")
    }

    // Validate email domain
    const allowedDomains = ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "aol.com", "zoho.com", "protonmail.com"]
    const emailDomain = email.split("@")[1]?.toLowerCase()

    if (!emailDomain || !allowedDomains.includes(emailDomain)) {
      throw new Error(`Registration restricted to standard email providers. Allowed domains: ${allowedDomains.join(", ")}`)
    }

    if (emailDomain === "example.com") {
      throw new Error("Generic domains like example.com are not allowed for security.")
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const user = userCredential.user

    await updateProfile(user, { displayName: trimmedDisplayName })
    await sendEmailVerification(user, actionCodeSettings)

    const newUserData = {
      uid: user.uid,
      email: user.email,
      displayName: trimmedDisplayName,
      displayNameLower: normalizedDisplayName,
      photoURL: null,
      isAdmin: false,
      emailVisible: false,
      createdAt: new Date().toISOString(),
      bio: "",
      followers: [],
      following: [],
      instagramUrl: "",
      twitterUrl: "",
      supportLink: "",
      location: "",
      library: [],
      poemLibrary: [],
      finishedReads: [],
      pendingEmail: null,
      isActive: true,
      isVerified: false,
    }
    await setDoc(doc(db, "users", user.uid), newUserData)

    // NO LONGER logging out immediately - allowing grace period
    await fetchUserData(user)
  }

  const checkAccountStatus = async (user: User) => {
    const userDoc = await getDoc(doc(db, "users", user.uid))
    if (userDoc.exists()) {
      const data = userDoc.data()
      if (data.isActive === false) {
        await signOut(auth)
        throw new Error("ACCOUNT_DISABLED")
      }
      if (data.isVerified === false) {
        // Double check with Firebase Auth - they might have verified while logged out
        if (user.emailVerified) {
          await updateDoc(doc(db, "users", user.uid), {
            isVerified: true,
            updatedAt: new Date().toISOString(),
          })
          // Sync successful, proceed with login
        } else if (!isGracePeriodActive(data.createdAt)) {
          // Only throw if NOT in grace period
          await signOut(auth)
          throw new Error("ACCOUNT_UNVERIFIED")
        }
      }
    }
  }

  const login = async (email: string, password: string) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    await checkAccountStatus(userCredential.user)
    await fetchUserData(userCredential.user)
  }

  const signInWithSocialCredential = async (credential: AuthCredential) => {
    isSystemAuthAction = true
    try {
      const userCredential = await signInWithCredential(auth, credential)
      const user = userCredential.user

      // Check if user document exists
      const userDoc = await getDoc(doc(db, "users", user.uid))
      if (!userDoc.exists()) {
        // New social user - create doc and require verification
        const newUserData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split("@")[0] || "User",
          displayNameLower: (user.displayName || user.email?.split("@")[0] || "User").toLowerCase().replace(/\s+/g, " ").trim(),
          photoURL: user.photoURL,
          isAdmin: false,
          emailVisible: false,
          createdAt: new Date().toISOString(),
          bio: "",
          followers: [],
          following: [],
          instagramUrl: "",
          twitterUrl: "",
          supportLink: "",
          location: "",
          library: [],
          poemLibrary: [],
          finishedReads: [],
          pendingEmail: null,
          pushNotificationsEnabled: true,
          isActive: true,
          isVerified: false, // Force social users to verify (anti-bot)
        }
        await setDoc(doc(db, "users", user.uid), newUserData)

        // Send verification email
        await sendEmailVerification(user, actionCodeSettings)

        // NO LONGER signing out for new social users - allowing grace period
        await fetchUserData(user)
      } else {
        // Existing user - check status
        const data = userDoc.data()
        if (data.isActive === false) {
          await signOut(auth)
          throw new Error("ACCOUNT_DISABLED")
        }

        if (data.isVerified === false) {
          // Double check with Firebase Auth
          if (user.emailVerified) {
            await updateDoc(doc(db, "users", user.uid), {
              isVerified: true,
              updatedAt: new Date().toISOString()
            })
          } else if (!isGracePeriodActive(data.createdAt)) {
            // Only throw if NOT in grace period
            await signOut(auth)
            throw new Error("ACCOUNT_UNVERIFIED")
          }
        }

        isSystemAuthAction = false // Allow listener to catch successful login
        await fetchUserData(user)
      }
    } catch (error) {
      console.error("Error signing in with social credential:", error)
      await signOut(auth).catch(() => { }) // Ensure signed out
      throw error
    } finally {
      setTimeout(() => {
        isSystemAuthAction = false
      }, 1000)
    }
  }

  const logout = async () => {
    // Clear state synchronously for immediate response
    setIsAdmin(false)
    setCurrentUser(null)
    setFirebaseUser(null)

    // Clear timers
    followCooldowns.forEach((timeout) => clearTimeout(timeout))
    followCooldowns.clear()
    lastUnfollowTimestamps.clear()

    try {
      await signOut(auth)
    } catch (error) {
      console.error("Error during logout:", error)
      // Even if Firebase fails, our local state is now null, effectively "logging out" the user from the app's perspective
    }
  }

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email)
  }

  const sendEmailVerificationLink = async (email?: string, password?: string) => {
    // If credentials are provided, we temporarily sign in to send the link (for ACCOUNT_UNVERIFIED flow)
    if (email && password) {
      isSystemAuthAction = true
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password)
        await sendEmailVerification(userCredential.user, actionCodeSettings)
        await signOut(auth)
      } finally {
        setTimeout(() => {
          isSystemAuthAction = false
        }, 1000)
      }
      return
    }

    if (!firebaseUser) throw new Error("No user logged in")
    await sendEmailVerification(firebaseUser, actionCodeSettings)
  }

  const verifyEmail = async (actionCode: string) => {
    try {
      const info = await checkActionCode(auth, actionCode)
      await applyActionCode(auth, actionCode)

      // Refresh the user to get updated email verification status
      if (firebaseUser) {
        await firebaseUser.reload()
      }

      // Update Firestore status by email (works even if user is logged out)
      const userEmail = info.data?.email;
      if (userEmail) {
        const q = query(collection(db, "users"), where("email", "==", userEmail))
        const snapshot = await getDocs(q)
        if (!snapshot.empty) {
          const userRef = snapshot.docs[0].ref
          await updateDoc(userRef, {
            isVerified: true,
            updatedAt: new Date().toISOString(),
          })
        }
      }

      if (firebaseUser) {
        await fetchUserData(firebaseUser)
      }

      return info
    } catch (error) {
      console.error("Error verifying email:", error)
      throw error
    }
  }

  const reauthenticateWithGoogle = async () => {
    try {
      // Dynamically import Google Sign-In (only available in native builds)
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');

      // Sign out first to force account picker
      await GoogleSignin.signOut();

      // Check if device supports Google Play
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Get fresh sign-in credentials
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;

      if (!idToken) {
        throw new Error('No ID token found');
      }

      // Create credential and reauthenticate
      const googleCredential = GoogleAuthProvider.credential(idToken);
      const authUser = auth.currentUser;
      if (!authUser) {
        throw new Error('No authenticated user');
      }

      await reauthenticateWithCredential(authUser, googleCredential);
    } catch (error: any) {
      console.error('Google reauthentication error:', error);
      if (error.message === 'Sign in action cancelled') {
        throw new Error('Authentication cancelled. Please try again.');
      }
      throw error;
    }
  }

  const reauthenticateWithApple = async () => {
    const appleAuth = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      ],
    })

    if (!appleAuth.identityToken) {
      throw new Error("Apple authentication failed")
    }

    const provider = new OAuthProvider("apple.com")
    const credential = provider.credential({
      idToken: appleAuth.identityToken,
    })

    await reauthenticateWithCredential(auth.currentUser!, credential)
  }

  const markAllNotificationsAsRead = async () => {
    if (!currentUser) return

    try {
      const notificationsQuery = query(
        collection(db, "notifications"),
        where("toUserId", "==", currentUser.uid),
        where("read", "==", false)
      )

      const snapshot = await getDocs(notificationsQuery)
      const batch = writeBatch(db)

      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { read: true })
      })

      await batch.commit()
    } catch (error) {
      console.error("Error marking all notifications as read:", error)
      throw error
    }
  }

  const clearAllNotifications = async () => {
    if (!currentUser) return

    try {
      const notificationsQuery = query(
        collection(db, "notifications"),
        where("toUserId", "==", currentUser.uid)
      )

      const snapshot = await getDocs(notificationsQuery)
      const batch = writeBatch(db)

      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref)
      })

      await batch.commit()
    } catch (error) {
      console.error("Error clearing all notifications:", error)
      throw error
    }
  }

  useEffect(() => {
    let unsubscribeSnapshot: () => void;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (isSystemAuthAction) {
        console.log("System auth action in progress. Skipping listener...")
        return
      }

      if (user) {
        setFirebaseUser(user)
        await fetchUserData(user)

        // Listen to live updates of the user document
        unsubscribeSnapshot = onSnapshot(doc(db, "users", user.uid), (docResp) => {
          if (docResp.exists()) {
            const data = docResp.data();

            // Auto logout if disabled or UNVERIFIED (and grace period expired)
            if (data.isActive === false || (data.isVerified === false && !isGracePeriodActive(data.createdAt))) {
              console.log("Account status invalid or grace period expired. Logging out...");
              logout();
              return;
            }

            setCurrentUser((prev) => {
              // Even if prev is null (initial load), we can still use the data from onSnapshot
              // but we need the base user object from Firebase
              const baseUser = prev || user;
              const updatedUser: ExtendedUser = {
                ...baseUser,
                isAdmin: data.isAdmin || false,
                emailVisible: data.emailVisible || false,
                photoURL: data.photoURL || user.photoURL,
                displayName: data.displayName || user.displayName || user.email?.split("@")[0] || "User",
                bio: data.bio || "",
                followers: data.followers || [],
                following: data.following || [],
                instagramUrl: data.instagramUrl || "",
                twitterUrl: data.twitterUrl || "",
                supportLink: data.supportLink || "",
                location: data.location || "",
                library: data.library || [],
                poemLibrary: data.poemLibrary || [],
                finishedReads: data.finishedReads || [],
                pendingEmail: data.pendingEmail,
              };
              return updatedUser;
            });
          }
        });

      } else {
        setIsAdmin(false)
        setCurrentUser(null)
        setFirebaseUser(null)
        followCooldowns.forEach((timeout) => clearTimeout(timeout))
        followCooldowns.clear()
        lastUnfollowTimestamps.clear()
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
        }
      }
      setLoading(false)
    })

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, [])

  // Poll for email verification when there's a pending change or user is unverified
  useEffect(() => {
    if (!firebaseUser) return
    if (!currentUser?.pendingEmail && currentUser?.emailVerified) return

    const checkEmailVerification = async () => {
      try {
        // Reload the Firebase auth user to get latest status
        await firebaseUser.reload()
        const refreshedUser = auth.currentUser
        if (!refreshedUser) return

        // 1. Check for pending email change
        if (currentUser?.pendingEmail && refreshedUser.email === currentUser.pendingEmail) {
          await updateDoc(doc(db, "users", currentUser.uid), {
            pendingEmail: null,
            updatedAt: new Date().toISOString(),
          })
          await fetchUserData(refreshedUser)
          return
        }

        // 2. Check for general verification status sync
        if (!currentUser?.emailVerified && refreshedUser.emailVerified) {
          // fetchUserData will handle the Firestore sync via the logic added there
          await fetchUserData(refreshedUser)
        }
      } catch (error) {
        console.error('Error checking email verification:', error)
      }
    }

    // Check immediately
    checkEmailVerification()

    // Then poll every 5 seconds (more frequent for smoother UX during signup)
    const interval = setInterval(checkEmailVerification, 5000)

    return () => clearInterval(interval)
  }, [currentUser?.pendingEmail, currentUser?.emailVerified, firebaseUser])

  const value = {
    currentUser,
    login,
    register,
    logout,
    resetPassword,
    sendEmailVerificationLink,
    verifyEmail,
    loading,
    isAdmin,
    refreshUser,
    checkAccountStatus,
    signInWithSocialCredential,
    updateUserPhoto,
    updateUserProfile,
    toggleFollow,
    updateUserLibrary,
    updatePoemLibrary,
    markNovelAsFinished,
    markAllNotificationsAsRead,
    clearAllNotifications,
    updateUserEmail,
    changePassword,
    deleteUserAccount,
  }

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>
}