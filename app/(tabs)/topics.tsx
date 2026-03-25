import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Topic } from '@/lib/database.types';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';

const GAME_MODES = [
  { key: 'picture_quiz', label: '🖼️ Picture Quiz', sub: '5 pics → pick word' },
  { key: 'word_quiz', label: '📝 Word Quiz', sub: '1 pic → pick word' },
  { key: 'listen_pick', label: '🔊 Listen & Pick', sub: 'Hear word → pick it' },
] as const;

export default function TopicsScreen() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { profile } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    fetchTopics();
  }, []);

  async function fetchTopics() {
    const { data } = await supabase.from('topics').select('*').order('difficulty_tier');
    setTopics(data ?? []);
    setLoading(false);
  }

  function handleModeSelect(topicId: string, mode: string) {
    router.push({ pathname: '/game/[topicId]', params: { topicId, mode } });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Topics</Text>
      <Text style={styles.subtitle}>Pick a topic and a game mode</Text>

      <FlatList
        data={topics}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const locked = item.is_premium && !profile?.is_premium;
          const isOpen = expanded === item.id;

          return (
            <View style={styles.topicCard}>
              <TouchableOpacity
                style={styles.topicRow}
                onPress={() => !locked && setExpanded(isOpen ? null : item.id)}
                disabled={locked}
              >
                <View style={styles.topicMeta}>
                  <Text style={styles.topicName}>{item.name}</Text>
                  <Text style={styles.topicTier}>{tierLabel(item.difficulty_tier)}</Text>
                </View>
                {locked ? (
                  <Text style={styles.lock}>🔒</Text>
                ) : (
                  <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
                )}
              </TouchableOpacity>

              {isOpen && (
                <View style={styles.modes}>
                  {GAME_MODES.map((mode) => (
                    <TouchableOpacity
                      key={mode.key}
                      style={styles.modeBtn}
                      onPress={() => handleModeSelect(item.id, mode.key)}
                    >
                      <Text style={styles.modeLabel}>{mode.label}</Text>
                      <Text style={styles.modeSub}>{mode.sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

function tierLabel(tier: string) {
  const map: Record<string, string> = {
    beginner: '🌱 Beginner',
    elementary: '📗 Elementary',
    'pre-intermediate': '📘 Pre-Int',
    intermediate: '📙 Intermediate',
  };
  return map[tier] ?? tier;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  subtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    paddingHorizontal: 24,
    marginTop: 4,
    marginBottom: 16,
  },
  list: { paddingHorizontal: 24, gap: 12, paddingBottom: 40 },
  topicCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  topicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
  },
  topicMeta: { gap: 2 },
  topicName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  topicTier: { fontSize: FontSize.sm, color: Colors.textSecondary },
  lock: { fontSize: FontSize.lg },
  chevron: { fontSize: FontSize.sm, color: Colors.textMuted },
  modes: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: 12,
    gap: 8,
  },
  modeBtn: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.text },
  modeSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
});
