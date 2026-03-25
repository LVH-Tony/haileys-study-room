import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  Pressable,
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
  options: string[];
  imageOptions: Word[];
}

// ─── Floating Feedback Button + Sheet ───────────────────────────────────────
function FeedbackSheet({
  visible,
  onClose,
  onRate,
  submitted,
  wordLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onRate: (r: 'up' | 'down') => void;
  submitted: boolean;
  wordLabel: string;
}) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable style={sheet.backdrop} onPress={onClose} />
      <View style={sheet.container}>
        <View style={sheet.handle} />
        {submitted ? (
          <View style={sheet.thanks}>
            <Text style={sheet.thanksEmoji}>✓</Text>
            <Text style={sheet.thanksText}>Thanks for your feedback!</Text>
          </View>
        ) : (
          <>
            <Text style={sheet.title}>Was this a good question?</Text>
            {wordLabel ? <Text style={sheet.wordChip}>"{wordLabel}"</Text> : null}
            <View style={sheet.rateRow}>
              <TouchableOpacity style={[sheet.rateBtn, sheet.upBtn]} onPress={() => onRate('up')}>
                <Text style={sheet.rateEmoji}>👍</Text>
                <Text style={sheet.rateBtnLabel}>Looks good</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[sheet.rateBtn, sheet.downBtn]} onPress={() => onRate('down')}>
                <Text style={sheet.rateEmoji}>👎</Text>
                <Text style={sheet.rateBtnLabel}>Something's off</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function GameScreen() {
  const { topicId, mode } = useLocalSearchParams<{ topicId: string; mode: GameMode }>();
  const router = useRouter();
  const { session } = useAuthStore();

  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  // Feedback sheet state
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  // Track which question index feedback was last submitted for (avoid double-submit)
  const [feedbackForIndex, setFeedbackForIndex] = useState<number | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    buildQuestions();
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  async function buildQuestions() {
    const { data: topicWords } = await supabase
      .from('words').select('*').eq('topic_id', topicId).order('difficulty_score');

    const { data: allWords } = await supabase
      .from('words').select('id, word, image_url, topic_id, difficulty_score, audio_url')
      .neq('topic_id', topicId).limit(60);

    if (!topicWords || topicWords.length < ROUND_SIZE) {
      Alert.alert('Not enough words', 'This topic needs at least 5 words to play.');
      router.back();
      return;
    }

    const sorted = [...topicWords].sort(() => Math.random() - 0.5).slice(0, ROUND_SIZE);
    const distractorPool: Word[] = (allWords ?? []) as Word[];

    const built: GameQuestion[] = sorted.map((word) => {
      const otherTopicWords = topicWords.filter((w) => w.id !== word.id);
      const distractors = [...otherTopicWords, ...distractorPool]
        .filter((w) => w.word !== word.word)
        .sort(() => Math.random() - 0.5).slice(0, 3);

      const options = [word.word, ...distractors.map((d) => d.word)].sort(() => Math.random() - 0.5);
      const imageOptions = [word as Word, ...distractors.slice(0, 3) as Word[]].sort(() => Math.random() - 0.5);
      return { targetWord: word as Word, options, imageOptions };
    });

    setQuestions(built);
    setLoading(false);

    if ((mode === 'listen_pick' || mode === 'picture_quiz') && built.length > 0) {
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
        const { data } = await supabase.functions.invoke('tts', { body: { text: word.word } });
        if (data?.audioUrl) {
          const { sound } = await Audio.Sound.createAsync({ uri: data.audioUrl });
          soundRef.current = sound;
          await sound.playAsync();
        }
      }
    } catch { /* non-fatal */ }
  }

  async function handleSelect(answer: string) {
    if (selected) return;
    setSelected(answer);

    const current = questions[currentIndex];
    const isCorrect = answer === current.targetWord.word;
    if (isCorrect) setScore((s) => s + 1);

    if (session) await updateWordStat(current.targetWord.id, isCorrect);
    // No auto-advance — user taps "Next" to continue
  }

  async function handleNext() {
    const isLast = currentIndex + 1 >= questions.length;
    const finalScore = score; // already updated by handleSelect

    if (isLast) {
      await saveSession(finalScore);
      setDone(true);
    } else {
      setCurrentIndex((i) => i + 1);
      setSelected(null);
      setFeedbackSubmitted(false);
      const next = questions[currentIndex + 1];
      if (mode === 'listen_pick' || mode === 'picture_quiz') {
        await playWordAudio(next.targetWord);
      }
    }
  }

  async function updateWordStat(wordId: string, correct: boolean) {
    if (!session) return;
    const { data: existing } = await supabase.from('user_word_stats').select('*')
      .eq('user_id', session.user.id).eq('word_id', wordId).single();

    const interval = nextInterval(existing?.interval_days ?? 1, correct);
    const reviewAt = nextReviewDate(interval);

    if (existing) {
      await supabase.from('user_word_stats').update({
        correct_count: existing.correct_count + (correct ? 1 : 0),
        wrong_count: existing.wrong_count + (correct ? 0 : 1),
        interval_days: interval, next_review_at: reviewAt, updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('user_word_stats').insert({
        user_id: session.user.id, word_id: wordId,
        correct_count: correct ? 1 : 0, wrong_count: correct ? 0 : 1,
        interval_days: interval, next_review_at: reviewAt, updated_at: new Date().toISOString(),
      });
    }
  }

  async function saveSession(finalScore: number) {
    if (!session || !topicId) return;
    await supabase.from('lesson_history').insert({
      user_id: session.user.id, topic_id: topicId, mode: mode as GameMode,
      score: finalScore, total_questions: ROUND_SIZE, completed_at: new Date().toISOString(),
    });
    await supabase.rpc('increment_xp', { p_user_id: session.user.id, p_amount: finalScore * 10 });
  }

  function openFeedback() {
    setFeedbackSubmitted(false);
    setFeedbackVisible(true);
  }

  async function handleRate(rating: 'up' | 'down') {
    if (!session) return;
    // On results screen feedback on the whole session (use last question's word as ref)
    const refIndex = done ? questions.length - 1 : currentIndex;
    const wordId = questions[refIndex]?.targetWord.id;
    if (!wordId || feedbackForIndex === refIndex) {
      // Already submitted for this question — just close
      setFeedbackSubmitted(true);
      setTimeout(() => setFeedbackVisible(false), 1200);
      return;
    }
    await supabase.from('feedback').insert({
      user_id: session.user.id, ref_type: 'word', ref_id: wordId, rating,
    });
    setFeedbackForIndex(refIndex);
    setFeedbackSubmitted(true);
    setTimeout(() => setFeedbackVisible(false), 1200);
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // ── Results screen ───────────────────────────────────────────────────────
  if (done) {
    const pct = Math.round((score / ROUND_SIZE) * 100);
    return (
      <View style={styles.container}>
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
            style={[styles.button, styles.outlineButton]}
            onPress={() => {
              setCurrentIndex(0); setScore(0); setSelected(null);
              setDone(false); setFeedbackSubmitted(false); setFeedbackForIndex(null);
              setLoading(true); buildQuestions();
            }}
          >
            <Text style={[styles.buttonText, { color: Colors.text }]}>Play again</Text>
          </TouchableOpacity>
        </View>

        {/* Floating feedback button — available on results too */}
        <FloatingFeedbackButton onPress={openFeedback} />
        <FeedbackSheet
          visible={feedbackVisible}
          onClose={() => setFeedbackVisible(false)}
          onRate={handleRate}
          submitted={feedbackSubmitted}
          wordLabel={questions[questions.length - 1]?.targetWord.word ?? ''}
        />
      </View>
    );
  }

  // ── Game screen ──────────────────────────────────────────────────────────
  const current = questions[currentIndex];
  const isLastQuestion = currentIndex + 1 >= questions.length;
  const progress = (currentIndex / ROUND_SIZE) * 100;
  const isAnswered = !!selected;
  const isCorrect = selected === current.targetWord.word;

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
        {/* ── Picture Quiz ── */}
        {mode === 'picture_quiz' && (
          <>
            <Text style={styles.instruction}>Which picture matches the word?</Text>
            <TouchableOpacity onPress={() => playWordAudio(current.targetWord)} style={styles.wordSpeakRow}>
              <Text style={styles.wordDisplay}>{current.targetWord.word}</Text>
              <Text style={styles.speakIcon}>🔊</Text>
            </TouchableOpacity>
            <View style={styles.imageGrid}>
              {current.imageOptions.map((opt) => {
                const isOpt = selected === opt.word;
                const isOptCorrect = opt.word === current.targetWord.word;
                let borderColor = Colors.border;
                if (isOpt && isOptCorrect) borderColor = Colors.success;
                if (isOpt && !isOptCorrect) borderColor = Colors.error;
                if (isAnswered && !isOpt && isOptCorrect) borderColor = Colors.success;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.imageOption, { borderColor }]}
                    onPress={() => handleSelect(opt.word)}
                    disabled={isAnswered}
                  >
                    {opt.image_url
                      ? <Image source={{ uri: opt.image_url }} style={styles.optionImage} contentFit="cover" />
                      : <View style={[styles.optionImage, styles.imagePlaceholder]}>
                          <Text style={styles.placeholderText}>{opt.word}</Text>
                        </View>
                    }
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ── Word Quiz ── */}
        {mode === 'word_quiz' && (
          <>
            <Text style={styles.instruction}>What word matches this picture?</Text>
            {current.targetWord.image_url
              ? <Image source={{ uri: current.targetWord.image_url }} style={styles.mainImage} contentFit="cover" />
              : <View style={[styles.mainImage, styles.imagePlaceholder]}>
                  <Text style={styles.placeholderText}>{current.targetWord.word}</Text>
                </View>
            }
            <WordOptions
              options={current.options} selected={selected}
              correct={current.targetWord.word} onSelect={handleSelect} disabled={isAnswered}
            />
          </>
        )}

        {/* ── Listen & Pick ── */}
        {mode === 'listen_pick' && (
          <>
            <Text style={styles.instruction}>Listen and pick the correct word</Text>
            <TouchableOpacity onPress={() => playWordAudio(current.targetWord)} style={styles.listenBtn}>
              <Text style={styles.listenEmoji}>🔊</Text>
              <Text style={styles.listenLabel}>Tap to hear again</Text>
            </TouchableOpacity>
            <WordOptions
              options={current.options} selected={selected}
              correct={current.targetWord.word} onSelect={handleSelect} disabled={isAnswered}
            />
          </>
        )}

        {/* ── Result banner + Next button ── */}
        {isAnswered && (
          <View style={[styles.resultBanner, isCorrect ? styles.correctBanner : styles.wrongBanner]}>
            <Text style={styles.resultBannerEmoji}>{isCorrect ? '✓' : '✗'}</Text>
            <View style={styles.resultBannerText}>
              <Text style={[styles.resultBannerTitle, { color: isCorrect ? Colors.success : Colors.error }]}>
                {isCorrect ? 'Correct!' : 'Not quite'}
              </Text>
              {!isCorrect && (
                <Text style={styles.resultBannerSub}>
                  Answer: <Text style={{ fontWeight: FontWeight.bold }}>{current.targetWord.word}</Text>
                </Text>
              )}
            </View>
            <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextBtnText}>{isLastQuestion ? 'Finish' : 'Next →'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Floating feedback button — always visible */}
      <FloatingFeedbackButton onPress={openFeedback} />

      <FeedbackSheet
        visible={feedbackVisible}
        onClose={() => setFeedbackVisible(false)}
        onRate={handleRate}
        submitted={feedbackSubmitted}
        wordLabel={current.targetWord.word}
      />
    </View>
  );
}

// ── Shared word options component ────────────────────────────────────────────
function WordOptions({
  options, selected, correct, onSelect, disabled,
}: {
  options: string[]; selected: string | null; correct: string;
  onSelect: (o: string) => void; disabled: boolean;
}) {
  return (
    <View style={styles.wordOptions}>
      {options.map((opt) => {
        const isSelected = selected === opt;
        const isCorrect = opt === correct;
        let bg = Colors.surface;
        let border = Colors.border;
        if (isSelected && isCorrect) { bg = Colors.successLight; border = Colors.success; }
        if (isSelected && !isCorrect) { bg = Colors.errorLight; border = Colors.error; }
        if (disabled && !isSelected && isCorrect) { bg = Colors.successLight; border = Colors.success; }
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.wordOption, { backgroundColor: bg, borderColor: border }]}
            onPress={() => onSelect(opt)}
            disabled={disabled}
          >
            <Text style={styles.wordOptionText}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Floating button ───────────────────────────────────────────────────────────
function FloatingFeedbackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={fab.btn} onPress={onPress} activeOpacity={0.8}>
      <Text style={fab.icon}>⚑</Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 60, paddingBottom: 12,
  },
  back: { fontSize: FontSize.base, color: Colors.primary, fontWeight: FontWeight.semibold },
  counter: { fontSize: FontSize.base, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  scoreText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.primaryDark },
  progressBar: { height: 8, backgroundColor: Colors.border, marginHorizontal: 24, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  content: { padding: 24, paddingBottom: 120, gap: 20 },
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
    backgroundColor: Colors.primary, borderRadius: 60, paddingVertical: 24,
    alignItems: 'center', gap: 6, marginHorizontal: 40,
  },
  listenEmoji: { fontSize: 40 },
  listenLabel: { fontSize: FontSize.base, color: Colors.white, fontWeight: FontWeight.semibold },

  // Result banner
  resultBanner: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 18,
    padding: 16, gap: 12, borderWidth: 1.5,
  },
  correctBanner: { backgroundColor: Colors.successLight + 'AA', borderColor: Colors.success },
  wrongBanner: { backgroundColor: Colors.errorLight + 'AA', borderColor: Colors.error },
  resultBannerEmoji: { fontSize: 28 },
  resultBannerText: { flex: 1, gap: 2 },
  resultBannerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  resultBannerSub: { fontSize: FontSize.sm, color: Colors.textSecondary },
  nextBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  nextBtnText: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.sm },

  // Results screen
  resultEmoji: { fontSize: 60 },
  resultTitle: { fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold, color: Colors.text },
  resultSub: { fontSize: FontSize.md, color: Colors.textSecondary },
  xpEarned: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.xp },
  button: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
    paddingHorizontal: 32, alignItems: 'center', width: '80%',
  },
  outlineButton: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border },
  buttonText: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.md },
});

const fab = StyleSheet.create({
  btn: {
    position: 'absolute',
    bottom: 32,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  icon: { fontSize: 18, color: Colors.textSecondary },
});

const sheet = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 48,
    gap: 20,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: FontSize.lg, fontWeight: FontWeight.bold,
    color: Colors.text, textAlign: 'center',
  },
  wordChip: {
    alignSelf: 'center',
    backgroundColor: Colors.background,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  rateRow: { flexDirection: 'row', gap: 14 },
  rateBtn: {
    flex: 1, borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', gap: 8, borderWidth: 1.5,
  },
  upBtn: { backgroundColor: Colors.successLight + '55', borderColor: Colors.success },
  downBtn: { backgroundColor: Colors.errorLight + '55', borderColor: Colors.error },
  rateEmoji: { fontSize: 30 },
  rateBtnLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },
  thanks: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  thanksEmoji: { fontSize: 40, color: Colors.success },
  thanksText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
});
