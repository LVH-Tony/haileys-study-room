import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Audio } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { nextInterval, nextReviewDate } from '@/lib/spaced-repetition';
import type { Word, GameMode } from '@/lib/database.types';

const ROUND_SIZE = 5;

interface GameQuestion {
  targetWord: Word;
  options: string[];       // for word modes
  imageOptions: Word[];    // for picture_quiz
}

export default function GameScreen() {
  const { topicId, mode } = useLocalSearchParams<{ topicId: string; mode: GameMode }>();
  const router = useRouter();
  const { session, profile } = useAuthStore();

  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    buildQuestions();
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  async function buildQuestions() {
    // Fetch topic words
    const { data: topicWords } = await supabase
      .from('words')
      .select('*')
      .eq('topic_id', topicId)
      .order('difficulty_score');

    // Fetch all words for distractor pool
    const { data: allWords } = await supabase
      .from('words')
      .select('id, word, image_url, topic_id, difficulty_score, audio_url')
      .neq('topic_id', topicId)
      .limit(60);

    if (!topicWords || topicWords.length < ROUND_SIZE) {
      Alert.alert('Not enough words', 'This topic needs at least 5 words to play.');
      router.back();
      return;
    }

    // Prioritise words user has struggled with (spaced repetition)
    const sorted = [...topicWords].sort(() => Math.random() - 0.5).slice(0, ROUND_SIZE);
    const distractorPool: Word[] = (allWords ?? []) as Word[];

    const built: GameQuestion[] = sorted.map((word) => {
      const otherTopicWords = topicWords.filter((w) => w.id !== word.id);
      const distractors = [
        ...otherTopicWords,
        ...distractorPool,
      ]
        .filter((w) => w.word !== word.word)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      const options = [word.word, ...distractors.map((d) => d.word)].sort(() => Math.random() - 0.5);

      const imageOptions = [word as Word, ...distractors.slice(0, 3) as Word[]].sort(
        () => Math.random() - 0.5
      );

      return { targetWord: word as Word, options, imageOptions };
    });

    setQuestions(built);
    setLoading(false);

    // Auto-play word for listen_pick mode
    if (mode === 'listen_pick' && built.length > 0) {
      await playWordAudio(built[0].targetWord);
    }
    // Auto-play for picture_quiz too
    if (mode === 'picture_quiz' && built.length > 0) {
      await playWordAudio(built[0].targetWord);
    }
  }

  async function playWordAudio(word: Word) {
    try {
      soundRef.current?.unloadAsync();
      if (word.audio_url) {
        const { sound } = await Audio.Sound.createAsync({ uri: word.audio_url });
        soundRef.current = sound;
        await sound.playAsync();
      } else {
        // Generate TTS on-the-fly
        const { data } = await supabase.functions.invoke('tts', { body: { text: word.word } });
        if (data?.audioUrl) {
          const { sound } = await Audio.Sound.createAsync({ uri: data.audioUrl });
          soundRef.current = sound;
          await sound.playAsync();
        }
      }
    } catch {
      // Non-fatal
    }
  }

  async function handleSelect(answer: string) {
    if (selected) return;
    setSelected(answer);

    const current = questions[currentIndex];
    const isCorrect = answer === current.targetWord.word;
    if (isCorrect) setScore((s) => s + 1);

    // Update spaced repetition stats
    if (session) {
      await updateWordStat(current.targetWord.id, isCorrect);
    }

    setTimeout(async () => {
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex((i) => i + 1);
        setSelected(null);
        const next = questions[currentIndex + 1];
        if (mode === 'listen_pick' || mode === 'picture_quiz') {
          await playWordAudio(next.targetWord);
        }
      } else {
        await saveSession(isCorrect ? score + 1 : score);
        setDone(true);
      }
    }, 900);
  }

  async function updateWordStat(wordId: string, correct: boolean) {
    if (!session) return;
    const { data: existing } = await supabase
      .from('user_word_stats')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('word_id', wordId)
      .single();

    const interval = nextInterval(existing?.interval_days ?? 1, correct);
    const reviewAt = nextReviewDate(interval);

    if (existing) {
      await supabase.from('user_word_stats').update({
        correct_count: existing.correct_count + (correct ? 1 : 0),
        wrong_count: existing.wrong_count + (correct ? 0 : 1),
        interval_days: interval,
        next_review_at: reviewAt,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('user_word_stats').insert({
        user_id: session.user.id,
        word_id: wordId,
        correct_count: correct ? 1 : 0,
        wrong_count: correct ? 0 : 1,
        interval_days: interval,
        next_review_at: reviewAt,
        updated_at: new Date().toISOString(),
      });
    }
  }

  async function saveSession(finalScore: number) {
    if (!session || !topicId) return;
    await supabase.from('lesson_history').insert({
      user_id: session.user.id,
      topic_id: topicId,
      mode: mode as GameMode,
      score: finalScore,
      total_questions: ROUND_SIZE,
      completed_at: new Date().toISOString(),
    });
    // Award XP (10 per correct answer)
    const xpGain = finalScore * 10;
    await supabase.rpc('increment_xp', { p_user_id: session.user.id, p_amount: xpGain });
  }

  async function submitFeedback(rating: 'up' | 'down') {
    if (!session) return;
    const wordId = questions[currentIndex]?.targetWord.id;
    if (!wordId) return;
    await supabase.from('feedback').insert({
      user_id: session.user.id,
      ref_type: 'word',
      ref_id: wordId,
      rating,
    });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Results screen
  if (done) {
    const pct = Math.round((score / ROUND_SIZE) * 100);
    return (
      <View style={styles.center}>
        <Text style={styles.resultEmoji}>{pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪'}</Text>
        <Text style={styles.resultTitle}>{score} / {ROUND_SIZE} correct</Text>
        <Text style={styles.resultSub}>
          {pct >= 80 ? 'Excellent work!' : pct >= 50 ? 'Good effort!' : 'Keep practicing!'}
        </Text>
        <Text style={styles.xpEarned}>+{score * 10} XP earned</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Back to Topics</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border }]}
          onPress={() => {
            setCurrentIndex(0);
            setScore(0);
            setSelected(null);
            setDone(false);
            setLoading(true);
            buildQuestions();
          }}
        >
          <Text style={[styles.buttonText, { color: Colors.text }]}>Play again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const current = questions[currentIndex];
  const progress = (currentIndex / ROUND_SIZE) * 100;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.counter}>{currentIndex + 1} / {ROUND_SIZE}</Text>
        <Text style={styles.scoreText}>⭐ {score}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Mode: picture_quiz — show 5 images, user picks one */}
        {mode === 'picture_quiz' && (
          <>
            <Text style={styles.instruction}>Which picture matches the word?</Text>
            <TouchableOpacity onPress={() => playWordAudio(current.targetWord)} style={styles.wordSpeakRow}>
              <Text style={styles.wordDisplay}>{current.targetWord.word}</Text>
              <Text style={styles.speakIcon}>🔊</Text>
            </TouchableOpacity>
            <View style={styles.imageGrid}>
              {current.imageOptions.map((opt) => {
                const isSelected = selected === opt.word;
                const isCorrect = opt.word === current.targetWord.word;
                let borderColor = Colors.border;
                if (isSelected && isCorrect) borderColor = Colors.success;
                if (isSelected && !isCorrect) borderColor = Colors.error;
                if (selected && !isSelected && isCorrect) borderColor = Colors.success;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.imageOption, { borderColor }]}
                    onPress={() => handleSelect(opt.word)}
                    disabled={!!selected}
                  >
                    {opt.image_url ? (
                      <Image source={{ uri: opt.image_url }} style={styles.optionImage} contentFit="cover" />
                    ) : (
                      <View style={[styles.optionImage, styles.imagePlaceholder]}>
                        <Text style={styles.placeholderText}>{opt.word}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Mode: word_quiz — show 1 image, pick word */}
        {mode === 'word_quiz' && (
          <>
            <Text style={styles.instruction}>What word matches this picture?</Text>
            {current.targetWord.image_url ? (
              <Image source={{ uri: current.targetWord.image_url }} style={styles.mainImage} contentFit="cover" />
            ) : (
              <View style={[styles.mainImage, styles.imagePlaceholder]}>
                <Text style={styles.placeholderText}>{current.targetWord.word}</Text>
              </View>
            )}
            <View style={styles.wordOptions}>
              {current.options.map((opt) => {
                const isSelected = selected === opt;
                const isCorrect = opt === current.targetWord.word;
                let bg = Colors.surface;
                let border = Colors.border;
                if (isSelected && isCorrect) { bg = Colors.successLight; border = Colors.success; }
                if (isSelected && !isCorrect) { bg = Colors.errorLight; border = Colors.error; }
                if (selected && !isSelected && isCorrect) { bg = Colors.successLight; border = Colors.success; }
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.wordOption, { backgroundColor: bg, borderColor: border }]}
                    onPress={() => handleSelect(opt)}
                    disabled={!!selected}
                  >
                    <Text style={styles.wordOptionText}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Mode: listen_pick — hear word, pick it */}
        {mode === 'listen_pick' && (
          <>
            <Text style={styles.instruction}>Listen and pick the correct word</Text>
            <TouchableOpacity onPress={() => playWordAudio(current.targetWord)} style={styles.listenBtn}>
              <Text style={styles.listenEmoji}>🔊</Text>
              <Text style={styles.listenLabel}>Tap to hear again</Text>
            </TouchableOpacity>
            <View style={styles.wordOptions}>
              {current.options.map((opt) => {
                const isSelected = selected === opt;
                const isCorrect = opt === current.targetWord.word;
                let bg = Colors.surface;
                let border = Colors.border;
                if (isSelected && isCorrect) { bg = Colors.successLight; border = Colors.success; }
                if (isSelected && !isCorrect) { bg = Colors.errorLight; border = Colors.error; }
                if (selected && !isSelected && isCorrect) { bg = Colors.successLight; border = Colors.success; }
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.wordOption, { backgroundColor: bg, borderColor: border }]}
                    onPress={() => handleSelect(opt)}
                    disabled={!!selected}
                  >
                    <Text style={styles.wordOptionText}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Feedback buttons */}
        <View style={styles.feedbackRow}>
          <Text style={styles.feedbackLabel}>Was this question good?</Text>
          <TouchableOpacity onPress={() => submitFeedback('up')}><Text style={styles.fbBtn}>👍</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => submitFeedback('down')}><Text style={styles.fbBtn}>👎</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 12,
  },
  back: { fontSize: FontSize.base, color: Colors.primary, fontWeight: FontWeight.semibold },
  counter: { fontSize: FontSize.base, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  scoreText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.primaryDark },
  progressBar: { height: 8, backgroundColor: Colors.border, marginHorizontal: 24, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  content: { padding: 24, gap: 20 },
  instruction: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center' },
  wordSpeakRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  wordDisplay: { fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold, color: Colors.text, textAlign: 'center' },
  speakIcon: { fontSize: 24 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  imageOption: { borderWidth: 3, borderRadius: 16, overflow: 'hidden', width: '45%' },
  optionImage: { width: '100%', aspectRatio: 1 },
  mainImage: { width: '100%', height: 220, borderRadius: 20, backgroundColor: Colors.surfaceAlt },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surfaceAlt },
  placeholderText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  wordOptions: { gap: 12 },
  wordOption: { borderWidth: 2, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  wordOptionText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  listenBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 60,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 40,
  },
  listenEmoji: { fontSize: 40 },
  listenLabel: { fontSize: FontSize.base, color: Colors.white, fontWeight: FontWeight.semibold },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 4 },
  feedbackLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
  fbBtn: { fontSize: 22 },
  resultEmoji: { fontSize: 60 },
  resultTitle: { fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold, color: Colors.text },
  resultSub: { fontSize: FontSize.md, color: Colors.textSecondary },
  xpEarned: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.xp },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '80%',
  },
  buttonText: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.md },
});
