import React, { useEffect, useState } from 'react';
import {
  Image,
  ImageProps,
  ActivityIndicator,
  View,
  StyleProp,
  ImageStyle,
} from 'react-native';

import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

type Props = Omit<ImageProps, 'source'> & {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  placeholderColor?: string;
};

// Prefer persistent storage when available so cached files survive restarts
const persistentDir: string | null = (FileSystem as any).documentDirectory ?? null;
const fallbackDir: string = (FileSystem as any).cacheDirectory ?? '';
const CACHE_DIR = (persistentDir ?? fallbackDir) + 'image-cache/';

const ensureCacheDir = async () => {
  const dirToCheck = CACHE_DIR;
  if (!dirToCheck) return;

  const info = await FileSystem.getInfoAsync(dirToCheck as any);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dirToCheck as any, {
      intermediates: true,
    });
  }
};

const getFileExtension = (url: string) => {
  const clean = url.split('?')[0];
  const match = clean.match(/\.([0-9a-zA-Z]+)$/);
  return match ? `.${match[1]}` : '.jpg';
};

export default function CachedImage({
  uri,
  style,
  placeholderColor = '#222',
  ...rest
}: Props) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!uri) {
        setLocalUri(null);
        return;
      }

      if (
        uri.startsWith('file://') ||
        uri.startsWith('data:') ||
        uri.startsWith('asset://')
      ) {
        setLocalUri(uri);
        return;
      }

      setLoading(true);

      try {
        await ensureCacheDir();

        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          uri
        );

        const ext = getFileExtension(uri);
        const fileUri = `${CACHE_DIR}${hash}${ext}`;

        const info = await FileSystem.getInfoAsync(fileUri);

        if (info.exists) {
          if (mounted) setLocalUri(fileUri);
        } else {
          const downloaded = await FileSystem.downloadAsync(uri, fileUri);
          if (mounted) setLocalUri(downloaded.uri);
        }
      } catch {
        if (mounted) setLocalUri(uri);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [uri]);

  if (!uri && !localUri) return null;

  const source = localUri ? { uri: localUri } : { uri };

  return loading && !localUri ? (
    <View
      style={[
        {
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: placeholderColor,
        },
        style as any,
      ]}
    >
      <ActivityIndicator size="small" color="#fff" />
    </View>
  ) : (
    <Image {...rest} source={source as any} style={style} />
  );
}

// Cache management utilities
export async function clearImageCache() {
  const dir = CACHE_DIR;
  if (!dir) return;
  try {
    const info = await FileSystem.getInfoAsync(dir as any);
    if (!info.exists) return;
    const files = await FileSystem.readDirectoryAsync(dir as any);
    await Promise.all(files.map((f) => FileSystem.deleteAsync(dir + f, { idempotent: true })));
  } catch (e) {
    // ignore
  }
}

export async function invalidateCacheForUrl(url: string) {
  if (!url) return;
  try {
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, url);
    const ext = getFileExtension(url);
    const fileUri = `${CACHE_DIR}${hash}${ext}`;
    const info = await FileSystem.getInfoAsync(fileUri as any);
    if (info.exists) {
      await FileSystem.deleteAsync(fileUri as any, { idempotent: true });
    }
  } catch (e) {
    // ignore
  }
}
