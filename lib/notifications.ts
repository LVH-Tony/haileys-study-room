import { Platform } from 'react-native';
import { supabase } from './supabase';

export type ReminderWindow = 'morning' | 'afternoon' | 'evening';

const IS_WEB = Platform.OS === 'web';

const WINDOW_HOURS: Record<ReminderWindow, number> = {
  morning: 8,
  afternoon: 13,
  evening: 20,
};

// Only set up notification handler on native
if (!IS_WEB) {
  const Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (IS_WEB) return false;
  const Notifications = require('expo-notifications');
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function registerPushToken(userId: string): Promise<void> {
  if (IS_WEB) return;
  try {
    const Notifications = require('expo-notifications');
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync();
    if (!token) return;
    await supabase.from('user_profiles').update({ push_token: token }).eq('id', userId);
  } catch { /* ignore */ }
}

export async function scheduleStudyReminders(options: {
  enabled: boolean;
  mode: 'window' | 'specific';
  window?: ReminderWindow;
  specificTime?: string;
  repeatCount: number;
  repeatGapMinutes: number;
}) {
  if (IS_WEB) return;
  const Notifications = require('expo-notifications');
  await Notifications.cancelAllScheduledNotificationsAsync();
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
  if (IS_WEB) return;
  const Notifications = require('expo-notifications');
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleWotdNotification(word: string, hour = 7, minute = 0) {
  if (IS_WEB) return;
  const Notifications = require('expo-notifications');
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
  if (IS_WEB || Platform.OS !== 'android') return;
  const Notifications = require('expo-notifications');
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
