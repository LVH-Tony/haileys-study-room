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

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // New user with no profile — send to placement test
      if (!profile) return;
      if (!profile.placement_score && profile.placement_score !== 0) {
        router.replace('/(auth)/placement-test');
      } else {
        router.replace('/(tabs)/');
      }
    }
  }, [session, profile, loading, segments]);

  return (
    <>
      <StatusBar style="dark" backgroundColor="#F5ECD7" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="game" />
      </Stack>
    </>
  );
}
