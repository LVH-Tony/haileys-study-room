/**
 * Widget task handler — runs in the background to provide data to the widget.
 * Registered as a background task via expo-task-manager.
 */
import * as TaskManager from 'expo-task-manager';
import { WidgetTaskHandler, requestWidgetUpdate } from 'react-native-android-widget';
import { StudyRoomWidget, WidgetData } from './StudyRoomWidget';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WIDGET_TASK_NAME = 'STUDY_ROOM_WIDGET_TASK';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

async function getWidgetData(): Promise<WidgetData> {
  const fallback: WidgetData = {
    word: 'Open the app',
    topic: 'to see your word',
    imageUrl: null,
    streakDays: 0,
  };

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return fallback;

    const userId = session.user.id;
    const today = new Date().toISOString().split('T')[0];

    const [wotdRes, profileRes] = await Promise.all([
      supabase
        .from('word_of_the_day')
        .select('words(word, image_url, topics(name))')
        .eq('user_id', userId)
        .eq('date', today)
        .single(),
      supabase
        .from('user_profiles')
        .select('streak_days')
        .eq('id', userId)
        .single(),
    ]);

    const word = (wotdRes.data?.words as any);
    if (!word) return { ...fallback, streakDays: profileRes.data?.streak_days ?? 0 };

    return {
      word: word.word ?? 'Loading…',
      topic: word.topics?.name ?? '',
      imageUrl: word.image_url ?? null,
      streakDays: profileRes.data?.streak_days ?? 0,
    };
  } catch {
    return fallback;
  }
}

const widgetTaskHandler: WidgetTaskHandler = async ({ widgetInfo, widgetAction }) => {
  const data = await getWidgetData();

  if (widgetAction === 'WIDGET_ADDED' || widgetAction === 'WIDGET_UPDATE') {
    return {
      renderWidget: () => <StudyRoomWidget {...data} />,
      widgetName: 'StudyRoomWidget',
    };
  }

  if (widgetAction === 'WIDGET_CLICK') {
    // Deep link handled natively via clickAction="OPEN_APP"
    return { widgetName: 'StudyRoomWidget' };
  }
};

TaskManager.defineTask(WIDGET_TASK_NAME, widgetTaskHandler);

export { WIDGET_TASK_NAME };

// Call this from the app to push fresh data to the widget
export async function updateWidget() {
  const data = await getWidgetData();
  await requestWidgetUpdate({
    widgetName: 'StudyRoomWidget',
    renderWidget: () => <StudyRoomWidget {...data} />,
    widgetNotFound: () => {},
  });
}
