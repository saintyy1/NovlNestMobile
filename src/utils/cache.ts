import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';

export type CacheItem<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

// 🔥 Prefix for AsyncStorage keys
const STORAGE_PREFIX = "novelnest_cache_";

// In-memory cache
const memoryCache = new Map<string, CacheItem<any>>();

// 🔥 Track ongoing requests
const pendingRequests = new Map<string, Promise<any>>();

// 🖼️ Image Metadata Cache (uri -> localPath)
const imageMetaCache = new Map<string, string>();
const IMAGE_META_KEY = "novelnest_image_metadata";
const APP_VERSION_KEY = "novelnest_app_version";

// 📂 Image Cache Directory 
const persistentDir: string | null = (FileSystem as any).documentDirectory ?? null;
const fallbackDir: string = (FileSystem as any).cacheDirectory ?? '';
const IMAGE_CACHE_DIR = (persistentDir ?? fallbackDir) + 'image-cache/';
let imageCacheDirInitialized = false;

// TTLs
export const CACHE_TTL = {
  NEAR_REALTIME: 30 * 1000, // 30s
  FEED: 3 * 60 * 1000,      // 3min
  PROFILE: 5 * 60 * 1000,   // 5min
  CONTENT: 15 * 60 * 1000,  // 15min
  USER_PREVIEW: 24 * 60 * 60 * 1000, // 24h (names/photos change rarely)
};

let isInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Strip large fields before caching (web parity)
 */
export const stripLargeFields = (data: any, level = 0) => {
  if (!data) return data;

  if (data.chapters && Array.isArray(data.chapters)) {
    data.chapters = data.chapters.map((c: any) => {
      if (level >= 1) {
        const stripped: { id: any; title: any; content?: string } = { id: c.id, title: c.title };
        if (level >= 2) stripped.content = c.content?.slice(0, 50); // optional small preview
        return stripped;
      }
      return c;
    });
  }

  if (data.prologue && level >= 1) data.prologue = data.prologue.slice(0, 100);
  if (data.epilogue && level >= 1) data.epilogue = data.epilogue.slice(0, 100);
  if (data.authorsNote && level >= 1) data.authorsNote = data.authorsNote.slice(0, 100);

  return data;
};

// ⚡ Ensure image cache directory exists
const ensureImageCacheDir = async () => {
  if (imageCacheDirInitialized) return;
  const info = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_CACHE_DIR, { intermediates: true });
  }
  imageCacheDirInitialized = true;
};

/**
 * Initialize cache from AsyncStorage
 */
export const initCacheFromStorage = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith(STORAGE_PREFIX));

    if (cacheKeys.length > 0) {
      const entries = await AsyncStorage.multiGet(cacheKeys);
      const now = Date.now();
      const keysToRemove: string[] = [];

      for (const [key, itemStr] of entries) {
        if (!itemStr) continue;
        try {
          const item: CacheItem<any> = JSON.parse(itemStr);
          if (now - item.timestamp <= item.ttl) {
            const originalKey = key.replace(STORAGE_PREFIX, "");
            memoryCache.set(originalKey, item);
          } else {
            keysToRemove.push(key);
          }
        } catch {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
      }
    }

    // Load image metadata
    const imageMetaStr = await AsyncStorage.getItem(IMAGE_META_KEY);
    if (imageMetaStr) {
      try {
        const meta = JSON.parse(imageMetaStr);
        Object.entries(meta).forEach(([uri, path]) => imageMetaCache.set(uri, path as string));
      } catch { }
    }
  } catch (e) {
    console.warn("AsyncStorage not available", e);
  } finally {
    isInitialized = true;
  }
};

// ⚡ Evict oldest items if storage full
const evictOldestStorage = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith(STORAGE_PREFIX));
    const entries = await AsyncStorage.multiGet(cacheKeys);

    const items: { key: string; timestamp: number }[] = [];
    for (const [key, itemStr] of entries) {
      if (!itemStr) continue;
      try {
        const parsed = JSON.parse(itemStr);
        items.push({ key, timestamp: parsed.timestamp });
      } catch { }
    }

    items.sort((a, b) => a.timestamp - b.timestamp);
    const toDelete = Math.max(1, Math.floor(items.length * 0.3));
    const keysToRemove = items.slice(0, toDelete).map(item => item.key);
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch (e) {
    console.warn("Cache eviction failed", e);
  }
};

// ⚡ Get cached data
export const getCachedData = <T>(key: string): T | null => {
  const item = memoryCache.get(key);
  if (!item) return null;

  const now = Date.now();
  if (now - item.timestamp > item.ttl) {
    memoryCache.delete(key);
    AsyncStorage.removeItem(STORAGE_PREFIX + key).catch(() => { });
    return null;
  }

  return item.data as T;
};

// ⚡ Set cached data
export const setCachedData = async <T>(key: string, data: T, ttl: number = CACHE_TTL.FEED, stripLevel = 0) => {
  const processedData = stripLargeFields(data, stripLevel);
  const cacheItem: CacheItem<T> = { data: processedData, timestamp: Date.now(), ttl };
  memoryCache.set(key, cacheItem);

  try {
    const stringified = JSON.stringify(cacheItem);
    if (stringified.length > 2500000) {
      console.warn(`[CACHE] Item ${key} too large (${Math.round(stringified.length / 1024)} KB)`);
      return;
    }

    try {
      await AsyncStorage.setItem(STORAGE_PREFIX + key, stringified);
    } catch (e: any) {
      if (e.message?.toLowerCase().includes("quota") || e.message?.toLowerCase().includes("size")) {
        await evictOldestStorage();
        await AsyncStorage.setItem(STORAGE_PREFIX + key, stringified).catch(() => {
          console.warn(`[CACHE] Storage still full for ${key}`);
        });
      } else {
        throw e;
      }
    }
  } catch (e) {
    console.warn("Failed to persist cache", e);
  }
};

// ⚡ Clear cache
export const clearCache = async (key?: string) => {
  if (key) {
    memoryCache.delete(key);
    await AsyncStorage.removeItem(STORAGE_PREFIX + key).catch(() => { });
  } else {
    memoryCache.clear();
    imageMetaCache.clear();
    const keys = await AsyncStorage.getAllKeys();
    const keysToRemove = keys.filter(k => k.startsWith(STORAGE_PREFIX) || k === IMAGE_META_KEY);
    if (keysToRemove.length > 0) await AsyncStorage.multiRemove(keysToRemove);

    const info = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
    if (info.exists) {
      const files = await FileSystem.readDirectoryAsync(IMAGE_CACHE_DIR);
      await Promise.all(files.map(f => FileSystem.deleteAsync(IMAGE_CACHE_DIR + f, { idempotent: true })));
    }

    try {
      const { Image } = require('expo-image');
      await Image.clearMemoryCache();
      await Image.clearDiskCache();
    } catch { }
  }
};

// ⚡ Invalidate by prefix
export const invalidateByPrefix = async (prefix: string) => {
  const keysToRemove: string[] = [];
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
      keysToRemove.push(STORAGE_PREFIX + key);
    }
  }
  if (keysToRemove.length > 0) await AsyncStorage.multiRemove(keysToRemove);
};

// ⚡ Invalidate single key
export const invalidateCache = async (key: string) => {
  memoryCache.delete(key);
  await AsyncStorage.removeItem(STORAGE_PREFIX + key).catch(() => { });
};

// ⚡ Domain-specific helpers (web parity)
export const invalidateNovelCache = async () => invalidateByPrefix("novel_");
export const invalidatePoemCache = async () => invalidateByPrefix("poem_");
export const invalidateProfileCache = async (userId?: string) => userId ? invalidateByPrefix(`profile_user_${userId}`) : invalidateByPrefix("profile_");
export const invalidateAnnouncementCache = async (userId: string) => invalidateByPrefix(`announcements_${userId}`);
export const invalidateHomeCache = async () => invalidateByPrefix("home_");
export const invalidateBrowseCache = async () => invalidateByPrefix("browse_");
export const invalidateUserPreviewCache = async (userId: string) => invalidateCache(`user_preview_${userId}`);

// ⚡ Ensure initialized
export const ensureInitialized = () => {
  if (isInitialized) return Promise.resolve();
  if (!initPromise) initPromise = initCacheFromStorage();
  return initPromise;
};

/**
 * Check if app version has changed and clear cache if it has
 */
export const checkVersionAndClearCache = async () => {
  try {
    const currentVersion = Constants.expoConfig?.version || '1.0.0';
    const storedVersion = await AsyncStorage.getItem(APP_VERSION_KEY);

    if (storedVersion !== currentVersion) {
      console.log(`[CACHE] Version changed from ${storedVersion} to ${currentVersion}. Clearing cache...`);
      await clearCache();
      await AsyncStorage.setItem(APP_VERSION_KEY, currentVersion);
      return true; // Cache was cleared
    }
  } catch (e) {
    console.warn("[CACHE] Failed to check version", e);
  }
  return false;
};

// ⚡ Main caching wrapper
export const withCache = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CACHE_TTL.FEED,
  stripLevel = 0
): Promise<T> => {
  await ensureInitialized();

  const cached = getCachedData<T>(key);
  if (cached !== null) return cached;

  if (pendingRequests.has(key)) return pendingRequests.get(key)!;

  const promise = fetcher()
    .then(data => {
      setCachedData(key, data, ttl, stripLevel);
      pendingRequests.delete(key);
      return data;
    })
    .catch(err => {
      pendingRequests.delete(key);
      throw err;
    });

  pendingRequests.set(key, promise);
  return promise;
};

// ⚡ Image cache helpers
export const getImageCachedPath = (uri: string) => imageMetaCache.get(uri) || null;

export const setImageCachedPath = async (uri: string, localPath: string) => {
  imageMetaCache.set(uri, localPath);
  try {
    const metaObj = Object.fromEntries(imageMetaCache.entries());
    await AsyncStorage.setItem(IMAGE_META_KEY, JSON.stringify(metaObj));
  } catch { }
};

const getFileExtension = (url: string) => {
  const clean = url.split('?')[0];
  const match = clean.match(/\.([0-9a-zA-Z]+)$/);
  return match ? `.${match[1]}` : '.jpg';
};

export const getOrDownloadImage = async (uri: string): Promise<string> => {
  await ensureInitialized();

  if (imageMetaCache.has(uri)) return imageMetaCache.get(uri)!;

  await ensureImageCacheDir();
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, uri);
  const ext = getFileExtension(uri);
  const fileUri = `${IMAGE_CACHE_DIR}${hash}${ext}`;

  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (fileInfo.exists) {
    await setImageCachedPath(uri, fileUri);
    return fileUri;
  }

  const tempUri = `${fileUri}.tmp`;
  try {
    const downloaded = await FileSystem.downloadAsync(uri, tempUri);
    if (downloaded.status === 200) {
      await FileSystem.moveAsync({ from: tempUri, to: fileUri });
      await setImageCachedPath(uri, fileUri);
      return fileUri;
    } else {
      await FileSystem.deleteAsync(tempUri, { idempotent: true });
      return uri;
    }
  } catch {
    return uri;
  }
};

export const prefetchImages = async (uris: string[]) => {
  await Promise.all(uris.map(uri => getOrDownloadImage(uri)));
};

export const invalidateCacheForImage = async (uri: string) => {
  const localPath = imageMetaCache.get(uri);
  if (localPath) {
    await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => { });
    imageMetaCache.delete(uri);
    const metaObj = Object.fromEntries(imageMetaCache.entries());
    await AsyncStorage.setItem(IMAGE_META_KEY, JSON.stringify(metaObj));
  }
};