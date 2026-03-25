import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import type { DifficultyTier } from '@/lib/database.types';

interface PlacementQuestion {
  id: string;
  word: string;
  image_url: string | null;
  options: string[];
  correct: string;
  mode: 'picture_quiz' | 'word_quiz';
  difficulty_score: number;
}

const TOTAL_QUESTIONS = 10;

function scoreToLevel(score: number): DifficultyTier {
  const pct = score / TOTAL_QUESTIONS;
  if (pct >= 0.8) return 'intermediate';
  if (pct >= 0.6) return 'pre-intermediate';
  if (pct >= 0.4) return 'elementary';
  return 'beginner';
}

export default function PlacementTestScreen() {
  const [questions, setQuestions] = useState<PlacementQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { session, fetchProfile } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    loadQuestions();
  }, []);

  async function loadQuestions() {
    // Fetch words across difficulty scores to build a placement test
    const { data: words, error } = await supabase
      .from('words')
      .select('id, word, image_url, topic_id, difficulty_score')
      .order('difficulty_score', { ascending: true })
      .limit(40);

    if (error || !words || words.length < TOTAL_QUESTIONS) {
      Alert.alert('Setup needed', 'The word database is not yet seeded. Please try again later.');
      setLoading(false);
      return;
    }

    // Spread across difficulty: pick ~2-3 from each tier
    const byDifficulty = [1, 2, 3, 4, 5].map((d) => words.filter((w) => w.difficulty_score === d));
    const selected: typeof words = [];
    for (let di = 0; di < 5 && selected.length < TOTAL_QUESTIONS; di++) {
      const pool = byDifficulty[di];
      const pick = pool.slice(0, Math.min(2, TOTAL_QUESTIONS - selected.length));
      selected.push(...pick);
    }
    // Pad if needed
    if (selected.length < TOTAL_QUESTIONS) {
      const extra = words.filter((w) => !selected.includes(w)).slice(0, TOTAL_QUESTIONS - selected.length);
      selected.push(...extra);
    }

    const built: PlacementQuestion[] = selected.map((word) => {
      const otherWords = words.filter((w) => w.id !== word.id);
      const shuffled = otherWords.sort(() => Math.random() - 0.5).slice(0, 3);
      const options = [word.word, ...shuffled.map((w) => w.word)].sort(() => Math.random() - 0.5);
      return {
        id: word.id,
        word: word.word,
        image_url: word.image_url,
        options,
        correct: word.word,
        mode: word.image_url ? 'picture_quiz' : 'word_quiz',
        difficulty_score: word.difficulty_score,
      };
    });

    setQuestions(built);
    setLoading(false);
  }

  function handleSelect(option: string) {
    if (selected) return;
    setSelected(option);
    const isCorrect = option === questions[currentIndex].correct;
    if (isCorrect) setScore((s) => s + 1);

    setTimeout(() => {
      if (currentIndex + 1 < TOTAL_QUESTIONS) {
        setCurrentIndex((i) => i + 1);
        setSelected(null);
      } else {
        finishTest(isCorrect ? score + 1 : score);
      }
    }, 900);
  }

  async function finishTest(finalScore: number) {
    if (!session) return;
    setSubmitting(true);
    const level = scoreToLevel(finalScore);

    await supabase
      .from('user_profiles')
      .update({ placement_score: finalScore, starting_level: level })
      .eq('id', session.user.id);

    await fetchProfile(session.user.id);
    setSubmitting(false);
    router.replace('/(tabs)/');
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading placement test…</Text>
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No questions available yet. Check back soon!</Text>
      </View>
    );
  }

  const current = questions[currentIndex];
  const progress = (currentIndex / TOTAL_QUESTIONS) * 100;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Placement Test</Text>
        <Text style={styles.counter}>{currentIndex + 1} / {TOTAL_QUESTIONS}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <Text style={styles.instruction}>
        {current.mode === 'picture_quiz' ? 'What word matches this picture?' : 'Pick the correct word'}
      </Text>

      {current.image_url && (
        <Image
          source={{ uri: current.image_url }}
          style={styles.image}
          contentFit="cover"
        />
      )}

      {current.mode !== 'picture_quiz' && (
        <Text style={styles.wordDisplay}>{current.word}</Text>
      )}

      <View style={styles.options}>
        {current.options.map((option) => {
          const isSelected = selected === option;
          const isCorrect = option === current.correct;
          let bg = Colors.surface;
          let border = Colors.border;
          if (isSelected && isCorrect) { bg = Colors.successLight; border = Colors.success; }
          if (isSelected && !isCorrect) { bg = Colors.errorLight; border = Colors.error; }
          if (selected && !isSelected && isCorrect) { bg = Colors.successLight; border = Colors.success; }

          return (
            <TouchableOpacity
              key={option}
              style={[styles.option, { backgroundColor: bg, borderColor: border }]}
              onPress={() => handleSelect(option)}
              disabled={!!selected}
            >
              <Text style={styles.optionText}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {submitting && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Calculating your level…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  center: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLabel: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  counter: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 32,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  instruction: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    marginBottom: 24,
    backgroundColor: Colors.surfaceAlt,
  },
  wordDisplay: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 28,
  },
  options: {
    gap: 12,
  },
  option: {
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  optionText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  loadingText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginTop: 12,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245,236,215,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
});
