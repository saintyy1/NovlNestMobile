import React from 'react';
import {
  StyleProp,
  ImageStyle,
} from 'react-native';
import { Image, ImageProps } from 'expo-image';

// -------------------- Component Props --------------------
type Props = Omit<ImageProps, 'source'> & {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  placeholderColor?: string;
};

// -------------------- CachedImage Component --------------------
export default function CachedImage({
  uri,
  style,
  placeholderColor = '#222',
  ...rest
}: Props) {
  if (!uri) return null;

  return (
    <Image
      {...rest}
      source={{ uri }}
      style={style}
      cachePolicy="memory-disk"
      transition={200}
      placeholder={placeholderColor}
      placeholderContentFit="cover"
    />
  );
}

// -------------------- Backward Compatibility / Helpers --------------------
export async function preloadImage(uri: string) {
  return Image.prefetch(uri);
}

export async function clearImageCache() {
  await Image.clearMemoryCache();
  await Image.clearDiskCache();
}

export async function invalidateCacheForUrl(url: string) {
  // expo-image doesn't have a direct per-url invalidate yet,
  // but clearing memory cache often forces a fresh disk/network check.
  await Image.clearMemoryCache();
}