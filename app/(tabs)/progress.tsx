import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useProgressStore } from '@/store/progress.store';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';

const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  elementary: 'Elementary',
  'pre-intermediate': 'Pre-Intermediate',
  intermediate: 'Intermediate',
};

export default function ProgressScreen() {
  const { profile } = useAuthStore();
  const { lessonHistory, aiSuggestion, fetchLessonHistory, fetchAiSuggestion, dismissSuggestion } =
    useProgressStore();

  useEffect(() => {
    if (profile?.id) {
      fetchLessonHistory(profile.id);
      fetchAiSuggestion(profile.id);
    }
  }, [profile?.id]);

  if (!profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const totalWords = lessonHistory.reduce((sum, l) => sum + l.total_questions, 0);
  const totalCorrect = lessonHistory.reduce((sum, l) => sum + l.score, 0);
  const accuracy = totalWords > 0 ? Math.round((totalCorrect / totalWords) * 100) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your Progress</Text>

      {/* Level badge */}
      <View style={styles.levelCard}>
        <Text style={styles.levelEmoji}>🎓</Text>
        <View>
          <Text style={styles.levelLabel}>{LEVEL_LABELS[profile.starting_level] ?? profile.starting_level}</Text>
          <Text style={styles.levelSub}>Current level</Text>
        </View>
        <View style={styles.xpPill}>
          <Text style={styles.xpText}>⭐ {profile.xp} XP</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatCard label="🔥 Streak" value={`${profile.streak_days}d`} />
        <StatCard label="📚 Sessions" value={String(lessonHistory.length)} />
        <StatCard label="🎯 Accuracy" value={`${accuracy}%`} />
      </View>

      {/* AI Suggestion */}
      {aiSuggestion && (
        <View style={styles.suggestionCard}>
          <Text style={styles.suggestionTitle}>✨ AI Recommendation</Text>
          <Text style={styles.suggestionText}>{aiSuggestion.suggestion_text}</Text>
          <TouchableOpacity onPress={() => dismissSuggestion(aiSuggestion.id)}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recent lessons */}
      <Text style={styles.sectionTitle}>Recent Sessions</Text>
      {lessonHistory.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No sessions yet — start playing to see your history!</Text>
        </View>
      ) : (
        <View style={styles.historyList}>
          {lessonHistory.slice(0, 10).map((lesson) => {
            const pct = Math.round((lesson.score / lesson.total_questions) * 100);
            return (
              <View key={lesson.id} style={styles.historyItem}>
                <View style={styles.historyMeta}>
                  <Text style={styles.historyMode}>{modeLabel(lesson.mode)}</Text>
                  <Text style={styles.historyDate}>
                    {new Date(lesson.completed_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={[styles.historyScore, pct >= 80 && { color: Colors.success }]}>
                  {lesson.score}/{lesson.total_questions} ({pct}%)
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function modeLabel(mode: string) {
  const map: Record<string, string> = {
    picture_quiz: '🖼️ Picture Quiz',
    word_quiz: '📝 Word Quiz',
    listen_pick: '🔊 Listen & Pick',
  };
  return map[mode] ?? mode;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40, gap: 20 },
  center: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold, color: Colors.text },
  levelCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  levelEmoji: { fontSize: 32 },
  levelLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  levelSub: { fontSize: FontSize.sm, color: Colors.textSecondary },
  xpPill: {
    marginLeft: 'auto',
    backgroundColor: Colors.xp + '33',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  xpText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primaryDark },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 4,
  },
  statValue: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.text },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center' },
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
  sectionTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  emptyText: { fontSize: FontSize.base, color: Colors.textSecondary, textAlign: 'center' },
  historyList: { gap: 10 },
  historyItem: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  historyMeta: { gap: 2 },
  historyMode: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.text },
  historyDate: { fontSize: FontSize.xs, color: Colors.textMuted },
  historyScore: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.textSecondary },
});
