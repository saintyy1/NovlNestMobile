import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import Constants from 'expo-constants';

export interface AppConfig {
    latestVersion: string;
    minRequiredVersion: string;
    iosUpdateUrl: string;
    androidUpdateUrl: string;
}

export type UpdateStatus = 'no_update' | 'optional_update' | 'force_update';

/**
 * Compares two semantic version strings (e.g., "1.0.2" vs "1.0.1")
 * Returns:
 *  1 if v1 > v2
 * -1 if v1 < v2
 *  0 if v1 == v2
 */
export const compareVersions = (v1: string, v2: string): number => {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
};

/**
 * Fetches the app configuration from Firestore and checks for updates
 */
export const checkAppVersion = async (): Promise<{
    status: UpdateStatus;
    config: AppConfig | null;
}> => {
    try {
        const currentVersion = Constants.expoConfig?.version || '1.0.0';

        // Remote config document reference
        const configRef = doc(db, 'metadata', 'app_config');
        const configSnap = await getDoc(configRef);

        if (!configSnap.exists()) {
            console.warn('[VersionCheck] No app_config found in Firestore metadata collection.');
            return { status: 'no_update', config: null };
        }

        const config = configSnap.data() as AppConfig;
        const { latestVersion, minRequiredVersion } = config;

        // Check if force update is required
        if (compareVersions(currentVersion, minRequiredVersion) < 0) {
            return { status: 'force_update', config };
        }

        // Check if optional update is available
        if (compareVersions(currentVersion, latestVersion) < 0) {
            return { status: 'optional_update', config };
        }

        return { status: 'no_update', config };
    } catch (error) {
        console.error('[VersionCheck] Error checking app version:', error);
        return { status: 'no_update', config: null };
    }
};
