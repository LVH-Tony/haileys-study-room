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
  Animated,
} from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { nextInterval, nextReviewDate } from '@/lib/spaced-repetition';
import { playCorrect, playWrong, playComplete } from '@/lib/sounds';
import { checkGameAchievements } from '@/lib/achievements';
import { numberToWords, generateNumbers, numeralUri, parseNumeralUri, getColorPool, colorUri, parseColorUri } from '@/lib/number-utils';
import type { Word, GameMode } from '@/lib/database.types';

const ROUND_SIZE = 5;

interface GameQuestion {
  targetWord: Word;
  options: string[];
  imageOptions: Word[];
}

// ─── Numeral Display ──────────────────────────────────────────────────────────
function NumeralDisplay({ value, style, small }: { value: number; style?: any; small?: boolean }) {
  const numStr = value.toLocaleString();
  const fontSize = small
    ? (numStr.length <= 2 ? 44 : numStr.length <= 4 ? 32 : 22)
    : (numStr.length <= 2 ? 80 : numStr.length <= 4 ? 56 : 40);
  const bg = NUMERAL_COLORS[value % NUMERAL_COLORS.length];
  return (
    <View style={[style, { backgroundColor: bg, justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ fontSize, fontWeight: '900', color: '#fff', textShadowColor: 'rgba(0,0,0,0.15)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 }}>
        {numStr}
      </Text>
    </View>
  );
}
const NUMERAL_COLORS = ['#1976D2','#388E3C','#E64A19','#7B1FA2','#00796B','#F57C00','#C62828','#283593'];

// ─── Color Swatch ─────────────────────────────────────────────────────────────
function ColorSwatch({ hex, style }: { hex: string; style?: any }) {
  return <View style={[style, { backgroundColor: hex }]} />;
}

// ─── Achievement Toast ────────────────────────────────────────────────────────
function AchievementToast({ visible, text }: { visible: boolean; text: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(2500),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, text]);

  if (!visible) return null;
  return (
    <Animated.View style={[toast.container, { opacity }]}>
      <Text style={toast.text}>🏅 {text}</Text>
    </Animated.View>
  );
}

// ─── Feedback Sheet ───────────────────────────────────────────────────────────
function FeedbackSheet({ visible, onClose, onRate, submitted, wordLabel }: {
  visible: boolean; onClose: () => void; onRate: (r: 'up' | 'down') => void;
  submitted: boolean; wordLabel: string;
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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function GameScreen() {
  const { topicId, mode } = useLocalSearchParams<{ topicId: string; mode: GameMode }>();
  const router = useRouter();
  const { session, profile } = useAuthStore();

  const [questions, setQuestions]   = useState<GameQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected]     = useState<string | null>(null);
  const [score, setScore]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [done, setDone]             = useState(false);
  const [muted, setMuted]           = useState(false);
  const [slowMode, setSlowMode]     = useState(false);

  // Definition card
  const [shownDef, setShownDef]     = useState<{ correct: Word; chosen: Word | null } | null>(null);

  // Achievement toast
  const [toastText, setToastText]   = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // Feedback
  const [feedbackVisible, setFeedbackVisible]   = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackForIndex, setFeedbackForIndex] = useState<number | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);

  // Listen for achievement unlocks
  useEffect(() => {
    const originalPlay = globalThis.__onAchievement;
    globalThis.__onAchievementUnlocked = (title: string) => {
      setToastText(`Achievement: ${title}`);
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 3200);
    };
    return () => { globalThis.__onAchievementUnlocked = originalPlay; };
  }, []);

  useEffect(() => {
    buildQuestions();
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  async function buildQuestions() {
    // Check if this is the Numbers topic
    const { data: topicData } = await supabase.from('topics').select('name').eq('id', topicId).single();
    const isNumbers = topicData?.name === 'Numbers';

    const userLevel = (profile?.starting_level ?? 'beginner') as import('@/lib/database.types').DifficultyTier;

    if (isNumbers) {
      // Dynamically generate random numbers for the user's level
      const pool = generateNumbers(ROUND_SIZE * 6, userLevel); // big pool so distractors are varied
      const targets = pool.slice(0, ROUND_SIZE);
      const distractorPool = pool.slice(ROUND_SIZE);

      const built: GameQuestion[] = targets.map((n, idx) => {
        const word = numberToWords(n);
        const distractorNums = distractorPool.slice(idx * 3, idx * 3 + 3);
        const distractors = distractorNums.map((d) => numberToWords(d));
        const options = [word, ...distractors].sort(() => Math.random() - 0.5);
        const fakeWord: Word = { id: `num-${n}`, word, image_url: numeralUri(n), definition: `The number ${n}`, difficulty_score: 1, topic_id: topicId, audio_url: null } as any;
        const fakeDistractors: Word[] = distractorNums.map((d) => ({
          id: `num-${d}`, word: numberToWords(d), image_url: numeralUri(d), definition: `The number ${d}`, difficulty_score: 1, topic_id: topicId, audio_url: null,
        } as any));
        const imageOptions = [fakeWord, ...fakeDistractors].sort(() => Math.random() - 0.5);
        return { targetWord: fakeWord, options, imageOptions };
      });

      setQuestions(built);
      setLoading(false);
      if (!muted && (mode === 'listen_pick' || mode === 'picture_quiz') && built.length > 0) {
        await playWordAudio(built[0].targetWord);
      }
      return;
    }

    const isColors = topicData?.name === 'Colors';

    if (isColors) {
      const pool = [...getColorPool(userLevel)].sort(() => Math.random() - 0.5);
      const targets = pool.slice(0, ROUND_SIZE);
      const built: GameQuestion[] = targets.map((color, idx) => {
        const others = pool.filter((_, i) => i !== pool.indexOf(color));
        const distractors = others.sort(() => Math.random() - 0.5).slice(0, 3);
        const options = [color.name, ...distractors.map((d) => d.name)].sort(() => Math.random() - 0.5);
        const makeWord = (c: typeof color): Word => ({
          id: `color-${c.name}`, word: c.name, image_url: colorUri(c.hex),
          definition: c.definition, difficulty_score: 1, topic_id: topicId, audio_url: null,
        } as any);
        const imageOptions = [makeWord(color), ...distractors.map(makeWord)].sort(() => Math.random() - 0.5);
        return { targetWord: makeWord(color), options, imageOptions };
      });

      setQuestions(built);
      setLoading(false);
      if (!muted && (mode === 'listen_pick' || mode === 'picture_quiz') && built.length > 0) {
        await playWordAudio(built[0].targetWord);
      }
      return;
    }

    const { data: topicWords } = await supabase
      .from('words').select('*').eq('topic_id', topicId).order('difficulty_score');

    const { data: allWords } = await supabase
      .from('words').select('id, word, image_url, topic_id, difficulty_score, audio_url, definition')
      .neq('topic_id', topicId).limit(60);

    if (!topicWords || topicWords.length < ROUND_SIZE) {
      Alert.alert('Not enough words', 'This topic needs at least 5 words to play.');
      router.back();
      return;
    }

    // Pick words appropriate to the user's level — prefer lower difficulty_score for beginners
    const maxScore: Record<string, number> = { beginner: 2, elementary: 3, 'pre-intermediate': 5, intermediate: 99 };
    const cap = maxScore[userLevel] ?? 99;
    const levelWords = topicWords.filter((w) => (w.difficulty_score ?? 1) <= cap);
    const pool2 = levelWords.length >= ROUND_SIZE ? levelWords : topicWords;
    const sorted = [...pool2].sort(() => Math.random() - 0.5).slice(0, ROUND_SIZE);
    const crossTopicPool: Word[] = (allWords ?? []) as Word[];

    const built: GameQuestion[] = sorted.map((word) => {
      // Always prefer same-topic distractors — only fall back to cross-topic if needed
      const sameTopicOthers = topicWords
        .filter((w) => w.id !== word.id && w.word !== word.word)
        .sort(() => Math.random() - 0.5);

      let distractors: Word[];
      if (sameTopicOthers.length >= 3) {
        distractors = sameTopicOthers.slice(0, 3) as Word[];
      } else {
        const needed = 3 - sameTopicOthers.length;
        const fallback = crossTopicPool
          .filter((w) => w.word !== word.word)
          .sort(() => Math.random() - 0.5)
          .slice(0, needed) as Word[];
        distractors = [...sameTopicOthers as Word[], ...fallback];
      }

      const options = [word.word, ...distractors.map((d) => d.word)].sort(() => Math.random() - 0.5);
      const imageOptions = [word as Word, ...distractors.slice(0, 3) as Word[]].sort(() => Math.random() - 0.5);
      return { targetWord: word as Word, options, imageOptions };
    });

    setQuestions(built);
    setLoading(false);

    if (!muted && (mode === 'listen_pick' || mode === 'picture_quiz') && built.length > 0) {
      await playWordAudio(built[0].targetWord);
    }
  }

  async function playWordAudio(word: Word) {
    if (muted) return;
    try {
      if (Platform.OS !== 'web') {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true });
      }
      if (word.audio_url) {
        soundRef.current?.unloadAsync();
        const { sound } = await Audio.Sound.createAsync({ uri: word.audio_url });
        soundRef.current = sound;
        await sound.playAsync();
      } else {
        Speech.stop();
        Speech.speak(word.word, { language: 'en-US', rate: slowMode ? 0.5 : 0.85, pitch: 1.0 });
      }
    } catch {
      try { Speech.speak(word.word, { language: 'en-US', rate: slowMode ? 0.5 : 0.85 }); } catch { /* ignore */ }
    }
  }

  function speakText(text: string) {
    if (muted) return;
    try { Speech.stop(); Speech.speak(text, { language: 'en-US', rate: slowMode ? 0.5 : 0.85 }); } catch { /* ignore */ }
  }

  async function handleSelect(answer: string) {
    if (selected) return;
    setSelected(answer);

    const current = questions[currentIndex];
    const isCorrect = answer === current.targetWord.word;
    if (isCorrect) {
      setScore((s) => s + 1);
      if (!muted) playCorrect();
    } else {
      if (!muted) playWrong();
    }

    // Show definition card
    const chosenWord = current.imageOptions.find((w) => w.word === answer) ??
      current.options.includes(answer) ? ({ word: answer } as Word) : null;
    setShownDef({ correct: current.targetWord, chosen: answer !== current.targetWord.word ? (chosenWord ?? null) : null });

    if (session) await updateWordStat(current.targetWord.id, isCorrect);
  }

  async function handleNext() {
    setShownDef(null);
    const isLast = currentIndex + 1 >= questions.length;
    const newScore = score;

    if (isLast) {
      await saveSession(newScore);
      if (!muted) playComplete();
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
    // Check achievements async (don't await — don't block UI)
    checkGameAchievements(session.user.id, finalScore, ROUND_SIZE).catch(() => {});
  }

  async function handleRate(rating: 'up' | 'down') {
    if (!session) return;
    const refIndex = done ? questions.length - 1 : currentIndex;
    const wordId = questions[refIndex]?.targetWord.id;
    if (!wordId || feedbackForIndex === refIndex) {
      setFeedbackSubmitted(true);
      setTimeout(() => setFeedbackVisible(false), 1200);
      return;
    }
    await supabase.from('feedback').insert({ user_id: session.user.id, ref_type: 'word', ref_id: wordId, rating });
    setFeedbackForIndex(refIndex);
    setFeedbackSubmitted(true);
    setTimeout(() => setFeedbackVisible(false), 1200);
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  // ── Results screen ──────────────────────────────────────────────────────────
  if (done) {
    const pct = Math.round((score / ROUND_SIZE) * 100);
    return (
      <View style={styles.container}>
        <AchievementToast visible={toastVisible} text={toastText} />
        <View style={styles.center}>
          <Text style={styles.resultEmoji}>{pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪'}</Text>
          <Text style={styles.resultTitle}>{score} / {ROUND_SIZE} correct</Text>
          <Text style={styles.resultSub}>{pct >= 80 ? 'Excellent work!' : pct >= 50 ? 'Good effort!' : 'Keep practicing!'}</Text>
          <Text style={styles.xpEarned}>+{score * 10} XP earned</Text>

          <View style={styles.scoreBar}>
            <View style={[styles.scoreBarFill, { width: `${pct}%` as any, backgroundColor: pct >= 80 ? Colors.success : pct >= 50 ? Colors.warning : Colors.error }]} />
          </View>

          <TouchableOpacity style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Back to Topics</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.outlineButton]}
            onPress={() => {
              setCurrentIndex(0); setScore(0); setSelected(null);
              setDone(false); setShownDef(null); setFeedbackSubmitted(false); setFeedbackForIndex(null);
              setLoading(true); buildQuestions();
            }}
          >
            <Text style={[styles.buttonText, { color: Colors.text }]}>Play again</Text>
          </TouchableOpacity>
        </View>
        <FloatingFeedbackButton onPress={() => { setFeedbackSubmitted(false); setFeedbackVisible(true); }} />
        <FeedbackSheet visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} onRate={handleRate} submitted={feedbackSubmitted} wordLabel={questions[questions.length - 1]?.targetWord.word ?? ''} />
      </View>
    );
  }

  // ── Game screen ─────────────────────────────────────────────────────────────
  const current = questions[currentIndex];
  const isLastQuestion = currentIndex + 1 >= questions.length;
  const progress = (currentIndex / ROUND_SIZE) * 100;
  const isAnswered = !!selected;
  const isCorrect = selected === current.targetWord.word;

  return (
    <View style={styles.container}>
      <AchievementToast visible={toastVisible} text={toastText} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.counter}>{currentIndex + 1} / {ROUND_SIZE}</Text>
        <View style={styles.headerRight}>
          <Text style={styles.scoreText}>⭐ {score}</Text>
          <TouchableOpacity
            style={[styles.slowBtn, slowMode && styles.slowBtnActive]}
            onPress={() => setSlowMode((v) => !v)}
          >
            <Text style={styles.slowBtnText}>🐢</Text>
          </TouchableOpacity>
          {/* Mute toggle — only for picture_quiz */}
          {mode === 'picture_quiz' && (
            <TouchableOpacity onPress={() => setMuted((m) => !m)} style={styles.muteBtn}>
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color={muted ? Colors.textMuted : Colors.primary} />
            </TouchableOpacity>
          )}
        </View>
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
            <TouchableOpacity onPress={() => playWordAudio(current.targetWord)} style={styles.wordSpeakRow} disabled={muted}>
              <Text style={styles.wordDisplay}>{current.targetWord.word}</Text>
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color={muted ? Colors.textMuted : Colors.primary} />
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
                  <TouchableOpacity key={opt.id} style={[styles.imageOption, { borderColor }]} onPress={() => handleSelect(opt.word)} disabled={isAnswered}>
                    {parseNumeralUri(opt.image_url ?? '') !== null
                      ? <NumeralDisplay value={parseNumeralUri(opt.image_url!)!} style={styles.optionImage} small />
                      : parseColorUri(opt.image_url ?? '')
                        ? <ColorSwatch hex={parseColorUri(opt.image_url!)!} style={styles.optionImage} />
                        : opt.image_url
                          ? <Image source={{ uri: opt.image_url }} style={styles.optionImage} contentFit="cover" />
                          : <View style={[styles.optionImage, styles.imagePlaceholder]}><Text style={styles.placeholderText}>{opt.word}</Text></View>
                    }
                    {isAnswered && <Text style={styles.imageLabel}>{opt.word}</Text>}
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
            {parseNumeralUri(current.targetWord.image_url ?? '') !== null
              ? <NumeralDisplay value={parseNumeralUri(current.targetWord.image_url!)!} style={styles.mainImage} />
              : parseColorUri(current.targetWord.image_url ?? '')
                ? <ColorSwatch hex={parseColorUri(current.targetWord.image_url!)!} style={styles.mainImage} />
                : current.targetWord.image_url
                  ? <Image source={{ uri: current.targetWord.image_url }} style={styles.mainImage} contentFit="cover" />
                  : <View style={[styles.mainImage, styles.imagePlaceholder]}><Text style={styles.placeholderText}>{current.targetWord.word}</Text></View>
            }
            <WordOptions options={current.options} selected={selected} correct={current.targetWord.word} onSelect={handleSelect} disabled={isAnswered} />
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
            <WordOptions options={current.options} selected={selected} correct={current.targetWord.word} onSelect={handleSelect} disabled={isAnswered} />
          </>
        )}

        {/* ── Definition card + Result banner ── */}
        {isAnswered && (
          <>
            {/* Result banner */}
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
                <Text style={styles.nextBtnText}>{isLastQuestion ? 'Finish 🎉' : 'Next →'}</Text>
              </TouchableOpacity>
            </View>

            {/* Definition card */}
            <DefinitionCard
              correct={shownDef?.correct ?? current.targetWord}
              chosen={shownDef?.chosen ?? null}
              isCorrect={isCorrect}
              onSpeak={speakText}
              muted={muted}
            />
          </>
        )}
      </ScrollView>

      <FloatingFeedbackButton onPress={() => { setFeedbackSubmitted(false); setFeedbackVisible(true); }} />
      <FeedbackSheet visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} onRate={handleRate} submitted={feedbackSubmitted} wordLabel={current.targetWord.word} />
    </View>
  );
}

// ── Definition Card ───────────────────────────────────────────────────────────
function DefinitionCard({ correct, chosen, isCorrect, onSpeak, muted }: {
  correct: Word; chosen: Word | null; isCorrect: boolean; onSpeak: (t: string) => void; muted: boolean;
}) {
  return (
    <View style={defStyles.card}>
      <Text style={defStyles.cardTitle}>📖 Word Info</Text>

      {/* Correct word */}
      <View style={defStyles.wordRow}>
        <View style={defStyles.wordLeft}>
          <Text style={defStyles.wordLabel}>✓ <Text style={defStyles.wordName}>{correct.word}</Text></Text>
          {correct.definition
            ? <Text style={defStyles.definition}>{correct.definition}</Text>
            : <Text style={defStyles.definitionPlaceholder}>No definition yet</Text>
          }
        </View>
        <TouchableOpacity
          style={[defStyles.speakBtn, muted && defStyles.speakBtnMuted]}
          onPress={() => onSpeak(correct.definition ? `${correct.word}. ${correct.definition}` : correct.word)}
          disabled={muted}
        >
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={16} color={muted ? Colors.textMuted : Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Chosen word (if wrong) */}
      {!isCorrect && chosen && chosen.word !== correct.word && (
        <>
          <View style={defStyles.divider} />
          <View style={defStyles.wordRow}>
            <View style={defStyles.wordLeft}>
              <Text style={defStyles.wordLabel}>✗ <Text style={[defStyles.wordName, { color: Colors.error }]}>{chosen.word}</Text></Text>
              {(chosen as any).definition
                ? <Text style={defStyles.definition}>{(chosen as any).definition}</Text>
                : <Text style={defStyles.definitionPlaceholder}>No definition yet</Text>
              }
            </View>
            <TouchableOpacity
              style={[defStyles.speakBtn, muted && defStyles.speakBtnMuted]}
              onPress={() => onSpeak((chosen as any).definition ? `${chosen.word}. ${(chosen as any).definition}` : chosen.word)}
              disabled={muted}
            >
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={16} color={muted ? Colors.textMuted : Colors.error} />
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

// ── Word Options ──────────────────────────────────────────────────────────────
function WordOptions({ options, selected, correct, onSelect, disabled }: {
  options: string[]; selected: string | null; correct: string;
  onSelect: (o: string) => void; disabled: boolean;
}) {
  return (
    <View style={styles.wordOptions}>
      {options.map((opt) => {
        const isSelected = selected === opt;
        const isOpt = opt === correct;
        let bg = Colors.surface, border = Colors.border;
        if (isSelected && isOpt)   { bg = Colors.successLight; border = Colors.success; }
        if (isSelected && !isOpt)  { bg = Colors.errorLight;   border = Colors.error; }
        if (disabled && !isSelected && isOpt) { bg = Colors.successLight; border = Colors.success; }
        return (
          <TouchableOpacity key={opt} style={[styles.wordOption, { backgroundColor: bg, borderColor: border }]} onPress={() => onSelect(opt)} disabled={disabled}>
            <Text style={styles.wordOptionText}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Floating Feedback ─────────────────────────────────────────────────────────
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
  center:    { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back:      { fontSize: FontSize.base, color: Colors.primary, fontWeight: FontWeight.semibold },
  counter:   { fontSize: FontSize.base, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  scoreText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.primaryDark },
  muteBtn:   { padding: 4 },
  slowBtn:      { borderRadius: 14, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  slowBtnActive:{ borderColor: Colors.primary, backgroundColor: Colors.primary + '18' },
  slowBtnText:  { fontSize: 15 },
  progressBar:  { height: 8, backgroundColor: Colors.border, marginHorizontal: 24, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  content:   { padding: 24, paddingBottom: 120, gap: 20 },
  instruction:  { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center' },
  wordSpeakRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  wordDisplay:  { fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold, color: Colors.text, textAlign: 'center' },
  imageGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  imageOption:  { borderWidth: 3, borderRadius: 16, overflow: 'hidden', width: '45%' },
  optionImage:  { width: '100%', aspectRatio: 1 },
  imageLabel:   { textAlign: 'center', paddingVertical: 6, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text, backgroundColor: Colors.surface },
  mainImage:    { width: '100%', height: 220, borderRadius: 20, backgroundColor: Colors.surfaceAlt },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surfaceAlt },
  placeholderText:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  wordOptions:  { gap: 12 },
  wordOption:   { borderWidth: 2, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  wordOptionText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  listenBtn:    { backgroundColor: Colors.primary, borderRadius: 60, paddingVertical: 24, alignItems: 'center', gap: 6, marginHorizontal: 40 },
  listenEmoji:  { fontSize: 40 },
  listenLabel:  { fontSize: FontSize.base, color: Colors.white, fontWeight: FontWeight.semibold },
  resultBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 16, gap: 12, borderWidth: 1.5 },
  correctBanner: { backgroundColor: Colors.successLight + 'AA', borderColor: Colors.success },
  wrongBanner:   { backgroundColor: Colors.errorLight + 'AA', borderColor: Colors.error },
  resultBannerEmoji: { fontSize: 28 },
  resultBannerText:  { flex: 1, gap: 2 },
  resultBannerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  resultBannerSub:   { fontSize: FontSize.sm, color: Colors.textSecondary },
  nextBtn:     { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  nextBtnText: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  resultEmoji: { fontSize: 60 },
  resultTitle: { fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold, color: Colors.text },
  resultSub:   { fontSize: FontSize.md, color: Colors.textSecondary },
  xpEarned:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.xp },
  scoreBar:     { width: '100%', height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 5 },
  button:       { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', width: '80%' },
  outlineButton: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border },
  buttonText:   { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.md },
});

const defStyles = StyleSheet.create({
  card:       { backgroundColor: Colors.surface, borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: Colors.border, gap: 12 },
  cardTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  wordRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  wordLeft:   { flex: 1, gap: 4 },
  wordLabel:  { fontSize: FontSize.base, color: Colors.textSecondary },
  wordName:   { fontWeight: FontWeight.extrabold, color: Colors.text, fontSize: FontSize.md },
  definition: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 },
  definitionPlaceholder: { fontSize: FontSize.sm, color: Colors.textMuted, fontStyle: 'italic' },
  speakBtn:   { backgroundColor: Colors.background, borderRadius: 20, padding: 8, borderWidth: 1.5, borderColor: Colors.border, marginTop: 2 },
  speakBtnMuted: { borderColor: Colors.border, opacity: 0.5 },
  divider:    { height: 1, backgroundColor: Colors.border },
});

const fab = StyleSheet.create({
  btn:  { position: 'absolute', bottom: 32, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surfaceAlt, borderWidth: 1.5, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center', shadowColor: Colors.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 4 },
  icon: { fontSize: 18, color: Colors.textSecondary },
});

const sheet = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  container:   { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 48, gap: 20 },
  handle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 4 },
  title:       { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text, textAlign: 'center' },
  wordChip:    { alignSelf: 'center', backgroundColor: Colors.background, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, fontSize: FontSize.base, color: Colors.textSecondary },
  rateRow:     { flexDirection: 'row', gap: 14 },
  rateBtn:     { flex: 1, borderRadius: 16, paddingVertical: 18, alignItems: 'center', gap: 8, borderWidth: 1.5 },
  upBtn:       { backgroundColor: Colors.successLight + '55', borderColor: Colors.success },
  downBtn:     { backgroundColor: Colors.errorLight + '55', borderColor: Colors.error },
  rateEmoji:   { fontSize: 30 },
  rateBtnLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },
  thanks:      { alignItems: 'center', gap: 12, paddingVertical: 12 },
  thanksEmoji: { fontSize: 40, color: Colors.success },
  thanksText:  { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
});

const toast = StyleSheet.create({
  container: { position: 'absolute', top: 110, left: 20, right: 20, zIndex: 100, backgroundColor: '#1A1A2E', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, elevation: 10 },
  text:      { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.base },
});
