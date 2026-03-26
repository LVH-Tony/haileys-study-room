import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/store/auth.store';
import { useProgressStore } from '@/store/progress.store';
import type { ActivityItem } from '@/store/progress.store';
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
  const { lessonHistory, recentActivity, aiSuggestion, fetchLessonHistory, fetchAiSuggestion, dismissSuggestion } =
    useProgressStore();

  const profileId = profile?.id;
  useFocusEffect(
    useCallback(() => {
      if (profileId) {
        fetchLessonHistory(profileId);
        fetchAiSuggestion(profileId);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profileId, fetchLessonHistory, fetchAiSuggestion])
  );

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
  const totalSessions = recentActivity.length;
  const convoSessions = recentActivity.filter((a) => a.type === 'conversation').length;

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
        <StatCard label="📚 Sessions" value={String(totalSessions)} />
        <StatCard label="🎙️ Speaking" value={String(convoSessions)} />
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

      {/* Recent sessions — games + speaking combined */}
      <Text style={styles.sectionTitle}>Recent Sessions</Text>
      {recentActivity.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No sessions yet — start playing or speaking to see your history!</Text>
        </View>
      ) : (
        <View style={styles.historyList}>
          {recentActivity.slice(0, 20).map((item) => {
            const pct = item.total > 0 ? Math.round((item.score / item.total) * 100) : 0;
            return (
              <View key={item.id} style={[styles.historyItem, item.type === 'conversation' && styles.historyItemConvo]}>
                <View style={styles.historyMeta}>
                  <Text style={styles.historyMode} numberOfLines={2}>{item.label}</Text>
                  <View style={styles.historyBottom}>
                    <Text style={styles.historyDate}>
                      {new Date(item.completed_at).toLocaleDateString()}
                    </Text>
                    <Text style={[styles.historyScore, pct >= 80 && { color: Colors.success }]}>
                      {item.score}/{item.total} · {pct}%
                    </Text>
                  </View>
                </View>
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
  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statCard: {
    flex: 1,
    minWidth: '20%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 12,
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
    borderWidth: 1,
    borderColor: Colors.border,
  },
  historyItemConvo: {
    borderColor: '#9C27B0' + '55',
    backgroundColor: '#F3E5F5' + '88',
  },
  historyMeta: { gap: 4, flex: 1 },
  historyMode: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },
  historyBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  historyDate: { fontSize: FontSize.xs, color: Colors.textMuted },
  historyScore: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary },
});
