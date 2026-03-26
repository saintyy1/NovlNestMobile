import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { File, Directory } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

export type CacheItem<T> = {
  data: T
  timestamp: number
  ttl: number
}

// 🔥 Prefix for AsyncStorage keys to avoid collisions
const STORAGE_PREFIX = "novelnest_cache_"

// In-memory cache
const memoryCache = new Map<string, CacheItem<any>>()

// 🔥 Track ongoing requests (deduplication)
const pendingRequests = new Map<string, Promise<any>>()

// 🖼️ Image Metadata Cache (uri -> localPath)
const imageMetaCache = new Map<string, string>()
const IMAGE_META_KEY = "novelnest_image_metadata"

// 📂 Image Cache Directory
const persistentDir: string | null = (FileSystem as any).documentDirectory ?? null;
const fallbackDir: string = (FileSystem as any).cacheDirectory ?? '';
const IMAGE_CACHE_DIR = (persistentDir ?? fallbackDir) + 'image-cache/';
let imageCacheDirInitialized = false;

const ensureImageCacheDir = async () => {
  if (imageCacheDirInitialized) return;
  const dir = new Directory(IMAGE_CACHE_DIR);
  if (!dir.exists) {
    await dir.create();
  }
  imageCacheDirInitialized = true;
};

export const CACHE_TTL = {
  NEAR_REALTIME: 30 * 1000, // 30s
  FEED: 3 * 60 * 1000, // 3min
  PROFILE: 5 * 60 * 1000, // 5min
  CONTENT: 15 * 60 * 1000, // 15min
}

let isInitialized = false;
let initPromise: Promise<void> | null = null;

// ♻️ Initialize cache from AsyncStorage on app start
export const initCacheFromStorage = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const cacheKeys = keys.filter(k => k.startsWith(STORAGE_PREFIX))
    
    if (cacheKeys.length === 0) {
      isInitialized = true
      return
    }

    const entries = await AsyncStorage.multiGet(cacheKeys)
    const now = Date.now()
    const keysToRemove: string[] = []

    for (const [key, itemStr] of entries) {
      if (itemStr) {
        try {
          const item: CacheItem<any> = JSON.parse(itemStr)
          if (now - item.timestamp <= item.ttl) {
            // Valid! Load it into the memory map
            const originalKey = key.replace(STORAGE_PREFIX, "")
            memoryCache.set(originalKey, item)
          } else {
            // Expired
            keysToRemove.push(key)
          }
        } catch (e) {
          // Bad JSON or corrupted data, clean it up
          keysToRemove.push(key)
        }
      }
    }

    // 🖼️ Load Image Metadata
    const imageMetaStr = await AsyncStorage.getItem(IMAGE_META_KEY)
    if (imageMetaStr) {
      try {
        const meta = JSON.parse(imageMetaStr)
        Object.entries(meta).forEach(([uri, path]) => {
          imageMetaCache.set(uri, path as string)
        })
      } catch (e) {}
    }

    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove)
    }
  } catch (e) {
    console.warn("AsyncStorage is not available", e)
  } finally {
    isInitialized = true
  }
}

// 🔥 Helper to evict oldest items when AsyncStorage is full
const evictOldestStorage = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const cacheKeys = keys.filter(k => k.startsWith(STORAGE_PREFIX))
    const entries = await AsyncStorage.multiGet(cacheKeys)
    
    const items = []
    
    for (const [key, itemStr] of entries) {
      if (itemStr) {
        try {
          const parsed = JSON.parse(itemStr)
          items.push({ key, timestamp: parsed.timestamp })
        } catch (e) {}
      }
    }
    
    // Sort oldest first
    items.sort((a, b) => a.timestamp - b.timestamp)
    
    // Delete the oldest 30% of cache items to free up bulk space
    const toDelete = Math.max(1, Math.floor(items.length * 0.3))
    const keysToRemove = items.slice(0, toDelete).map(item => item.key)
    
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove)
    }
  } catch (e) {
    console.warn("Failed during cache eviction", e)
  }
}

/**
 * Get cached data if valid
 */
export const getCachedData = <T>(key: string): T | null => {
  const item = memoryCache.get(key)
  if (!item) return null

  const now = Date.now()

  if (now - item.timestamp > item.ttl) {
    memoryCache.delete(key)
    AsyncStorage.removeItem(STORAGE_PREFIX + key).catch(() => {})
    return null
  }

  return item.data as T
}

/**
 * Set cache
 */
export const setCachedData = async <T>(
  key: string,
  data: T,
  ttl: number = CACHE_TTL.FEED
): Promise<void> => {
  const cacheItem = {
    data,
    timestamp: Date.now(),
    ttl,
  }
  
  memoryCache.set(key, cacheItem)
  
  // 🔥 Also save to AsyncStorage for cross-session persistence
  try {
    const stringified = JSON.stringify(cacheItem)
    
    // If a single item is insanely large (e.g. > 2.5MB), don't even try to store it
    if (stringified.length > 2500000) {
      console.warn(`[CACHE] Item ${key} is too large for AsyncStorage (${Math.round(stringified.length / 1024)}KB)`)
      return
    }

    try {
      await AsyncStorage.setItem(STORAGE_PREFIX + key, stringified)
    } catch (e: any) {
      // If quota exceeded, evict old items and try exactly one more time
      if (e.message?.toLowerCase().includes("quota") || e.message?.toLowerCase().includes("size")) {
        await evictOldestStorage()
        try {
          await AsyncStorage.setItem(STORAGE_PREFIX + key, stringified)
        } catch (retryErr) {
          console.warn(`[CACHE] Still exceeded quota after eviction for ${key}`)
        }
      } else {
        throw e
      }
    }
  } catch (e) {
    console.warn("Failed to persist cache to storage", e)
  }
}

/**
 * Clear specific or all cache
 */
export const clearCache = async (key?: string): Promise<void> => {
  if (key) {
    memoryCache.delete(key)
    try {
      await AsyncStorage.removeItem(STORAGE_PREFIX + key)
    } catch(e) {}
  } else {
    memoryCache.clear()
    imageMetaCache.clear()
    try {
      const keys = await AsyncStorage.getAllKeys()
      const keysToRemove = keys.filter(k => k.startsWith(STORAGE_PREFIX) || k === IMAGE_META_KEY)
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove)
      }
      
      // Also clear physical files
      const dir = new Directory(IMAGE_CACHE_DIR);
      if (dir.exists) {
        const files = await FileSystem.readDirectoryAsync(IMAGE_CACHE_DIR as any);
        await Promise.all(
          files.map((f) => FileSystem.deleteAsync(IMAGE_CACHE_DIR + f, { idempotent: true }))
        );
      }

      // 🖼️ Clear Expo Image native cache
      try {
        const { Image } = require('expo-image');
        await Image.clearMemoryCache();
        await Image.clearDiskCache();
      } catch (e) {}
    } catch(e) {}
  }
}

/**
 * 🔥 Clear cache by key prefix
 * Example: invalidateByPrefix("novels")
 */
export const invalidateByPrefix = async (prefix: string): Promise<void> => {
  const keysToRemove: string[] = []
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key)
      keysToRemove.push(STORAGE_PREFIX + key)
    }
  }
  
  if (keysToRemove.length > 0) {
    try {
      await AsyncStorage.multiRemove(keysToRemove)
    } catch(e) {}
  }
}

/**
 * 🔥 Invalidate a single key
 */
export const invalidateCache = async (key: string): Promise<void> => {
  memoryCache.delete(key)
  try {
    await AsyncStorage.removeItem(STORAGE_PREFIX + key)
  } catch(e) {}
}

/**
 * Optional logging
 */
const log = (message: string) => {
  if (process.env.NODE_ENV === "development") {
    console.log(message)
  }
}

export const ensureInitialized = () => {
  if (isInitialized) return Promise.resolve()
  if (!initPromise) initPromise = initCacheFromStorage()
  return initPromise
}

/**
 * 🚀 Main caching wrapper
 */
export const withCache = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CACHE_TTL.FEED
): Promise<T> => {
  // Wait for AsyncStorage dump to complete first
  await ensureInitialized()

  // ✅ 1. Check cache first
  const cachedData = getCachedData<T>(key)
  if (cachedData !== null) {
    log(`[CACHE HIT] ${key}`)
    return cachedData
  }

  // 🔥 2. Deduplicate requests
  if (pendingRequests.has(key)) {
    log(`[PENDING REQUEST] ${key}`)
    return pendingRequests.get(key)!
  }

  log(`[CACHE MISS] ${key}`)

  // 🔥 3. Fetch and store
  const promise = fetcher()
    .then((data) => {
      setCachedData(key, data, ttl) // Fire-and-forget AsyncStorage save
      pendingRequests.delete(key)
      return data
    })
    .catch((error) => {
      pendingRequests.delete(key)
      throw error
    })

  pendingRequests.set(key, promise)

  return promise
}

/**
 * 🖼️ Image Cache Helpers
 */

export const getImageCachedPath = (uri: string): string | null => {
  return imageMetaCache.get(uri) || null;
}

export const setImageCachedPath = async (uri: string, localPath: string): Promise<void> => {
  imageMetaCache.set(uri, localPath);
  try {
    const metaObj = Object.fromEntries(imageMetaCache.entries());
    await AsyncStorage.setItem(IMAGE_META_KEY, JSON.stringify(metaObj));
  } catch (e) {}
}

const getFileExtension = (url: string) => {
  const clean = url.split('?')[0];
  const match = clean.match(/\.([0-9a-zA-Z]+)$/);
  return match ? `.${match[1]}` : '.jpg';
};

export const getOrDownloadImage = async (uri: string): Promise<string> => {
  await ensureInitialized();
  
  // 1. Check Meta Cache
  if (imageMetaCache.has(uri)) return imageMetaCache.get(uri)!;

  // 2. Compute path
  await ensureImageCacheDir();
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, uri);
  const ext = getFileExtension(uri);
  const fileUri = `${IMAGE_CACHE_DIR}${hash}${ext}`;

  // 3. Check Disk
  const file = new File(fileUri);
  if (file.exists) {
    setImageCachedPath(uri, fileUri); // Backfill meta cache
    return fileUri;
  }

  // 4. Download
  const tempUri = `${fileUri}.tmp`;
  try {
    const downloaded = await FileSystem.downloadAsync(uri, tempUri);
    if (downloaded.status === 200) {
      await FileSystem.moveAsync({ from: tempUri, to: fileUri });
      setImageCachedPath(uri, fileUri);
      return fileUri;
    } else {
      await FileSystem.deleteAsync(tempUri, { idempotent: true });
      return uri; // Fallback to raw URI
    }
  } catch (e) {
    return uri;
  }
}

export const invalidateCacheForImage = async (uri: string): Promise<void> => {
  const localPath = imageMetaCache.get(uri);
  if (localPath) {
    try {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    } catch (e) {}
    imageMetaCache.delete(uri);
    // Update AsyncStorage
    const metaObj = Object.fromEntries(imageMetaCache.entries());
    await AsyncStorage.setItem(IMAGE_META_KEY, JSON.stringify(metaObj));
  }
}
