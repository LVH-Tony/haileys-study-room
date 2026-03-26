import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Speech from 'expo-speech';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import type { DifficultyTier } from '@/lib/database.types';

// ── Types ─────────────────────────────────────────────────────────────────────
type QuestionType = 'picture_quiz' | 'definition_quiz' | 'grammar';
type Screen = 'intro' | 'test' | 'result';

interface WordBank {
  id: string;
  word: string;
  image_url: string | null;
  definition: string | null;
  topic_id: string;
  difficulty_score: number;
}

interface PlacementQuestion {
  type: QuestionType;
  id: string;
  word: string;
  image_url?: string | null;
  definition?: string;
  sentence?: string;
  options: string[];
  correct: string;
  difficulty_score: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TOTAL_QUESTIONS = 15;
const START_DIFFICULTY = 3;

// ── Grammar Bank ──────────────────────────────────────────────────────────────
const GRAMMAR_BANK: PlacementQuestion[] = [
  // Difficulty 1 — beginner
  { type: 'grammar', id: 'g1a', word: 'am',   sentence: 'I ___ a student.',            options: ['am', 'is', 'are', 'be'],                    correct: 'am',               difficulty_score: 1 },
  { type: 'grammar', id: 'g1b', word: 'is',   sentence: 'She ___ very happy today.',   options: ['am', 'is', 'are', 'be'],                    correct: 'is',               difficulty_score: 1 },
  { type: 'grammar', id: 'g1c', word: 'What', sentence: '___ is your name?',            options: ['What', 'Who', 'Where', 'When'],              correct: 'What',             difficulty_score: 1 },
  { type: 'grammar', id: 'g1d', word: 'an',   sentence: 'I have ___ apple.',            options: ['a', 'an', 'the', 'some'],                   correct: 'an',               difficulty_score: 1 },
  // Difficulty 2 — elementary
  { type: 'grammar', id: 'g2a', word: 'goes',        sentence: 'She ___ to school every day.',        options: ['go', 'goes', 'going', 'gone'],           correct: 'goes',             difficulty_score: 2 },
  { type: 'grammar', id: 'g2b', word: 'played',      sentence: 'They ___ football yesterday.',        options: ['play', 'plays', 'played', 'playing'],    correct: 'played',           difficulty_score: 2 },
  { type: 'grammar', id: 'g2c', word: 'is watching', sentence: 'He ___ TV right now.',                options: ['watch', 'watches', 'watched', 'is watching'], correct: 'is watching', difficulty_score: 2 },
  { type: 'grammar', id: 'g2d', word: 'Do',          sentence: '___ you like coffee?',                options: ['Are', 'Do', 'Does', 'Is'],               correct: 'Do',               difficulty_score: 2 },
  // Difficulty 3 — pre-intermediate
  { type: 'grammar', id: 'g3a', word: 'has lived',  sentence: 'She ___ here since 2020.',                 options: ['lives', 'lived', 'is living', 'has lived'],      correct: 'has lived',  difficulty_score: 3 },
  { type: 'grammar', id: 'g3b', word: 'will',       sentence: 'If it rains tomorrow, we ___ stay home.',   options: ['will', 'would', 'can', 'should'],                correct: 'will',       difficulty_score: 3 },
  { type: 'grammar', id: 'g3c', word: 'had started',sentence: 'By the time we arrived, the film ___.',     options: ['started', 'had started', 'has started', 'starts'], correct: 'had started', difficulty_score: 3 },
  { type: 'grammar', id: 'g3d', word: 'have been',  sentence: 'I ___ to the gym three times this week.',  options: ['went', 'have been', 'go', 'had gone'],           correct: 'have been',  difficulty_score: 3 },
  // Difficulty 4 — intermediate
  { type: 'grammar', id: 'g4a', word: 'had',               sentence: 'I wish I ___ more time yesterday.',     options: ['have', 'had', 'will have', 'would have'],                  correct: 'had',               difficulty_score: 4 },
  { type: 'grammar', id: 'g4b', word: 'being',             sentence: 'Despite ___ tired, she continued.',     options: ['be', 'to be', 'being', 'been'],                            correct: 'being',             difficulty_score: 4 },
  { type: 'grammar', id: 'g4c', word: 'must be finished',  sentence: 'The report ___ by tomorrow.',           options: ['must finish', 'must be finished', 'must finished', 'is finishing'], correct: 'must be finished', difficulty_score: 4 },
  { type: 'grammar', id: 'g4d', word: 'had',               sentence: 'No sooner ___ we sat down than it rained.', options: ['had', 'have', 'did', 'does'],                         correct: 'had',               difficulty_score: 4 },
  // Difficulty 5 — advanced
  { type: 'grammar', id: 'g5a', word: 'made',             sentence: 'It is high time we ___ a decision.',          options: ['make', 'made', 'making', 'to make'],                            correct: 'made',             difficulty_score: 5 },
  { type: 'grammar', id: 'g5b', word: 'had',              sentence: 'Scarcely ___ he spoken when she interrupted.', options: ['had', 'has', 'did', 'does'],                                    correct: 'had',              difficulty_score: 5 },
  { type: 'grammar', id: 'g5c', word: "wouldn't have",    sentence: "Were it not for your help, I ___ succeeded.",  options: ["wouldn't have", "didn't", "couldn't", "shouldn't have"],        correct: "wouldn't have",    difficulty_score: 5 },
  { type: 'grammar', id: 'g5d', word: 'be',               sentence: 'The doctor suggested that he ___ more careful.', options: ['is', 'are', 'be', 'was'],                                   correct: 'be',               difficulty_score: 5 },
];

// ── Level metadata ────────────────────────────────────────────────────────────
const LEVEL_META: Record<string, {
  emoji: string; label: string; color: string; bg: string;
  description: string; topics: string; convoLabel: string;
}> = {
  beginner:          { emoji: '🌱', label: 'Beginner',        color: '#2E7D32', bg: '#E8F5E9', description: "You're just starting out! You can recognise basic everyday words and simple phrases.", topics: 'Animals, colors, numbers, family, body parts',                 convoLabel: 'Level 1 – Simple greetings & introductions' },
  elementary:        { emoji: '🌿', label: 'Elementary',       color: '#1565C0', bg: '#E3F2FD', description: "Great foundation! You know everyday words and can form simple sentences.",            topics: 'Food, clothes, home, weather, school',                       convoLabel: 'Level 2 – Short everyday conversations' },
  'pre-intermediate':{ emoji: '🌳', label: 'Pre-Intermediate', color: '#E65100', bg: '#FFF3E0', description: "Good progress! You can communicate on familiar topics with some support.",            topics: 'Travel, hobbies, jobs, shopping, sports',                    convoLabel: 'Level 3 – Everyday topics & opinions' },
  intermediate:      { emoji: '⭐', label: 'Intermediate',     color: '#6A1B9A', bg: '#F3E5F5', description: "Well done! You can handle most everyday situations and express clear opinions.",      topics: 'News, health, technology, culture',                          convoLabel: 'Level 4 – Complex discussions' },
  advanced:          { emoji: '🏆', label: 'Advanced',         color: '#B71C1C', bg: '#FFEBEE', description: "Excellent! You have a strong command of English with near-native fluency.",          topics: 'All topics including expert variants',                       convoLabel: 'Level 5 – Fluent, nuanced conversations' },
};

// ── Scoring ───────────────────────────────────────────────────────────────────
function scoreToLevel(score: number): { tier: DifficultyTier; convoLevel: number } {
  const pct = score / TOTAL_QUESTIONS;
  if (pct >= 0.87) return { tier: 'advanced',          convoLevel: 5 };
  if (pct >= 0.67) return { tier: 'intermediate',      convoLevel: 4 };
  if (pct >= 0.47) return { tier: 'pre-intermediate',  convoLevel: 3 };
  if (pct >= 0.27) return { tier: 'elementary',        convoLevel: 2 };
  return                        { tier: 'beginner',           convoLevel: 1 };
}

// ── Question helpers ──────────────────────────────────────────────────────────
function pickWord(
  bank: WordBank[],
  usedIds: Set<string>,
  usedTopics: Set<string>,
  targetDiff: number,
): WordBank | null {
  for (let delta = 0; delta <= 4; delta++) {
    const inRange = (w: WordBank) =>
      w.difficulty_score === targetDiff + delta ||
      w.difficulty_score === targetDiff - delta;

    // Prefer unused topics
    const preferred = bank.filter(w => !usedIds.has(w.id) && inRange(w) && !usedTopics.has(w.topic_id));
    if (preferred.length) return preferred[Math.floor(Math.random() * preferred.length)];

    const fallback = bank.filter(w => !usedIds.has(w.id) && inRange(w));
    if (fallback.length) return fallback[Math.floor(Math.random() * fallback.length)];
  }
  return null;
}

function pickGrammar(usedIds: Set<string>, targetDiff: number): PlacementQuestion | null {
  for (let delta = 0; delta <= 4; delta++) {
    const candidates = GRAMMAR_BANK.filter(
      q => !usedIds.has(q.id) &&
        (q.difficulty_score === targetDiff + delta || q.difficulty_score === targetDiff - delta),
    );
    if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return null;
}

function buildVocabQuestion(
  word: WordBank,
  bank: WordBank[],
  qIndex: number,
): PlacementQuestion {
  const distractors = [
    ...bank.filter(w => w.id !== word.id && w.topic_id === word.topic_id),
    ...bank.filter(w => w.id !== word.id && w.topic_id !== word.topic_id),
  ].sort(() => Math.random() - 0.5).slice(0, 3);

  const options = [word.word, ...distractors.map(w => w.word)].sort(() => Math.random() - 0.5);

  // First 3 questions → picture quiz (visual warm-up); after that prefer definition quiz
  let type: QuestionType;
  if (qIndex < 3 && word.image_url) {
    type = 'picture_quiz';
  } else if (word.definition) {
    type = 'definition_quiz';
  } else {
    type = 'picture_quiz';
  }

  return {
    id: word.id,
    type,
    word: word.word,
    image_url: word.image_url,
    definition: word.definition ?? undefined,
    options,
    correct: word.word,
    difficulty_score: word.difficulty_score,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PlacementTestScreen() {
  const [screen, setScreen]         = useState<Screen>('intro');
  const [bank, setBank]             = useState<WordBank[]>([]);
  const [questions, setQuestions]   = useState<PlacementQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore]           = useState(0);
  const [selected, setSelected]     = useState<string | null>(null);
  const [skipped, setSkipped]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState<{ tier: DifficultyTier; convoLevel: number } | null>(null);

  const slideAnim  = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const usedWordIds    = useRef(new Set<string>());
  const usedGrammarIds = useRef(new Set<string>());
  const usedTopicIds   = useRef(new Set<string>());
  const difficultyRef  = useRef(START_DIFFICULTY);
  const scoreRef       = useRef(0);
  const grammarCountRef = useRef(0);

  const { session, fetchProfile } = useAuthStore();
  const router = useRouter();

  useEffect(() => { loadBank(); }, []);

  async function loadBank() {
    const { data: words } = await supabase
      .from('words')
      .select('id, word, image_url, definition, topic_id, difficulty_score');

    if (!words || words.length < TOTAL_QUESTIONS) {
      setLoading(false);
      return;
    }
    setBank(words);

    // Pre-generate first question (picture quiz warm-up)
    const first = pickWord(words, usedWordIds.current, usedTopicIds.current, START_DIFFICULTY);
    if (first) {
      usedWordIds.current.add(first.id);
      usedTopicIds.current.add(first.topic_id);
      setQuestions([buildVocabQuestion(first, words, 0)]);
    }
    setLoading(false);
  }

  function animateIn() {
    slideAnim.setValue(40);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.timing(slideAnim,  { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(opacityAnim,{ toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
  }

  function speakWord(word: string) {
    if (Platform.OS === 'web') return;
    Speech.speak(word, { language: 'en-US', rate: 0.85 });
  }

  // Called when question animates in
  useEffect(() => {
    if (screen === 'test' && questions[currentIndex]) {
      animateIn();
      const q = questions[currentIndex];
      if (q.type !== 'grammar') speakWord(q.word);
    }
  }, [currentIndex, screen]);

  function getNextQuestion(nextDiff: number, nextIndex: number): PlacementQuestion | null {
    // Ensure at least 5 grammar questions across 15 — start introducing grammar at Q3
    const wantGrammar = nextIndex >= 3 && (
      grammarCountRef.current < 5 ||
      (nextDiff >= 3 && Math.random() < 0.5)
    );

    if (wantGrammar) {
      const g = pickGrammar(usedGrammarIds.current, nextDiff);
      if (g) {
        usedGrammarIds.current.add(g.id);
        grammarCountRef.current += 1;
        return g;
      }
    }

    const word = pickWord(bank, usedWordIds.current, usedTopicIds.current, nextDiff);
    if (word) {
      usedWordIds.current.add(word.id);
      usedTopicIds.current.add(word.topic_id);
      return buildVocabQuestion(word, bank, nextIndex);
    }
    return null;
  }

  function handleSelect(option: string) {
    if (selected || skipped || submitting) return;
    setSelected(option);

    const isCorrect = option === questions[currentIndex].correct;
    if (isCorrect) {
      scoreRef.current += 1;
      setScore(scoreRef.current);
    }

    const nextDiff = Math.min(5, Math.max(1, difficultyRef.current + (isCorrect ? 1 : -1)));
    difficultyRef.current = nextDiff;

    setTimeout(() => advance(nextDiff), 950);
  }

  function handleSkip() {
    if (selected || skipped || submitting) return;
    setSkipped(true);
    // Show correct answer briefly, then advance
    setSelected(questions[currentIndex].correct);

    const nextDiff = Math.max(1, difficultyRef.current - 1);
    difficultyRef.current = nextDiff;

    setTimeout(() => advance(nextDiff), 950);
  }

  function advance(nextDiff: number) {
    const nextIndex = currentIndex + 1;

    if (nextIndex >= TOTAL_QUESTIONS) {
      finishTest(scoreRef.current);
      return;
    }

    const nextQ = getNextQuestion(nextDiff, nextIndex);
    if (nextQ) setQuestions(prev => [...prev, nextQ]);

    setCurrentIndex(nextIndex);
    setSelected(null);
    setSkipped(false);
  }

  async function skipTest() {
    setSubmitting(true);
    try {
      if (session?.user.id) {
        await supabase
          .from('user_profiles')
          .update({ starting_level: 'beginner', convo_level: 1 })
          .eq('id', session.user.id);
        await fetchProfile(session.user.id);
      }
    } catch (e) {
      console.warn('skipTest error:', e);
    } finally {
      setSubmitting(false);
      router.replace('/(tabs)/');
    }
  }

  async function finishTest(finalScore: number) {
    setSubmitting(true);
    const levelResult = scoreToLevel(finalScore);
    setResult(levelResult);

    try {
      if (session?.user.id) {
        await supabase
          .from('user_profiles')
          .update({
            placement_score: finalScore,
            starting_level: levelResult.tier,
            convo_level: levelResult.convoLevel,
          })
          .eq('id', session.user.id);

        await fetchProfile(session.user.id);
      }
    } catch (e) {
      console.warn('finishTest error:', e);
    } finally {
      setSubmitting(false);
      setScreen('result');
    }
  }

  function handleStartLearning() {
    router.replace('/(tabs)/');
  }

  // ── Intro screen ─────────────────────────────────────────────────────────────
  if (screen === 'intro') {
    return (
      <View style={styles.introContainer}>
        <Text style={styles.introEmoji}>📝</Text>
        <Text style={styles.introTitle}>Placement Test</Text>
        <Text style={styles.introSubtitle}>Let's find your English level</Text>

        <View style={styles.infoCard}>
          {[
            ['⏱️', '~3 minutes', 'Quick and easy'],
            ['🔢', '15 questions', 'Vocabulary & grammar'],
            ['📊', 'Adaptive',     'Gets harder as you go'],
            ['🎯', 'No penalty',   'Skip if you\'re unsure'],
          ].map(([icon, title, sub]) => (
            <View key={title} style={styles.infoRow}>
              <Text style={styles.infoIcon}>{icon}</Text>
              <View>
                <Text style={styles.infoTitle}>{title}</Text>
                <Text style={styles.infoSub}>{sub}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => { setScreen('test'); }}
          disabled={loading || submitting}
        >
          {loading
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={styles.btnText}>Start Test →</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipIntroBtn}
          onPress={skipTest}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator size="small" color={Colors.textMuted} />
            : <Text style={styles.skipIntroText}>Skip — start as Beginner</Text>
          }
        </TouchableOpacity>

        <Text style={styles.skipNote}>
          You can retake this test anytime in Profile.
        </Text>
      </View>
    );
  }

  // ── Result screen ─────────────────────────────────────────────────────────────
  if (screen === 'result' && result) {
    const meta = LEVEL_META[result.tier];
    const pct  = Math.round((score / TOTAL_QUESTIONS) * 100);
    return (
      <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultContainer}>
        <View style={[styles.resultBadge, { backgroundColor: meta.bg, borderColor: meta.color }]}>
          <Text style={styles.resultEmoji}>{meta.emoji}</Text>
          <Text style={[styles.resultLevel, { color: meta.color }]}>{meta.label}</Text>
        </View>

        <Text style={styles.resultScore}>{score} / {TOTAL_QUESTIONS} correct ({pct}%)</Text>
        <Text style={styles.resultDesc}>{meta.description}</Text>

        <View style={styles.resultCard}>
          <Text style={styles.resultCardTitle}>🔓 Topics unlocked</Text>
          <Text style={styles.resultCardBody}>{meta.topics}</Text>
        </View>

        <View style={styles.resultCard}>
          <Text style={styles.resultCardTitle}>💬 Speaking practice</Text>
          <Text style={styles.resultCardBody}>{meta.convoLabel}</Text>
        </View>

        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, { marginTop: 8 }]}
          onPress={handleStartLearning}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={styles.btnText}>Start Learning 🚀</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Test screen ───────────────────────────────────────────────────────────────
  if (loading || questions.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Preparing your test…</Text>
      </View>
    );
  }

  const current = questions[currentIndex];
  if (!current) return null;

  const progress = ((currentIndex) / TOTAL_QUESTIONS) * 100;
  const isAnswered = !!selected;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Placement Test</Text>
        <Text style={styles.counter}>{currentIndex + 1} / {TOTAL_QUESTIONS}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: opacityAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Question type badge */}
          <View style={styles.typeBadgeRow}>
            <View style={[styles.typeBadge, current.type === 'grammar' && styles.typeBadgeGrammar]}>
              <Text style={styles.typeBadgeText}>
                {current.type === 'picture_quiz'    ? '🖼️ Picture'
                  : current.type === 'definition_quiz' ? '📖 Definition'
                  : '✏️ Grammar'}
              </Text>
            </View>
            {current.type !== 'grammar' && (
              <TouchableOpacity onPress={() => speakWord(current.word)} style={styles.ttsBtn}>
                <Text style={styles.ttsBtnText}>🔊</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Question content */}
          {current.type === 'picture_quiz' && current.image_url && (
            <>
              <Image
                source={{ uri: current.image_url }}
                style={styles.image}
                contentFit="cover"
              />
              <Text style={styles.instruction}>What word matches this picture?</Text>
            </>
          )}

          {current.type === 'definition_quiz' && current.definition && (
            <View style={styles.definitionBox}>
              <Text style={styles.definitionText}>"{current.definition}"</Text>
              <Text style={styles.instruction}>Which word matches this definition?</Text>
            </View>
          )}

          {current.type === 'grammar' && current.sentence && (
            <View style={styles.grammarBox}>
              <Text style={styles.grammarSentence}>
                {current.sentence.replace('___', '______')}
              </Text>
              <Text style={styles.instruction}>Choose the correct word to fill the blank.</Text>
            </View>
          )}

          {/* Options */}
          <View style={styles.options}>
            {current.options.map((option) => {
              const isSelected = selected === option;
              const isCorrect  = option === current.correct;
              let bg     = Colors.surface;
              let border = Colors.border;
              if (isSelected &&  isCorrect)  { bg = Colors.successLight; border = Colors.success; }
              if (isSelected && !isCorrect)  { bg = Colors.errorLight;   border = Colors.error; }
              if (isAnswered && !isSelected && isCorrect) { bg = Colors.successLight; border = Colors.success; }

              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.option, { backgroundColor: bg, borderColor: border }]}
                  onPress={() => handleSelect(option)}
                  disabled={isAnswered}
                >
                  <Text style={styles.optionText}>{option}</Text>
                  {isAnswered && isCorrect && <Text style={styles.optionCheck}>✓</Text>}
                  {isSelected && !isCorrect && <Text style={styles.optionX}>✗</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* I don't know */}
          {!isAnswered && (
            <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
              <Text style={styles.skipText}>I don't know — skip</Text>
            </TouchableOpacity>
          )}

        </Animated.View>
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

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Intro ──────────────────────────────────────────────────────────────────
  introContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 28,
    paddingTop: 80,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 16,
  },
  introEmoji:    { fontSize: 64, marginBottom: 4 },
  introTitle:    { fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold, color: Colors.text, textAlign: 'center' },
  introSubtitle: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', marginBottom: 8 },
  infoCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingVertical: 8,
    paddingHorizontal: 20,
    gap: 4,
  },
  skipIntroBtn: { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  skipIntroText: { fontSize: FontSize.base, color: Colors.textMuted, textDecorationLine: 'underline' },
  skipNote: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 16 },
  infoRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  infoIcon:  { fontSize: 24, width: 32, textAlign: 'center' },
  infoTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.text },
  infoSub:   { fontSize: FontSize.sm, color: Colors.textMuted },

  // ── Result ──────────────────────────────────────────────────────────────────
  resultScroll: { flex: 1, backgroundColor: Colors.background },
  resultContainer: {
    paddingHorizontal: 28,
    paddingTop: 80,
    paddingBottom: 48,
    alignItems: 'center',
    gap: 16,
  },
  resultBadge: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  resultEmoji: { fontSize: 48 },
  resultLevel: { fontSize: FontSize.lg, fontWeight: FontWeight.extrabold, marginTop: 4 },
  resultScore: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  resultDesc:  { fontSize: FontSize.base, color: Colors.text, textAlign: 'center', lineHeight: 22 },
  resultCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 16,
    gap: 4,
  },
  resultCardTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text },
  resultCardBody:  { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  // ── Test ───────────────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40, paddingTop: 8 },
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
  headerLabel: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  counter:     { fontSize: FontSize.base, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  progressBar: {
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 20,
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },

  typeBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  typeBadge: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  typeBadgeGrammar: { backgroundColor: '#FFF3E0' },
  typeBadgeText:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  ttsBtn:     { padding: 6 },
  ttsBtnText: { fontSize: 20 },

  image: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    marginBottom: 12,
    backgroundColor: Colors.surfaceAlt,
  },
  instruction: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },

  definitionBox: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 20,
    marginBottom: 20,
    gap: 10,
  },
  definitionText: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 24,
  },

  grammarBox: {
    backgroundColor: '#FFF8E1',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FFD54F',
    padding: 20,
    marginBottom: 20,
    gap: 10,
  },
  grammarSentence: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 32,
  },

  options: { gap: 12, marginBottom: 16 },
  option: {
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText:  { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text, flex: 1 },
  optionCheck: { fontSize: 18, color: Colors.success },
  optionX:     { fontSize: 18, color: Colors.error },

  skipBtn: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  skipText: {
    fontSize: FontSize.base,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },

  loadingText: { fontSize: FontSize.base, color: Colors.textSecondary, marginTop: 12 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245,236,215,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },

  // ── Shared buttons ──────────────────────────────────────────────────────────
  btn: {
    width: '100%',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: Colors.primary },
  btnText:    { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.white },
});
