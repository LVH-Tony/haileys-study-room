import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';

export default function RootLayout() {
  const { session, profile, loading, setSession, setLoading, fetchProfile } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
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
