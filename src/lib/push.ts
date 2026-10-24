import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/* Push notifications — register this phone and save its Expo token on the profile. */

// Show notifications even while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPush(uid: string): Promise<string | null> {
  try {
    if (!Device.isDevice) return null; // emulators can't receive push

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Games',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#001645',
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await supabase.from('profiles').update({ push_token: token }).eq('id', uid);
    return token;
  } catch (e) {
    console.warn('[push] register failed', e);
    return null;
  }
}

/** Remove token on sign-out so this phone stops receiving the old account's pushes. */
export async function clearPushToken(uid: string) {
  try { await supabase.from('profiles').update({ push_token: null }).eq('id', uid); } catch {}
}
