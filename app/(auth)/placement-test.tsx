import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import type { DifficultyTier } from '@/lib/database.types';

interface WordBank {
  id: string;
  word: string;
  image_url: string | null;
  topic_id: string;
  difficulty_score: number;
}

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
const START_DIFFICULTY = 3; // mid-point of 1–5

function scoreToLevel(score: number): DifficultyTier {
  const pct = score / TOTAL_QUESTIONS;
  if (pct >= 0.8) return 'intermediate';
  if (pct >= 0.6) return 'pre-intermediate';
  if (pct >= 0.4) return 'elementary';
  return 'beginner';
}

/** Pick one unused word at the target difficulty, expanding outward if the tier is exhausted. */
function pickWord(
  bank: WordBank[],
  usedIds: Set<string>,
  targetDiff: number,
): WordBank | null {
  for (let delta = 0; delta <= 4; delta++) {
    const candidates = bank.filter(
      (w) =>
        !usedIds.has(w.id) &&
        (w.difficulty_score === targetDiff + delta ||
          w.difficulty_score === targetDiff - delta),
    );
    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
  }
  return null; // bank exhausted
}

/** Build a single question around a chosen word. */
function buildQuestion(
  word: WordBank,
  bank: WordBank[],
  usedImageUrls: Set<string>,
): PlacementQuestion {
  const sameTopic = bank
    .filter((w) => w.id !== word.id && w.topic_id === word.topic_id)
    .sort(() => Math.random() - 0.5);
  const otherTopic = bank
    .filter((w) => w.id !== word.id && w.topic_id !== word.topic_id)
    .sort(() => Math.random() - 0.5);
  const distractors = [...sameTopic, ...otherTopic].slice(0, 3);
  const options = [word.word, ...distractors.map((w) => w.word)].sort(
    () => Math.random() - 0.5,
  );

  let imageUrl: string | null = word.image_url;
  if (imageUrl && usedImageUrls.has(imageUrl)) imageUrl = null;
  if (imageUrl) usedImageUrls.add(imageUrl);

  return {
    id: word.id,
    word: word.word,
    image_url: imageUrl,
    options,
    correct: word.word,
    mode: imageUrl ? 'picture_quiz' : 'word_quiz',
    difficulty_score: word.difficulty_score,
  };
}

export default function PlacementTestScreen() {
  const [bank, setBank] = useState<WordBank[]>([]);
  const [questions, setQuestions] = useState<PlacementQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState(START_DIFFICULTY);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Mutable refs so callbacks always see the latest values without stale closures
  const usedWordIds = useRef(new Set<string>());
  const usedImageUrls = useRef(new Set<string>());
  const difficultyRef = useRef(START_DIFFICULTY);
  const scoreRef = useRef(0);

  const { session, fetchProfile } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    loadBank();
  }, []);

  async function loadBank() {
    const { data: words, error } = await supabase
      .from('words')
      .select('id, word, image_url, topic_id, difficulty_score');

    if (error || !words || words.length < TOTAL_QUESTIONS) {
      Alert.alert('Setup needed', 'The word database is not yet seeded. Please try again later.');
      setLoading(false);
      return;
    }

    setBank(words);

    // Generate the first question at start difficulty
    const firstWord = pickWord(words, usedWordIds.current, START_DIFFICULTY);
    if (!firstWord) { setLoading(false); return; }
    usedWordIds.current.add(firstWord.id);
    setQuestions([buildQuestion(firstWord, words, usedImageUrls.current)]);
    setLoading(false);
  }

  function handleSelect(option: string) {
    if (selected || submitting) return;
    setSelected(option);

    const isCorrect = option === questions[currentIndex].correct;

    // Update score ref immediately
    if (isCorrect) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
    }

    // Adaptive difficulty: +1 on correct, -1 on wrong, clamped 1–5
    const nextDiff = Math.min(5, Math.max(1, difficultyRef.current + (isCorrect ? 1 : -1)));
    difficultyRef.current = nextDiff;
    setDifficulty(nextDiff);

    setTimeout(() => {
      const nextIndex = currentIndex + 1;

      if (nextIndex >= TOTAL_QUESTIONS) {
        finishTest(scoreRef.current);
        return;
      }

      // Generate the next question at the updated difficulty
      const nextWord = pickWord(bank, usedWordIds.current, nextDiff);
      if (nextWord) {
        usedWordIds.current.add(nextWord.id);
        setQuestions((prev) => [...prev, buildQuestion(nextWord, bank, usedImageUrls.current)]);
      }

      setCurrentIndex(nextIndex);
      setSelected(null);
    }, 900);
  }

  async function finishTest(finalScore: number) {
    setSubmitting(true);
    const level = scoreToLevel(finalScore);
    // Map difficulty tier → starting conversation level
    const convoLevel = level === 'pre-intermediate' || level === 'intermediate' ? 3
      : level === 'elementary' ? 2
      : 1;

    try {
      if (session?.user.id) {
        const { error } = await supabase
          .from('user_profiles')
          .update({ placement_score: finalScore, starting_level: level, convo_level: convoLevel })
          .eq('id', session.user.id);

        if (error) {
          console.warn('Could not save placement score:', error.message);
          router.replace('/(tabs)/');
        } else {
          // fetchProfile triggers _layout routing: → onboarding (new) or → tabs (retake)
          await fetchProfile(session.user.id);
        }
      } else {
        router.replace('/(tabs)/');
      }
    } catch (e) {
      console.warn('finishTest error:', e);
      router.replace('/(tabs)/');
    } finally {
      setSubmitting(false);
    }
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
  if (!current) return null;

  const progress = (currentIndex / TOTAL_QUESTIONS) * 100;

  // Difficulty indicator dots
  const diffDots = [1, 2, 3, 4, 5].map((d) => (
    <View
      key={d}
      style={[
        styles.diffDot,
        d <= difficulty && styles.diffDotActive,
      ]}
    />
  ));

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

      {/* Adaptive difficulty indicator */}
      <View style={styles.diffRow}>
        <Text style={styles.diffLabel}>Difficulty</Text>
        <View style={styles.diffDots}>{diffDots}</View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
            if (isSelected && isCorrect)  { bg = Colors.successLight; border = Colors.success; }
            if (isSelected && !isCorrect) { bg = Colors.errorLight;   border = Colors.error; }
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
      </ScrollView>

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
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40, gap: 0 },
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
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  diffLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  diffDots: { flexDirection: 'row', gap: 4 },
  diffDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.border,
  },
  diffDotActive: { backgroundColor: Colors.primary },
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
  options: { gap: 12 },
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
