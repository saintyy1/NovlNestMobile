import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Compresses an image specifically to be used for high-res covers.
 * Ported logic from web: quality reduction first, then dimension reduction if still over limit.
 * @param uri The URI of the image to compress
 * @param maxSize Max size in bytes (default 1MB)
 * @returns An object containing the final URI and the Blob for uploading
 */
export const compressForCover = async (
  uri: string,
  maxSize: number = 1024 * 1024 // 1MB
): Promise<{ uri: string; blob: Blob }> => {
  try {
    let currentUri = uri;
    let quality = 0.9;
    let width: number | undefined;

    // Get initial info
    const initialInfo = await FileSystem.getInfoAsync(uri);
    if (initialInfo.exists && initialInfo.size < maxSize) {
      const response = await fetch(uri);
      return { uri, blob: await response.blob() };
    }

    // Iterative compression loop
    let currentSize = initialInfo.exists ? initialInfo.size : Infinity;
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (currentSize > maxSize && iterations < MAX_ITERATIONS) {
      const actions: ImageManipulator.Action[] = [];
      if (width) {
        actions.push({ resize: { width } });
      }

      const result = await ImageManipulator.manipulateAsync(
        uri,
        actions,
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
      );

      currentUri = result.uri;
      const info = await FileSystem.getInfoAsync(currentUri);
      currentSize = info.exists ? info.size : 0;

      if (currentSize > maxSize) {
        if (quality > 0.6) {
          quality -= 0.1;
        } else {
          // If quality reduction isn't enough, start shrinking dimensions
          // Ensure we don't go below 1000px to maintain quality for carousels
          const currentWidth = result.width;
          if (currentWidth > 1000) {
            width = Math.max(1000, Math.floor(currentWidth * 0.8));
          } else {
            // If already at 1000px and still too large, just stop
            break;
          }
        }
      }
      iterations++;
    }

    const finalResponse = await fetch(currentUri);
    const finalBlob = await finalResponse.blob();
    return { uri: currentUri, blob: finalBlob };
  } catch (error) {
    console.error('Error in compressForCover:', error);
    const response = await fetch(uri);
    return { uri, blob: await response.blob() };
  }
};

/**
 * Generates a small thumbnail blob (fits within 200x300 while maintaining aspect ratio).
 * @param uri The URI of the image
 * @returns An object containing the final URI and the Blob for uploading
 */
export const generateSmallCover = async (
  uri: string,
  maxWidth: number = 200,
  maxHeight: number = 300
): Promise<{ uri: string; blob: Blob }> => {
  try {
    // We need to get the image dimensions first
    const info = await ImageManipulator.manipulateAsync(uri, []);
    const { width: originalWidth, height: originalHeight } = info;

    let newWidth = originalWidth;
    let newHeight = originalHeight;

    if (originalWidth > originalHeight) {
      if (originalWidth > maxWidth) {
        newHeight = Math.round(originalHeight * (maxWidth / originalWidth));
        newWidth = maxWidth;
      }
    } else {
      if (originalHeight > maxHeight) {
        newWidth = Math.round(originalWidth * (maxHeight / originalHeight));
        newHeight = maxHeight;
      }
    }

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: newWidth, height: newHeight } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );

    const response = await fetch(result.uri);
    const blob = await response.blob();
    return { uri: result.uri, blob };
  } catch (error) {
    console.error('Error in generateSmallCover:', error);
    const response = await fetch(uri);
    return { uri, blob: await response.blob() };
  }
};

/**
 * Basic compression for general use
 */
export const compressImage = async (
  uri: string,
  maxWidth: number = 1200,
  quality: number = 0.7
): Promise<string> => {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (error) {
    console.error('Error compressing image:', error);
    return uri;
  }
};
