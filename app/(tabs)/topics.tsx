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
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Topic } from '@/lib/database.types';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';

const GAME_MODES = [
  { key: 'picture_quiz', label: '🖼️ Picture Quiz', sub: '5 pics → pick word' },
  { key: 'word_quiz',    label: '📝 Word Quiz',    sub: '1 pic → pick word' },
  { key: 'listen_pick',  label: '🔊 Listen & Pick', sub: 'Hear word → pick it' },
] as const;

interface TopicGroup {
  base: Topic;
  expert?: Topic;
}

function groupTopics(topics: Topic[]): TopicGroup[] {
  const expertMap = new Map<string, Topic>();
  const baseList: Topic[] = [];

  for (const t of topics) {
    if (t.name.includes('— Expert')) {
      expertMap.set(t.name.replace(' — Expert', ''), t);
    } else {
      baseList.push(t);
    }
  }

  return baseList.map((base) => ({ base, expert: expertMap.get(base.name) }));
}

export default function TopicsScreen() {
  const [topics, setTopics]   = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { profile } = useAuthStore();
  const router = useRouter();

  useEffect(() => { fetchTopics(); }, []);

  async function fetchTopics() {
    const { data } = await supabase.from('topics').select('*').order('name');
    setTopics(data ?? []);
    setLoading(false);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  function goGame(topicId: string, mode: string) {
    router.push({ pathname: '/game/[topicId]', params: { topicId, mode } });
  }

  function goFlashcard(topicId: string) {
    router.push({ pathname: '/flashcard/[topicId]', params: { topicId } });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const groups = groupTopics(topics);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Topics</Text>
      <Text style={styles.subtitle}>Pick a topic and game mode</Text>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.base.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: group }) => (
          <TopicGroupCard
            group={group}
            expanded={expanded}
            onToggle={toggleExpand}
            onGame={goGame}
            onFlashcard={goFlashcard}
          />
        )}
      />
    </View>
  );
}

// ── Topic Group Card ───────────────────────────────────────────────────────────

function TopicGroupCard({
  group,
  expanded,
  onToggle,
  onGame,
  onFlashcard,
}: {
  group: TopicGroup;
  expanded: string | null;
  onToggle: (id: string) => void;
  onGame: (topicId: string, mode: string) => void;
  onFlashcard: (topicId: string) => void;
}) {
  const { base, expert } = group;
  const baseOpen   = expanded === base.id;
  const expertOpen = expert && expanded === expert.id;

  return (
    <View style={styles.groupWrapper}>
      {/* ── Base topic ── */}
      <View style={styles.topicCard}>
        <TouchableOpacity style={styles.topicRow} onPress={() => onToggle(base.id)}>
          <View style={styles.topicMeta}>
            <Text style={styles.topicName}>{base.name}</Text>
            <Text style={styles.topicTier}>{tierLabel(base.difficulty_tier)}</Text>
          </View>
          <View style={styles.topicRowRight}>
            {expert && (
              <View style={styles.expertChip}>
                <Ionicons name="star" size={10} color="#B8860B" />
                <Text style={styles.expertChipText}>Expert</Text>
              </View>
            )}
            <Text style={styles.chevron}>{baseOpen ? '▲' : '▼'}</Text>
          </View>
        </TouchableOpacity>

        {baseOpen && (
          <ModesPanel topicId={base.id} onGame={onGame} onFlashcard={onFlashcard} />
        )}
      </View>

      {/* ── Expert variant (indented, gold accent) ── */}
      {expert && (
        <View style={styles.expertCard}>
          <TouchableOpacity style={styles.topicRow} onPress={() => onToggle(expert.id)}>
            <View style={styles.topicMeta}>
              <View style={styles.expertNameRow}>
                <Ionicons name="star" size={14} color="#B8860B" />
                <Text style={styles.expertTopicName}>{base.name} — Expert</Text>
              </View>
              <Text style={styles.topicTier}>{tierLabel(expert.difficulty_tier)}</Text>
            </View>
            <Text style={styles.chevron}>{expertOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {expertOpen && (
            <ModesPanel topicId={expert.id} onGame={onGame} onFlashcard={onFlashcard} />
          )}
        </View>
      )}
    </View>
  );
}

// ── Modes panel (shared by base and expert) ────────────────────────────────────

function ModesPanel({
  topicId,
  onGame,
  onFlashcard,
}: {
  topicId: string;
  onGame: (id: string, mode: string) => void;
  onFlashcard: (id: string) => void;
}) {
  return (
    <View style={styles.modes}>
      <TouchableOpacity
        style={[styles.modeBtn, styles.flashcardBtn]}
        onPress={() => onFlashcard(topicId)}
      >
        <Text style={styles.modeLabel}>🃏 Flashcards</Text>
        <Text style={styles.modeSub}>Swipe to learn words</Text>
      </TouchableOpacity>
      {GAME_MODES.map((mode) => (
        <TouchableOpacity
          key={mode.key}
          style={styles.modeBtn}
          onPress={() => onGame(topicId, mode.key)}
        >
          <Text style={styles.modeLabel}>{mode.label}</Text>
          <Text style={styles.modeSub}>{mode.sub}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function tierLabel(tier: string) {
  const map: Record<string, string> = {
    beginner:          '🌱 Beginner',
    elementary:        '📗 Elementary',
    'pre-intermediate':'📘 Pre-Int',
    intermediate:      '📙 Intermediate',
  };
  return map[tier] ?? tier;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.background },
  center:     { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },

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

  list: { paddingHorizontal: 24, gap: 14, paddingBottom: 40 },

  // Group wrapper — base + expert sit visually connected
  groupWrapper: { gap: 3 },

  // Base topic card
  topicCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
  },

  // Expert card — indented + gold border
  expertCard: {
    backgroundColor: '#FFFDF0',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D4AF37',
    overflow: 'hidden',
    marginLeft: 12,
  },

  topicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
  },
  topicRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topicMeta:     { gap: 3, flex: 1 },

  topicName:  { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  topicTier:  { fontSize: FontSize.sm, color: Colors.textSecondary },

  expertNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  expertTopicName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: '#7A6000',
  },

  // ⭐ Expert chip shown on base row
  expertChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF8DC',
    borderWidth: 1,
    borderColor: '#D4AF37',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  expertChipText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: '#B8860B',
  },

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
  flashcardBtn: {
    borderWidth: 1.5,
    borderColor: Colors.primary + '50',
    backgroundColor: Colors.primary + '0A',
  },
  modeLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.text },
  modeSub:   { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
});
