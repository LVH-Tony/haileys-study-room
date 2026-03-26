import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Topic, DifficultyTier } from '@/lib/database.types';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';

const GAME_MODES = [
  { key: 'picture_quiz', label: '🖼️ Picture Quiz', sub: '5 pics → pick word' },
  { key: 'word_quiz',    label: '📝 Word Quiz',    sub: '1 pic → pick word' },
  { key: 'listen_pick',  label: '🔊 Listen & Pick', sub: 'Hear word → pick it' },
] as const;

const TIERS: DifficultyTier[] = ['beginner', 'elementary', 'pre-intermediate', 'intermediate'];

const TIER_META: Record<DifficultyTier, { label: string; color: string; bg: string; unlock: string }> = {
  beginner:          { label: '🌱 Beginner',        color: '#2E7D32', bg: '#E8F5E9', unlock: '' },
  elementary:        { label: '📗 Elementary',       color: '#1565C0', bg: '#E3F2FD', unlock: '' },
  'pre-intermediate':{ label: '📘 Pre-Intermediate', color: '#E65100', bg: '#FFF3E0', unlock: 'Complete Elementary topics to unlock' },
  intermediate:      { label: '📙 Intermediate',     color: '#6A1B9A', bg: '#F3E5F5', unlock: 'Complete Pre-Intermediate topics to unlock' },
};

const TIER_ORDER: Record<DifficultyTier, number> = {
  beginner: 0, elementary: 1, 'pre-intermediate': 2, intermediate: 3,
};

interface TopicGroup { base: Topic; expert?: Topic; }
interface TierSection { tier: DifficultyTier; groups: TopicGroup[]; }

function buildSections(topics: Topic[]): TierSection[] {
  const expertMap = new Map<string, Topic>();
  const baseList: Topic[] = [];
  for (const t of topics) {
    if (t.name.includes('— Expert')) {
      expertMap.set(t.name.replace(' — Expert', ''), t);
    } else {
      baseList.push(t);
    }
  }
  const groups = baseList.map((base) => ({ base, expert: expertMap.get(base.name) }));
  return TIERS.map((tier) => ({
    tier,
    groups: groups
      .filter((g) => g.base.difficulty_tier === tier)
      .sort((a, b) => a.base.name.localeCompare(b.base.name)),
  })).filter((s) => s.groups.length > 0);
}

// A user can freely play topics at their tier or one tier below/above
// Beginner → accesses beginner + elementary; each level unlocks the next tier
function maxAccessTier(level: DifficultyTier): number {
  if (level === 'beginner') return 1;  // beginner can also play elementary
  return TIER_ORDER[level] + 1;        // each tier up unlocks next
}

function isTierAccessible(tier: DifficultyTier, userLevel: DifficultyTier): boolean {
  return TIER_ORDER[tier] <= Math.min(maxAccessTier(userLevel), 3);
}

export default function TopicsScreen() {
  const [topics, setTopics]   = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { profile } = useAuthStore();
  const router = useRouter();

  const userLevel: DifficultyTier = (profile?.starting_level as DifficultyTier) ?? 'beginner';

  useEffect(() => { fetchTopics(); }, []);

  async function fetchTopics() {
    const { data } = await supabase.from('topics').select('*').order('name');
    setTopics(data ?? []);
    setLoading(false);
  }

  function toggleExpand(id: string, locked: boolean) {
    if (locked) {
      Alert.alert('Locked', 'Level up to unlock this topic!');
      return;
    }
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
      <View style={s.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const sections = buildSections(topics);

  return (
    <View style={s.container}>
      <Text style={s.title}>Topics</Text>
      <Text style={s.subtitle}>
        Your level: <Text style={{ color: TIER_META[userLevel].color, fontWeight: FontWeight.bold }}>{TIER_META[userLevel].label}</Text>
      </Text>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {sections.map((section) => {
          const meta   = TIER_META[section.tier];
          const locked = !isTierAccessible(section.tier, userLevel);

          return (
            <View key={section.tier} style={s.section}>
              {/* Tier section header */}
              <View style={[s.sectionHeader, { backgroundColor: meta.bg, borderLeftColor: meta.color }]}>
                <Text style={[s.sectionTitle, { color: meta.color }]}>{meta.label}</Text>
                {locked
                  ? <View style={[s.lockBadge, { borderColor: meta.color + '66' }]}>
                      <Ionicons name="lock-closed" size={11} color={meta.color} />
                      <Text style={[s.lockBadgeText, { color: meta.color }]}>Locked</Text>
                    </View>
                  : <Text style={[s.countBadge, { color: meta.color }]}>{section.groups.length} topics</Text>
                }
              </View>

              {/* Hint when locked */}
              {locked && (
                <View style={[s.lockedHint, { borderColor: meta.color + '33' }]}>
                  <Ionicons name="information-circle-outline" size={14} color={meta.color} />
                  <Text style={[s.lockedHintText, { color: meta.color }]}>{meta.unlock}</Text>
                </View>
              )}

              {/* Topic cards */}
              <View style={[s.tierList, locked && s.tierListLocked]}>
                {section.groups.map((group) => {
                  const expertLocked = group.expert
                    ? !isTierAccessible(group.expert.difficulty_tier as DifficultyTier, userLevel)
                    : false;

                  return (
                    <View key={group.base.id} style={s.groupWrapper}>
                      {/* Base topic card */}
                      <TopicCard
                        topic={group.base}
                        expanded={expanded}
                        locked={locked}
                        tierColor={meta.color}
                        onToggle={toggleExpand}
                        onGame={goGame}
                        onFlashcard={goFlashcard}
                      />

                      {/* Expert variant (nested, gold border) */}
                      {group.expert && (
                        <View style={s.expertWrapper}>
                          <View style={s.expertConnector} />
                          <View style={s.expertCardOuter}>
                            <TopicCard
                              topic={group.expert}
                              expanded={expanded}
                              locked={locked || expertLocked}
                              tierColor="#B8860B"
                              isExpert
                              onToggle={toggleExpand}
                              onGame={goGame}
                              onFlashcard={goFlashcard}
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Single Topic Card ──────────────────────────────────────────────────────────

function TopicCard({
  topic, expanded, locked, tierColor, isExpert,
  onToggle, onGame, onFlashcard,
}: {
  topic: Topic; expanded: string | null; locked: boolean; tierColor: string;
  isExpert?: boolean;
  onToggle: (id: string, locked: boolean) => void;
  onGame: (topicId: string, mode: string) => void;
  onFlashcard: (topicId: string) => void;
}) {
  const isOpen = expanded === topic.id;
  const displayName = isExpert ? topic.name.replace(' — Expert', '') : topic.name;

  return (
    <View style={[
      s.topicCard,
      isExpert && s.topicCardExpert,
      locked && s.topicCardLocked,
      { borderColor: locked ? '#DDD' : isExpert ? '#D4AF37' : tierColor + '44' },
    ]}>
      <TouchableOpacity
        style={s.topicRow}
        onPress={() => onToggle(topic.id, locked)}
        activeOpacity={locked ? 0.5 : 0.7}
      >
        <View style={s.topicMeta}>
          {isExpert && (
            <View style={s.expertTag}>
              <Ionicons name="star" size={10} color="#B8860B" />
              <Text style={s.expertTagText}>Expert</Text>
            </View>
          )}
          <Text style={[s.topicName, locked && s.topicNameLocked]}>{displayName}</Text>
        </View>

        {locked
          ? <Ionicons name="lock-closed" size={18} color="#BBB" />
          : <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={tierColor} />
        }
      </TouchableOpacity>

      {isOpen && !locked && (
        <ModesPanel topicId={topic.id} tierColor={tierColor} onGame={onGame} onFlashcard={onFlashcard} />
      )}
    </View>
  );
}

// ── Modes Panel ───────────────────────────────────────────────────────────────

function ModesPanel({
  topicId, tierColor, onGame, onFlashcard,
}: {
  topicId: string; tierColor: string;
  onGame: (id: string, mode: string) => void;
  onFlashcard: (id: string) => void;
}) {
  return (
    <View style={[s.modes, { borderTopColor: tierColor + '33' }]}>
      <TouchableOpacity
        style={[s.modeBtn, { borderColor: tierColor + '55', backgroundColor: tierColor + '08' }]}
        onPress={() => onFlashcard(topicId)}
      >
        <Text style={s.modeLabel}>🃏 Flashcards</Text>
        <Text style={s.modeSub}>Swipe to learn words</Text>
      </TouchableOpacity>
      {GAME_MODES.map((mode) => (
        <TouchableOpacity
          key={mode.key}
          style={s.modeBtn}
          onPress={() => onGame(topicId, mode.key)}
        >
          <Text style={s.modeLabel}>{mode.label}</Text>
          <Text style={s.modeSub}>{mode.sub}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center:    { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },

  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 16,
  },

  scroll: { paddingHorizontal: 20, gap: 24, paddingBottom: 20 },

  // ── Tier Section ──────────────────────────────────────────────────────────
  section: { gap: 8 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lockBadgeText: { fontSize: 11, fontWeight: FontWeight.semibold },

  countBadge: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },

  lockedHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  lockedHintText: { fontSize: FontSize.xs, flex: 1 },

  tierList:       { gap: 6 },
  tierListLocked: { opacity: 0.55 },

  // ── Topic Group ───────────────────────────────────────────────────────────
  groupWrapper: { gap: 0 },

  expertWrapper: { flexDirection: 'row', marginTop: 2 },
  expertConnector: {
    width: 18,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#D4AF37',
    borderBottomLeftRadius: 8,
    marginLeft: 18,
    marginBottom: 12,
  },
  expertCardOuter: { flex: 1 },

  // ── Topic Card ────────────────────────────────────────────────────────────
  topicCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  topicCardExpert: {
    backgroundColor: '#FFFDF0',
  },
  topicCardLocked: {
    backgroundColor: Colors.background,
  },

  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  topicMeta: { flex: 1, gap: 2 },
  topicName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.text },
  topicNameLocked: { color: Colors.textMuted },

  expertTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 1,
  },
  expertTagText: { fontSize: 10, fontWeight: FontWeight.bold, color: '#B8860B' },

  // ── Modes Panel ───────────────────────────────────────────────────────────
  modes: {
    borderTopWidth: 1,
    padding: 12,
    gap: 8,
  },
  modeBtn: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },
  modeSub:   { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 1 },
});
