import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export type ReminderWindow = 'morning' | 'afternoon' | 'evening';

// Window → default trigger hour (24h)
const WINDOW_HOURS: Record<ReminderWindow, number> = {
  morning: 8,
  afternoon: 13,
  evening: 20,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Get the Expo push token and save it to the user's profile (for nudges). */
export async function registerPushToken(userId: string): Promise<void> {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    if (!token) return;
    await supabase.from('user_profiles').update({ push_token: token }).eq('id', userId);
  } catch { /* ignore — push token not critical */ }
}

export async function scheduleStudyReminders(options: {
  enabled: boolean;
  mode: 'window' | 'specific';
  window?: ReminderWindow;
  specificTime?: string; // "HH:MM"
  repeatCount: number;
  repeatGapMinutes: number;
}) {
  // Always cancel existing reminders first
  await cancelStudyReminders();
  if (!options.enabled) return;

  const granted = await requestNotificationPermissions();
  if (!granted) return;

  const baseHour = options.mode === 'specific' && options.specificTime
    ? parseInt(options.specificTime.split(':')[0], 10)
    : WINDOW_HOURS[options.window ?? 'evening'];

  const baseMinute = options.mode === 'specific' && options.specificTime
    ? parseInt(options.specificTime.split(':')[1], 10)
    : 0;

  const messages = [
    { title: "Time to learn! 📚", body: "Your daily English practice is waiting." },
    { title: "Don't forget! 🔥", body: "Keep your streak alive — just 5 minutes today." },
    { title: "Still waiting… 👀", body: "Your words miss you! Come back and practice." },
  ];

  for (let i = 0; i < Math.min(options.repeatCount, 3); i++) {
    const totalMinutes = baseHour * 60 + baseMinute + i * options.repeatGapMinutes;
    const hour = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;

    await Notifications.scheduleNotificationAsync({
      identifier: `study-reminder-${i}`,
      content: {
        title: messages[i].title,
        body: messages[i].body,
        data: { type: 'study_reminder' },
        ...(Platform.OS === 'android' && { channelId: 'study-reminders' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  }
}

export async function cancelStudyReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleWotdNotification(word: string, hour = 7, minute = 0) {
  await Notifications.scheduleNotificationAsync({
    identifier: 'wotd',
    content: {
      title: "Word of the Day ✨",
      body: `Today's word: "${word}" — tap to learn it!`,
      data: { type: 'wotd', word },
      ...(Platform.OS === 'android' && { channelId: 'wotd' }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function setupAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('study-reminders', {
    name: 'Study Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#E07B39',
  });
  await Notifications.setNotificationChannelAsync('wotd', {
    name: 'Word of the Day',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}
