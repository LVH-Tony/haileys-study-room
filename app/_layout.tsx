import 'expo-dev-client';
import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';

async function tickStreak(userId: string) {
  await supabase.rpc('update_streak', { p_user_id: userId });
}

export default function RootLayout() {
  const { session, profile, loading, setSession, setLoading, fetchProfile } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        tickStreak(session.user.id); // count today's open as activity
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // Also tick streak when app comes back to foreground
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active' && session?.user.id) {
        tickStreak(session.user.id);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      subscription.unsubscribe();
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const currentRoute = segments[1] as string | undefined;

    // Not logged in → go to login
    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    // Logged in but profile not yet fetched
    if (profile === undefined) return;

    // No profile row at all — create one then re-fetch
    if (profile === null) {
      supabase
        .from('user_profiles')
        .insert({
          id: session.user.id,
          display_name:
            (session.user.user_metadata?.display_name as string | undefined) ??
            session.user.email?.split('@')[0] ??
            'Learner',
          starting_level: 'beginner',
          placement_score: null,
          xp: 0,
          streak_days: 0,
          last_active_at: null,
          is_premium: false,
        })
        .then(() => fetchProfile(session.user.id));
      return;
    }

    // Step 1: must take placement test
    if (!profile.placement_score && profile.placement_score !== 0) {
      if (currentRoute !== 'placement-test') {
        router.replace('/(auth)/placement-test');
      }
      return;
    }

    // Step 2: must complete onboarding
    if (!profile.onboarding_completed) {
      if (currentRoute !== 'onboarding') {
        router.replace('/(auth)/onboarding');
      }
      return;
    }

    // All done — push to main app if still in auth screens
    if (inAuthGroup) {
      router.replace('/(tabs)/');
    }
  }, [session, profile, loading, segments]);

  return (
    <>
      <StatusBar style="dark" backgroundColor="#F5ECD7" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="game/[topicId]" />
      </Stack>
    </>
  );
}
