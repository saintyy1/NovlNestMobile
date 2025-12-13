import React, { createContext, useContext, useEffect, useState } from "react"
import { Alert } from "react-native"
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
  reauthenticateWithCredential,
  verifyBeforeUpdateEmail,
  applyActionCode,
  checkActionCode,
  updatePassword,
  deleteUser as firebaseDeleteUser,
  GoogleAuthProvider,
  signInWithCredential,
  OAuthProvider,
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
} from "firebase/firestore"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { auth, db, actionCodeSettings } from "../firebase/config"
import * as WebBrowser from 'expo-web-browser'
import * as AuthSession from 'expo-auth-session'

// Initialize WebBrowser for OAuth
WebBrowser.maybeCompleteAuthSession()

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
}

interface AuthContextType {
  currentUser: ExtendedUser | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  sendEmailVerificationLink: () => Promise<void>
  verifyEmail: (actionCode: string) => Promise<any>
  loading: boolean
  isAdmin: boolean
  refreshUser: () => Promise<void>
  updateUserPhoto: (photoBase64: string | null) => Promise<void>
  updateUserProfile: (
    displayName: string,
    bio: string,
    instagramUrl: string,
    twitterUrl: string,
    supportLink: string,
    location: string
  ) => Promise<void>
  toggleFollow: (targetUserId: string, isFollowing: boolean) => Promise<void>
  signInWithGoogle: () => Promise<void>
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
        const extendedUser = {
          ...user,
          isAdmin: data.isAdmin || false,
          emailVisible: data.emailVisible || false,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
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
        } as ExtendedUser
        setCurrentUser(extendedUser)
        setFirebaseUser(user)
        setIsAdmin(data.isAdmin === true)
        return extendedUser
      } else {
        const newUserData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split("@")[0] || "User",
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
        }
        await setDoc(doc(db, "users", user.uid), newUserData)
        const extendedUser = {
          ...user,
          displayName: user.displayName || user.email?.split("@")[0] || "User",
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
      await fetchUserData(firebaseUser)
    }
  }

  const updateUserPhoto = async (photoBase64: string | null) => {
    if (!currentUser || !firebaseUser) throw new Error("No user logged in")
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        photoURL: photoBase64,
        updatedAt: new Date().toISOString(),
      })
      setCurrentUser((prev) => (prev ? { ...prev, photoURL: photoBase64 } : null))
    } catch (error) {
      console.error("Error updating user photo:", error)
      throw error
    }
  }

  const updateUserProfile = async (
    displayName: string,
    bio: string,
    instagramUrl: string,
    twitterUrl: string,
    supportLink: string,
    location: string
  ) => {
    if (!currentUser || !firebaseUser) throw new Error("No user logged in")
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        displayName: displayName,
        bio: bio,
        instagramUrl: instagramUrl,
        twitterUrl: twitterUrl,
        supportLink: supportLink,
        location: location,
        updatedAt: new Date().toISOString(),
      })
      if (firebaseUser.displayName !== displayName) {
        await updateProfile(firebaseUser, { displayName })
      }
      if (currentUser.displayName !== displayName) {
        const novelsRef = collection(db, "novels")
        const q = query(novelsRef, where("authorId", "==", currentUser.uid))
        const querySnapshot = await getDocs(q)
        for (const novelDoc of querySnapshot.docs) {
          const novelRef = doc(db, "novels", novelDoc.id)
          await updateDoc(novelRef, { authorName: displayName })
        }
      }
      setCurrentUser((prev) => 
        prev ? { ...prev, displayName, bio, instagramUrl, twitterUrl, supportLink, location } : null
      )
    } catch (error) {
      console.error("Error updating user profile:", error)
      throw error
    }
  }

  const updateUserEmail = async (newEmail: string, confirmEmail: string, password?: string) => {
    if (!currentUser) throw new Error("No user logged in")
    const authUser = auth.currentUser
    if (!authUser) throw new Error("No authenticated user")

    if (newEmail !== confirmEmail) {
      throw new Error("Email addresses do not match")
    }
    if (!newEmail.includes("@")) {
      throw new Error("Please enter a valid email address")
    }
    if (newEmail === currentUser.email) {
      throw new Error("New email must be different from current email")
    }

    try {
      const isGoogleUser = authUser.providerData.some((p) => p.providerId.includes("google"))

      if (isGoogleUser) {
        await reauthenticateWithGoogle()
      } else {
        if (!password) {
          throw new Error("Password is required to change email")
        }
        if (!authUser.email) {
          throw new Error("Current user email not found")
        }
        const credential = EmailAuthProvider.credential(authUser.email, password)
        await reauthenticateWithCredential(authUser, credential)
      }

      try {
        await verifyBeforeUpdateEmail(authUser, newEmail)
      } catch (e) {
        console.error("Failed to send email change verification:", e)
        throw new Error("Could not send verification email to new address. Please check if the email address is valid.")
      }

      await updateDoc(doc(db, "users", currentUser.uid), {
        pendingEmail: newEmail,
        updatedAt: new Date().toISOString(),
      })

      setCurrentUser((prev) => (prev ? { ...prev, pendingEmail: newEmail } : null))
    } catch (error) {
      console.error("Error updating email:", error)
      if (error instanceof Error) {
        if (error.message.includes("operation-not-allowed")) {
          throw new Error("Email verification is required. Please check your email and click the verification link.")
        }
        if (error.message.includes("user-mismatch")) {
          throw new Error("Please use your current email and password for verification.")
        }
      }
      throw error
    }
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!currentUser) throw new Error("No user logged in")
    const authUser = auth.currentUser
    if (!authUser) throw new Error("No authenticated user")

    if (newPassword.length < 6) {
      throw new Error("New password must be at least 6 characters long")
    }

    try {
      const isGoogleUser = authUser.providerData.some((p) => p.providerId.includes("google"))

      if (isGoogleUser) {
        // For Google users, reauthenticate with Google first
        await reauthenticateWithGoogle()
      } else {
        // For email users, reauthenticate with current password
        if (!authUser.email) {
          throw new Error("Current user email not found")
        }
        const credential = EmailAuthProvider.credential(authUser.email, currentPassword)
        await reauthenticateWithCredential(authUser, credential)
      }

      // Now update the password
      await updatePassword(authUser, newPassword)

      await updateDoc(doc(db, "users", currentUser.uid), {
        updatedAt: new Date().toISOString(),
      })
    } catch (error) {
      console.error("Error changing password:", error)
      if (error instanceof Error) {
        if (error.message.includes("wrong-password") || error.message.includes("invalid-credential")) {
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
      const isGoogleUser = authUser.providerData.some((p) => p.providerId.includes("google"))

      if (isGoogleUser) {
        await reauthenticateWithGoogle()
      } else {
        if (!password) {
          throw new Error("Password is required to delete account")
        }
        if (!authUser.email) {
          throw new Error("Current user email not found")
        }
        const credential = EmailAuthProvider.credential(authUser.email, password)
        await reauthenticateWithCredential(authUser, credential)
      }

      const userId = authUser.uid

      const batch = writeBatch(db)

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

      await AsyncStorage.clear()

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
              library: add ? [...(prev.library || []), novelId] : (prev.library || []).filter((id) => id !== novelId),
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
        }
      } else if (!add) {
        await clearNovelLikeCooldown(currentUser.uid, novelId)
        await clearNovelAddedToLibraryCooldown(currentUser.uid, novelId)
      }
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
        }
        await updateDoc(userRef, {
          finishedReads: arrayUnion(novelId),
          library: arrayRemove(novelId),
          updatedAt: new Date().toISOString(),
        })
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                finishedReads: [...(prev.finishedReads || []), novelId],
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
                library: [...(prev.library || []), novelId],
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
                ? [...(prev.poemLibrary || []), poemId] 
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
        }
      } else if (!add) {
        await clearPoemLikeCooldown(currentUser.uid, poemId)
        await clearPoemAddedToLibraryCooldown(currentUser.uid, poemId)
      }
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

    const allUsersSnapshot = await getDocs(collection(db, "users"))
    const displayNameExists = allUsersSnapshot.docs.some((doc) => {
      const existingName = doc.data().displayName
      if (!existingName) return false
      const normalizedExistingName = existingName.toLowerCase().replace(/\s+/g, " ").trim()
      return normalizedExistingName === normalizedDisplayName
    })

    if (displayNameExists) {
      throw new Error("This display name is already taken. Try another one.")
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
    }
    await setDoc(doc(db, "users", user.uid), newUserData)

    const extendedUser: ExtendedUser = {
      ...user,
      displayName: trimmedDisplayName,
      photoURL: null,
      isAdmin: false,
      emailVisible: false,
      createdAt: newUserData.createdAt,
      bio: newUserData.bio,
      followers: newUserData.followers,
      following: newUserData.following,
      instagramUrl: newUserData.instagramUrl,
      twitterUrl: newUserData.twitterUrl,
      supportLink: newUserData.supportLink,
      location: newUserData.location,
      library: newUserData.library,
      poemLibrary: newUserData.poemLibrary,
      finishedReads: newUserData.finishedReads,
      pendingEmail: newUserData.pendingEmail,
    }
    setCurrentUser(extendedUser)
    setFirebaseUser(user)
  }

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const logout = async () => {
    try {
      await signOut(auth)
      setIsAdmin(false)
      setCurrentUser(null)
      setFirebaseUser(null)

      await AsyncStorage.clear()

      followCooldowns.forEach((timeout) => clearTimeout(timeout))
      followCooldowns.clear()
      lastUnfollowTimestamps.clear()
    } catch (error) {
      console.error("Error during logout:", error)
      throw error
    }
  }

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email)
  }

  const sendEmailVerificationLink = async () => {
    if (!firebaseUser) throw new Error("No user logged in")
    await sendEmailVerification(firebaseUser, actionCodeSettings)
  }

  const verifyEmail = async (actionCode: string) => {
    try {
      const info = await checkActionCode(auth, actionCode)
      await applyActionCode(auth, actionCode)

      if (firebaseUser) {
        await firebaseUser.reload()
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
      // Use custom redirect URI for mobile app
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'novlnest',
        path: 'oauth/callback',
      })

      if (!redirectUri) {
        throw new Error('Could not create redirect URI')
      }

      // Create auth request
      const request = new AuthSession.AuthRequest({
        clientId: '171117861268-msg103kefn7trmdmsmj586t754h8fjh8.apps.googleusercontent.com',
        redirectUri: redirectUri,
        scopes: ['openid', 'profile', 'email'],
        usePKCE: true,
      })

      // Prompt user to sign in
      const result = await request.promptAsync({
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      })

      if (result.type !== 'success') {
        throw new Error('Google sign-in was cancelled')
      }

      // Get authorization code
      const { code } = result.params as any
      if (!code) {
        throw new Error('No authorization code received')
      }

      // Exchange code for ID token using your backend
      const tokenResponse = await fetch('https://novlnest-backend.onrender.com/auth/google/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${error}`)
      }

      const { id_token } = await tokenResponse.json()
      if (!id_token) {
        throw new Error('No ID token received')
      }

      // Reauthenticate with Firebase using the ID token
      const credential = GoogleAuthProvider.credential(id_token)
      const authUser = auth.currentUser
      if (authUser) {
        await reauthenticateWithCredential(authUser, credential)
      }
    } catch (error) {
      console.error("Error reauthenticating with Google:", error)
      throw error
    }
  }

  const signInWithGoogle = async () => {
    try {
      // Use custom redirect URI for mobile app
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'novlnest',
        path: 'oauth/callback',
      })

      if (!redirectUri) {
        throw new Error('Could not create redirect URI')
      }

      // Create auth request
      const request = new AuthSession.AuthRequest({
        clientId: '171117861268-msg103kefn7trmdmsmj586t754h8fjh8.apps.googleusercontent.com',
        redirectUri: redirectUri,
        scopes: ['openid', 'profile', 'email'],
        usePKCE: true,
      })

      // Prompt user to sign in
      const result = await request.promptAsync({
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      })

      if (result.type !== 'success') {
        throw new Error('Google sign-in was cancelled')
      }

      // Get authorization code
      const { code } = result.params as any
      if (!code) {
        throw new Error('No authorization code received')
      }

      // Exchange code for ID token using your backend
      const tokenResponse = await fetch('https://novlnest-backend.onrender.com/auth/google/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${error}`)
      }

      const { id_token } = await tokenResponse.json()
      if (!id_token) {
        throw new Error('No ID token received')
      }

      // Sign in to Firebase with the ID token
      const credential = GoogleAuthProvider.credential(id_token)
      const firebaseResult = await signInWithCredential(auth, credential)
      const user = firebaseResult.user

      // Check if new user and create document
      const userDoc = await getDoc(doc(db, "users", user.uid))
      
      if (!userDoc.exists()) {
        const googleDisplayName = user.displayName || user.email?.split("@")[0] || "User"
        const trimmedDisplayName = googleDisplayName.trim()

        if (trimmedDisplayName.length > 50) {
          await firebaseDeleteUser(user)
          throw new Error("Display name is too long (max 50 characters)")
        }

        const validNamePattern = /^[a-zA-Z0-9\s\-']+$/
        if (!validNamePattern.test(trimmedDisplayName)) {
          await firebaseDeleteUser(user)
          throw new Error("Display name can only contain letters, numbers, spaces, hyphens, and apostrophes")
        }

        const normalizedGoogleName = trimmedDisplayName.toLowerCase().replace(/\s+/g, " ").trim()

        const allUsersSnapshot = await getDocs(collection(db, "users"))
        const displayNameExists = allUsersSnapshot.docs.some((doc) => {
          const existingName = doc.data().displayName
          if (!existingName) return false
          const normalizedExistingName = existingName.toLowerCase().replace(/\s+/g, " ").trim()
          return normalizedExistingName === normalizedGoogleName
        })

        if (displayNameExists) {
          throw new Error("This display name is already taken. Try another one.")
        }

        const newUserData = {
          uid: user.uid,
          email: user.email,
          displayName: trimmedDisplayName,
          displayNameLower: normalizedGoogleName,
          photoURL: user.photoURL || null,
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
        }
        await setDoc(doc(db, "users", user.uid), newUserData)
      }
      
      await fetchUserData(user)
    } catch (error) {
      console.error("Error signing in with Google:", error)
      throw error
    }
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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await fetchUserData(user)
      } else {
        setIsAdmin(false)
        setCurrentUser(null)
        setFirebaseUser(null)
        followCooldowns.forEach((timeout) => clearTimeout(timeout))
        followCooldowns.clear()
        lastUnfollowTimestamps.clear()
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

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
    updateUserPhoto,
    updateUserProfile,
    toggleFollow,
    signInWithGoogle,
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