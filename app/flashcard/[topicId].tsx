import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import type { Word } from '@/lib/database.types';

const { width: W, height: H } = Dimensions.get('window');
const SWIPE_THRESHOLD = W * 0.3;
const ROTATION_RANGE = 12; // degrees

export default function FlashcardScreen() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const router      = useRouter();
  const { session } = useAuthStore();

  const [words, setWords]         = useState<Word[]>([]);
  const [index, setIndex]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [knownIds, setKnownIds]   = useState<Set<string>>(new Set());
  const [reviewIds, setReviewIds] = useState<Set<string>>(new Set());
  const [done, setDone]           = useState(false);
  const [flipped, setFlipped]     = useState(false);
  const [slowMode, setSlowMode]   = useState(false);
  const flipAnim  = useRef(new Animated.Value(0)).current;
  const pan       = useRef(new Animated.ValueXY()).current;
  const swipeDir  = useRef<'left' | 'right' | null>(null);

  // Refs that always hold the latest words/index — avoids stale closure in PanResponder
  const wordsRef     = useRef<Word[]>([]);
  const indexRef     = useRef(0);
  const swipeOutRef  = useRef<(dir: 'left' | 'right') => void>(() => {});

  useEffect(() => { wordsRef.current = words; }, [words]);
  useEffect(() => { indexRef.current = index; }, [index]);

  useEffect(() => { loadWords(); }, []);

  async function loadWords() {
    const { data } = await supabase.from('words').select('*').eq('topic_id', topicId).order('difficulty_score');
    setWords(data as Word[] ?? []);
    setLoading(false);
  }

  // ── Flip animation ─────────────────────────────────────────────────────────
  function flipCard() {
    const toValue = flipped ? 0 : 1;
    Animated.spring(flipAnim, { toValue, useNativeDriver: true, tension: 80, friction: 8 }).start();
    setFlipped(!flipped);
    Haptics.selectionAsync().catch(() => {});
  }

  const frontInterpolate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backInterpolate  = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const frontOpacity     = flipAnim.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const backOpacity      = flipAnim.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [0, 0, 1, 1] });

  // ── Swipe pan responder ────────────────────────────────────────────────────
  // PanResponder is frozen at creation — it calls swipeOutRef.current which is always fresh
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) {
          swipeDir.current = 'right';
          swipeOutRef.current('right');
        } else if (g.dx < -SWIPE_THRESHOLD) {
          swipeDir.current = 'left';
          swipeOutRef.current('left');
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  function swipeOut(dir: 'left' | 'right') {
    // Use refs so animation callback always sees current words/index, not stale closure
    const current = wordsRef.current[indexRef.current];
    if (!current) return;
    const currentId = current.id;
    const toX = dir === 'right' ? W * 1.5 : -W * 1.5;
    Haptics.impactAsync(dir === 'right' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.timing(pan, { toValue: { x: toX, y: 0 }, duration: 250, useNativeDriver: false }).start(() => {
      if (dir === 'right') setKnownIds((s) => new Set(s).add(currentId));
      else setReviewIds((s) => new Set(s).add(currentId));
      saveWordStat(currentId, dir === 'right');
      advanceCard();
    });
  }

  // Keep swipeOutRef current every render so PanResponder always calls the latest version
  swipeOutRef.current = swipeOut;

  function advanceCard() {
    pan.setValue({ x: 0, y: 0 });
    flipAnim.setValue(0);
    setFlipped(false);
    swipeDir.current = null;
    setIndex((i) => {
      if (i + 1 >= words.length) { setDone(true); return i; }
      return i + 1;
    });
  }

  async function saveWordStat(wordId: string, correct: boolean) {
    if (!session) return;
    const { data: existing } = await supabase.from('user_word_stats').select('*')
      .eq('user_id', session.user.id).eq('word_id', wordId).single();
    if (existing) {
      await supabase.from('user_word_stats').update({
        correct_count: existing.correct_count + (correct ? 1 : 0),
        wrong_count: existing.wrong_count + (correct ? 0 : 1),
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('user_word_stats').insert({
        user_id: session.user.id, word_id: wordId,
        correct_count: correct ? 1 : 0, wrong_count: correct ? 0 : 1,
        interval_days: 1, next_review_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
    }
  }

  function speakWord(word: string, definition?: string | null) {
    try {
      Speech.stop();
      Speech.speak(definition ? `${word}. ${definition}` : word, { language: 'en-US', rate: slowMode ? 0.55 : 0.85 });
    } catch { /* ignore */ }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  // ── Done screen ────────────────────────────────────────────────────────────
  if (done || index >= words.length) {
    const known  = knownIds.size;
    const review = reviewIds.size;
    const total  = words.length;
    const pct    = Math.round((known / total) * 100);
    return (
      <View style={s.doneContainer}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={s.doneEmoji}>{pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📚'}</Text>
        <Text style={s.doneTitle}>Session Done!</Text>
        <Text style={s.doneSub}>{total} cards reviewed</Text>

        <View style={s.doneStats}>
          <View style={[s.doneStat, { backgroundColor: Colors.successLight }]}>
            <Text style={s.doneStatNum}>{known}</Text>
            <Text style={s.doneStatLabel}>Got it ✓</Text>
          </View>
          <View style={[s.doneStat, { backgroundColor: Colors.errorLight }]}>
            <Text style={s.doneStatNum}>{review}</Text>
            <Text style={s.doneStatLabel}>Review again</Text>
          </View>
        </View>

        <TouchableOpacity style={s.primaryBtn} onPress={() => router.back()}>
          <Text style={s.primaryBtnText}>Back to Topics</Text>
        </TouchableOpacity>
        {review > 0 && (
          <TouchableOpacity style={s.outlineBtn} onPress={() => {
            const reviewList = words.filter((w) => reviewIds.has(w.id));
            setWords(reviewList);
            setIndex(0);
            setKnownIds(new Set());
            setReviewIds(new Set());
            setDone(false);
            pan.setValue({ x: 0, y: 0 });
            flipAnim.setValue(0);
            setFlipped(false);
          }}>
            <Text style={s.outlineBtnText}>Review {review} again</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Card ───────────────────────────────────────────────────────────────────
  const card = words[index];
  const progress = (index / words.length) * 100;
  const rotate = pan.x.interpolate({ inputRange: [-W / 2, 0, W / 2], outputRange: [`-${ROTATION_RANGE}deg`, '0deg', `${ROTATION_RANGE}deg`] });
  const knownOpacity  = pan.x.interpolate({ inputRange: [0, W * 0.2], outputRange: [0, 1], extrapolate: 'clamp' });
  const reviewOpacity = pan.x.interpolate({ inputRange: [-W * 0.2, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.primary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.counter}>{index + 1} / {words.length}</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity
            style={[s.slowBtn, slowMode && s.slowBtnActive]}
            onPress={() => setSlowMode((v) => !v)}
          >
            <Text style={[s.slowBtnText, slowMode && s.slowBtnTextActive]}>🐢</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => speakWord(card.word, card.definition)}>
            <Ionicons name="volume-high" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress bar */}
      <View style={s.progressBar}>
        <View style={[s.progressFill, { width: `${progress}%` as any }]} />
        <View style={[s.knownFill, { width: `${(knownIds.size / words.length) * 100}%` as any }]} />
      </View>

      {/* Swipe labels */}
      <View style={s.swipeLabels}>
        <Animated.View style={[s.swipeLabel, s.reviewLabel, { opacity: reviewOpacity }]}>
          <Text style={s.swipeLabelText}>↩ Review</Text>
        </Animated.View>
        <Animated.View style={[s.swipeLabel, s.knownLabel, { opacity: knownOpacity }]}>
          <Text style={s.swipeLabelText}>Got it ✓</Text>
        </Animated.View>
      </View>

      {/* Card stack — show next card behind */}
      {index + 1 < words.length && (
        <View style={[s.cardBehind]}>
          {words[index + 1].image_url
            ? <Image source={{ uri: words[index + 1].image_url! }} style={s.cardImageBehind} contentFit="contain" />
            : <View style={[s.cardImageBehind, s.cardPlaceholder]} />
          }
        </View>
      )}

      {/* Main card — swipeable */}
      <Animated.View
        style={[s.card, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity activeOpacity={1} onPress={flipCard} style={StyleSheet.absoluteFill}>
          {/* Front: image + word */}
          <Animated.View style={[s.cardFace, { opacity: frontOpacity, transform: [{ rotateY: frontInterpolate }] }]}>
            {card.image_url
              ? <Image source={{ uri: card.image_url }} style={s.cardImage} contentFit="contain" />
              : <View style={[s.cardImage, s.cardPlaceholder]}>
                  <Text style={s.placeholderEmoji}>📷</Text>
                </View>
            }
            <View style={s.cardFooter}>
              <Text style={s.cardWord}>{card.word}</Text>
              <Text style={s.tapHint}>Tap to see definition</Text>
            </View>
          </Animated.View>

          {/* Back: definition */}
          <Animated.View style={[s.cardFace, s.cardBack, { opacity: backOpacity, transform: [{ rotateY: backInterpolate }] }]}>
            {card.image_url
              ? <Image source={{ uri: card.image_url }} style={[s.cardImage, { opacity: 0.35 }]} contentFit="contain" blurRadius={4} />
              : <View style={[s.cardImage, s.cardPlaceholder, { opacity: 0.2 }]} />
            }
            <View style={[s.cardFooter, s.cardBackFooter]}>
              <Text style={s.cardWordBack}>{card.word}</Text>
              {card.definition
                ? <Text style={s.cardDefinition}>{card.definition}</Text>
                : <Text style={s.cardDefPlaceholder}>No definition yet</Text>
              }
              <TouchableOpacity style={s.speakBubble} onPress={() => speakWord(card.word, card.definition)}>
                <Ionicons name="volume-high" size={16} color={Colors.primary} />
                <Text style={s.speakBubbleText}>Sound out</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

      {/* Bottom action buttons */}
      <View style={s.actions}>
        <TouchableOpacity style={[s.actionBtn, s.reviewBtn]} onPress={() => swipeOut('left')}>
          <Ionicons name="refresh" size={20} color={Colors.error} />
          <Text style={[s.actionBtnText, { color: Colors.error }]}>Review again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.flipBtn} onPress={flipCard}>
          <Ionicons name="sync" size={18} color={Colors.white} />
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, s.knownBtn]} onPress={() => swipeOut('right')}>
          <Text style={[s.actionBtnText, { color: Colors.success }]}>Got it!</Text>
          <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
        </TouchableOpacity>
      </View>

      {/* Swipe hint on first card */}
      {index === 0 && (
        <View style={s.swipeHint}>
          <Text style={s.swipeHintText}>← Swipe left to review · Swipe right if you know it →</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: Colors.background },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 10 },
  headerCenter: { alignItems: 'center' },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  counter:      { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.text },
  slowBtn:      { borderRadius: 14, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  slowBtnActive:{ borderColor: Colors.primary, backgroundColor: Colors.primary + '18' },
  slowBtnText:  { fontSize: 16 },
  slowBtnTextActive: {},

  progressBar:  { height: 6, backgroundColor: Colors.border, marginHorizontal: 20, borderRadius: 3, overflow: 'hidden' },
  progressFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: Colors.border },
  knownFill:    { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: Colors.success },

  swipeLabels:  { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 30, marginTop: 10 },
  swipeLabel:   { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 2 },
  reviewLabel:  { borderColor: Colors.error,   backgroundColor: Colors.errorLight   + 'AA' },
  knownLabel:   { borderColor: Colors.success, backgroundColor: Colors.successLight + 'AA' },
  swipeLabelText: { fontSize: FontSize.sm, fontWeight: FontWeight.extrabold },

  // Card shadow card behind
  cardBehind: {
    position: 'absolute', top: 100, left: 24, right: 24, bottom: 130,
    borderRadius: 28, overflow: 'hidden', backgroundColor: Colors.surface,
    transform: [{ scale: 0.95 }], opacity: 0.6,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
  cardImageBehind: { width: '100%', height: '100%' },

  card: {
    position: 'absolute', top: 96, left: 20, right: 20, bottom: 126,
    borderRadius: 28, overflow: 'hidden', backgroundColor: Colors.surface,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  cardFace:   { ...StyleSheet.absoluteFillObject, backfaceVisibility: 'hidden' },
  cardBack:   {},
  cardImage:  { width: '100%', flex: 1 },
  cardPlaceholder: { backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' },
  placeholderEmoji: { fontSize: 48 },

  cardFooter: { padding: 20, backgroundColor: Colors.surface, gap: 4 },
  cardWord:   { fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold, color: Colors.text },
  tapHint:    { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic' },

  cardBackFooter: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', padding: 24, backgroundColor: 'rgba(255,255,255,0.92)', top: undefined },
  cardWordBack:   { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.text, marginBottom: 4 },
  cardDefinition: { fontSize: FontSize.md, color: Colors.text, lineHeight: 26 },
  cardDefPlaceholder: { fontSize: FontSize.base, color: Colors.textMuted, fontStyle: 'italic' },
  speakBubble:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start', backgroundColor: Colors.background, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: Colors.primary + '55' },
  speakBubbleText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold },

  actions:   { position: 'absolute', bottom: 32, left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 18, borderWidth: 2, backgroundColor: Colors.surface },
  reviewBtn: { borderColor: Colors.error + '60' },
  knownBtn:  { borderColor: Colors.success + '60' },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  flipBtn:   { backgroundColor: Colors.primary, borderRadius: 28, padding: 14, shadowColor: Colors.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },

  swipeHint:     { position: 'absolute', bottom: 102, left: 0, right: 0, alignItems: 'center' },
  swipeHintText: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Done screen
  doneContainer: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 28 },
  backBtn:       { position: 'absolute', top: 56, left: 20 },
  doneEmoji:     { fontSize: 64 },
  doneTitle:     { fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold, color: Colors.text },
  doneSub:       { fontSize: FontSize.base, color: Colors.textSecondary },
  doneStats:     { flexDirection: 'row', gap: 16, width: '100%' },
  doneStat:      { flex: 1, borderRadius: 16, padding: 16, alignItems: 'center', gap: 4 },
  doneStatNum:   { fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold, color: Colors.text },
  doneStatLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  primaryBtn:    { backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center' },
  primaryBtnText: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  outlineBtn:    { backgroundColor: Colors.surface, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border },
  outlineBtnText: { color: Colors.text, fontWeight: FontWeight.bold, fontSize: FontSize.md },
});
