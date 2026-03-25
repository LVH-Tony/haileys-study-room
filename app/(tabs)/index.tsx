import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/auth.store';
import { useProgressStore } from '@/store/progress.store';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';

export default function HomeScreen() {
  const { profile, signOut } = useAuthStore();
  const { aiSuggestion, fetchAiSuggestion, dismissSuggestion } = useProgressStore();
  const router = useRouter();

  useEffect(() => {
    if (profile?.id) fetchAiSuggestion(profile.id);
  }, [profile?.id]);

  if (!profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Greeting */}
      <View style={styles.greetingRow}>
        <View>
          <Text style={styles.greeting}>Hello, {profile.display_name}! 👋</Text>
          <Text style={styles.level}>{levelLabel(profile.starting_level)}</Text>
        </View>
        <View style={styles.xpBadge}>
          <Text style={styles.xpText}>⭐ {profile.xp} XP</Text>
        </View>
      </View>

      {/* Streak */}
      <View style={styles.streakCard}>
        <Text style={styles.streakEmoji}>🔥</Text>
        <View>
          <Text style={styles.streakCount}>{profile.streak_days} day streak</Text>
          <Text style={styles.streakSub}>Keep it up — practice every day!</Text>
        </View>
      </View>

      {/* AI Suggestion */}
      {aiSuggestion && (
        <View style={styles.suggestionCard}>
          <Text style={styles.suggestionTitle}>✨ Next up for you</Text>
          <Text style={styles.suggestionText}>{aiSuggestion.suggestion_text}</Text>
          <TouchableOpacity onPress={() => dismissSuggestion(aiSuggestion.id)}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>What do you want to do?</Text>
      <View style={styles.actions}>
        <ActionCard
          emoji="🎮"
          label="Play a game"
          sub="Test your vocabulary"
          onPress={() => router.push('/(tabs)/topics')}
        />
        <ActionCard
          emoji="🎙️"
          label="Practice speaking"
          sub="Conversation with AI"
          onPress={() => router.push('/(tabs)/conversation')}
        />
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ActionCard({
  emoji,
  label,
  sub,
  onPress,
}: {
  emoji: string;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress}>
      <Text style={styles.actionEmoji}>{emoji}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

function levelLabel(level: string) {
  const map: Record<string, string> = {
    beginner: '🌱 Beginner',
    elementary: '📗 Elementary',
    'pre-intermediate': '📘 Pre-Intermediate',
    intermediate: '📙 Intermediate',
  };
  return map[level] ?? level;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40, gap: 20 },
  center: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
  },
  level: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  xpBadge: {
    backgroundColor: Colors.xp + '33',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  xpText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primaryDark,
  },
  streakCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  streakEmoji: { fontSize: 32 },
  streakCount: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  streakSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  suggestionCard: {
    backgroundColor: Colors.primaryLight + '22',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: Colors.primaryLight,
    gap: 8,
  },
  suggestionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.primaryDark },
  suggestionText: { fontSize: FontSize.base, color: Colors.text, lineHeight: 22 },
  dismissText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'right' },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  actions: { flexDirection: 'row', gap: 14 },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 6,
  },
  actionEmoji: { fontSize: 28 },
  actionLabel: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text },
  actionSub: { fontSize: FontSize.sm, color: Colors.textSecondary },
  signOutBtn: { alignItems: 'center', marginTop: 12 },
  signOutText: { fontSize: FontSize.sm, color: Colors.textMuted },
});
