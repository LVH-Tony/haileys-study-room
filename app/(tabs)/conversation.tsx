import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useState, useRef, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { useProgressStore } from '@/store/progress.store';
import { playSessionComplete, playLevelUp } from '@/lib/sounds';
import { checkConvoAchievements } from '@/lib/achievements';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import type { ConversationMessage } from '@/lib/database.types';

// ── CURRICULUM (mirrors edge function) ────────────────────────────────────────
const CURRICULUM: Record<number, Array<{ id: string; label: string; emoji: string }>> = {
  1: [
    { id: 'greetings',  label: 'Nice to Meet You',   emoji: '👋' },
    { id: 'shopping',   label: 'At the Store',        emoji: '🛒' },
    { id: 'classroom',  label: 'First Day of School', emoji: '🏫' },
    { id: 'family',     label: 'My Family',            emoji: '👨‍👩‍👧' },
    { id: 'food_basic', label: 'Food I Love',          emoji: '🍜' },
    { id: 'animals',    label: 'Animal Friends',       emoji: '🐾' },
  ],
  2: [
    { id: 'restaurant', label: 'Dinner Out',           emoji: '🍽️' },
    { id: 'weekend',    label: 'Weekend Plans',        emoji: '🗓️' },
    { id: 'travel',     label: 'Dream Vacation',       emoji: '✈️' },
    { id: 'health',     label: "Doctor's Visit",       emoji: '🏥' },
    { id: 'technology', label: 'Tech Talk',            emoji: '📱' },
    { id: 'weather',    label: 'Weather & Seasons',   emoji: '⛅' },
    { id: 'home_life',  label: 'Home Sweet Home',     emoji: '🏠' },
  ],
  3: [
    { id: 'debate_environment', label: 'Climate Change',    emoji: '🌍' },
    { id: 'work_future',        label: 'Future of Work',    emoji: '💼' },
    { id: 'social_media',       label: 'Social Media',      emoji: '📲' },
    { id: 'education',          label: 'Education Systems', emoji: '🎓' },
    { id: 'storytelling',       label: 'Build a Story',     emoji: '📖' },
    { id: 'ethics',             label: 'Moral Dilemmas',    emoji: '⚖️' },
    { id: 'culture',            label: 'My Culture',        emoji: '🌏' },
  ],
  4: [
    { id: 'job_interview',   label: 'Job Interview',        emoji: '👔' },
    { id: 'news_debate',     label: 'News & Media',         emoji: '📰' },
    { id: 'relationships',   label: 'Relationships',        emoji: '💬' },
    { id: 'entertainment',   label: 'Arts & Entertainment', emoji: '🎬' },
    { id: 'city_life',       label: 'City vs Country',      emoji: '🏙️' },
    { id: 'habits',          label: 'Building Good Habits', emoji: '📅' },
    { id: 'global_culture',  label: 'Cultural Differences', emoji: '🤝' },
  ],
  5: [
    { id: 'economy',         label: 'Global Economy',        emoji: '💹' },
    { id: 'ai_ethics',       label: 'AI & Ethics',           emoji: '🤖' },
    { id: 'healthcare',      label: 'Healthcare Access',     emoji: '🏥' },
    { id: 'democracy',       label: 'Democracy & Power',     emoji: '🗳️' },
    { id: 'mental_health',   label: 'Mental Health Society', emoji: '🧘' },
    { id: 'environment_adv', label: 'Environmental Policy',  emoji: '🌱' },
    { id: 'migration',       label: 'Migration & Identity',  emoji: '🗺️' },
  ],
  6: [
    { id: 'philosophy_ethics', label: 'Applied Ethics',       emoji: '⚖️' },
    { id: 'geopolitics',       label: 'Geopolitics',          emoji: '🌐' },
    { id: 'psychology_adv',    label: 'Human Behavior',       emoji: '🧠' },
    { id: 'literature',        label: 'Literary Analysis',    emoji: '📚' },
    { id: 'science_society',   label: 'Science & Society',    emoji: '🔬' },
    { id: 'future_humanity',   label: 'Future of Humanity',   emoji: '🚀' },
    { id: 'cultural_theory',   label: 'Cultural Identity',    emoji: '🎭' },
  ],
};

const LEVEL_META = [
  { level: 1, label: 'Beginner',           color: '#4CAF50', bg: '#E8F5E9' },
  { level: 2, label: 'Elementary',         color: '#FF9800', bg: '#FFF3E0' },
  { level: 3, label: 'Pre-Intermediate',   color: '#9C27B0', bg: '#F3E5F5' },
  { level: 4, label: 'Intermediate',       color: '#1565C0', bg: '#E3F2FD' },
  { level: 5, label: 'Upper-Intermediate', color: '#B71C1C', bg: '#FFEBEE' },
  { level: 6, label: 'Advanced',           color: '#4E342E', bg: '#EFEBE9' },
];

const MAX_EXCHANGES: Record<number, number> = { 1: 5, 2: 6, 3: 7, 4: 8, 5: 8, 6: 10 };
const MAX_LEVELS = 6;

// ── FETCH HELPER ──────────────────────────────────────────────────────────────
const FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/conversation`;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

async function callConversation(body: object | FormData): Promise<Record<string, any>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const authToken = sessionData.session?.access_token ?? ANON_KEY;
  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = { Authorization: `Bearer ${authToken}`, apikey: ANON_KEY };
  if (!isFormData) headers['Content-Type'] = 'application/json';
  const res = await fetch(FUNCTION_URL, { method: 'POST', headers, body: isFormData ? body : JSON.stringify(body) });
  const text = await res.text();
  try { const p = JSON.parse(text); p._status = res.status; return p; }
  catch { return { error: `Non-JSON (HTTP ${res.status})`, detail: text.slice(0, 300), _status: res.status }; }
}

async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// ── TYPES ─────────────────────────────────────────────────────────────────────
type InputMode = 'voice' | 'text';
type Screen = 'map' | 'chat' | 'done';

interface ActiveSession {
  id: string; level: number; scenarioId: string; scenarioLabel: string; scenarioEmoji: string;
  maxExchanges: number; maxPossibleScore: number; exchangeCount: number; score: number;
  currentPrompt: string; isFreePlay: boolean; persona?: string;
}

interface ScenarioProgress { score: number; maxScore: number; }
interface LevelProgress {
  completedCount: number; totalCount: number;
  bestByScenario: Record<string, ScenarioProgress>;
  levelComplete: boolean;
  freePlayCount: number; freePlayXP: number;
}

// ── COMPONENT ─────────────────────────────────────────────────────────────────
export default function ConversationScreen() {
  const [screen, setScreen]             = useState<Screen>('map');
  const [inputMode, setInputMode]       = useState<InputMode>(Platform.OS === 'web' ? 'text' : 'voice');
  const [slowMode, setSlowMode]         = useState(false);
  const [session, setSession]           = useState<ActiveSession | null>(null);
  const [messages, setMessages]         = useState<ConversationMessage[]>([]);
  const [hints, setHints]               = useState<string[]>([]);
  const [loadingHints, setLoadingHints] = useState(false);
  const [recording, setRecording]       = useState(false);
  const [processing, setProcessing]     = useState(false);
  const [textInput, setTextInput]       = useState('');
  const [leveledUp, setLeveledUp]       = useState(false);
  const [progress, setProgress]         = useState<Record<number, LevelProgress>>({});
  const [loadingProgress, setLoadingProgress] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const scrollRef    = useRef<ScrollView>(null);
  const { profile, fetchProfile } = useAuthStore();
  const { fetchLessonHistory } = useProgressStore();

  useFocusEffect(useCallback(() => { loadAllProgress(); }, []));

  async function loadAllProgress() {
    setLoadingProgress(true);
    const userId = await getUid();
    if (!userId) { setLoadingProgress(false); return; }
    const results: Record<number, LevelProgress> = {};
    for (let lvl = 1; lvl <= MAX_LEVELS; lvl++) {
      const data = await callConversation({ action: 'get_level_progress', level: lvl, userId });
      if (!data.error) results[lvl] = {
        completedCount: data.completedCount, totalCount: data.totalCount,
        bestByScenario: data.bestByScenario ?? {}, levelComplete: data.levelComplete,
        freePlayCount: data.freePlayCount ?? 0, freePlayXP: data.freePlayXP ?? 0,
      };
    }
    setProgress(results);
    setLoadingProgress(false);
  }

  // ── START STRUCTURED SESSION ────────────────────────────────────────────────
  async function startSession(level: number, scenarioId: string) {
    setMessages([]); setHints([]); setLeveledUp(false); setProcessing(true);
    const userId = await getUid();
    let data: Record<string, any>;
    try { data = await callConversation({ action: 'start', level, scenarioId, userId }); }
    catch (e: any) { Alert.alert('Network Error', e?.message ?? String(e)); setProcessing(false); return; }
    if (data.error) { Alert.alert('Error', `${data.error}${data.detail ? '\n' + data.detail : ''}`); setProcessing(false); return; }

    const sc = CURRICULUM[level]?.find((s) => s.id === scenarioId);
    setSession({ id: data.sessionId, level, scenarioId, scenarioLabel: sc?.label ?? scenarioId, scenarioEmoji: sc?.emoji ?? '💬', maxExchanges: data.maxExchanges, maxPossibleScore: data.maxPossibleScore, exchangeCount: 0, score: 0, currentPrompt: data.prompt, isFreePlay: false });
    setMessages([{ role: 'ai', content: data.prompt }]);
    setProcessing(false); setScreen('chat');
    playTts(data.prompt);
  }

  // ── START FREE PLAY ─────────────────────────────────────────────────────────
  async function startFreePlay(level: number) {
    setMessages([]); setHints([]); setLeveledUp(false); setProcessing(true);
    const userId = await getUid();
    let data: Record<string, any>;
    try { data = await callConversation({ action: 'generate_free_play', level, userId }); }
    catch (e: any) { Alert.alert('Network Error', e?.message ?? String(e)); setProcessing(false); return; }
    if (data.error) { Alert.alert('Error', `${data.error}${data.detail ? '\n' + data.detail : ''}`); setProcessing(false); return; }

    setSession({ id: data.sessionId, level, scenarioId: 'free_play', scenarioLabel: data.topic, scenarioEmoji: '🎲', maxExchanges: data.maxExchanges, maxPossibleScore: data.maxPossibleScore, exchangeCount: 0, score: 0, currentPrompt: data.prompt, isFreePlay: true, persona: data.persona });
    setMessages([{ role: 'ai', content: data.prompt }]);
    setProcessing(false); setScreen('chat');
    playTts(data.prompt);
  }

  // ── END SESSION EARLY ───────────────────────────────────────────────────────
  async function handleEndEarly() {
    if (!session) return;
    Alert.alert('End Session?', 'Your current progress will be saved and the conversation will close gracefully.', [
      { text: 'Keep Going', style: 'cancel' },
      { text: 'End Session', style: 'destructive', onPress: async () => {
        setProcessing(true);
        const data = await callConversation({ action: 'end_session', sessionId: session.id }).catch(() => ({}));
        if ((data as any).closingMessage) {
          setMessages((prev) => [...prev, { role: 'ai', content: (data as any).closingMessage }]);
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
          playTts((data as any).closingMessage);
        }
        playSessionComplete();
        setSession((prev) => prev ? { ...prev, score: (data as any).sessionScore ?? prev.score } : prev);
        setProcessing(false);
        setTimeout(() => { setScreen('done'); loadAllProgress(); }, 1500);
        const userId = await getUid();
        if (userId) fetchLessonHistory(userId).catch(() => {});
      }},
    ]);
  }

  // ── HINTS ───────────────────────────────────────────────────────────────────
  async function fetchHints() {
    if (!session) return;
    setLoadingHints(true);
    const data = await callConversation({ action: 'get_hints', currentPrompt: session.currentPrompt }).catch(() => ({} as Record<string, any>));
    if (data.hints) setHints(data.hints as string[]);
    setLoadingHints(false);
  }

  // ── VOICE ───────────────────────────────────────────────────────────────────
  async function startRecording() {
    if (Platform.OS === 'web') return;
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert('Permission denied', 'Microphone access is required.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setRecording(true);
    } catch (e: any) { Alert.alert('Recording error', e?.message); }
  }

  async function stopRecordingAndSubmit() {
    if (!recordingRef.current || !session) return;
    setRecording(false); setProcessing(true);
    await recordingRef.current.stopAndUnloadAsync();
    if (Platform.OS !== 'web') {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    }
    const uri = recordingRef.current.getURI();
    recordingRef.current = null;
    if (!uri) { setProcessing(false); return; }

    const userId = await getUid();
    const formData = new FormData();
    formData.append('file', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);
    formData.append('sessionId', session.id);
    formData.append('userId', userId ?? '');
    formData.append('exchangeCount', String(session.exchangeCount));
    formData.append('maxExchanges', String(session.maxExchanges));

    let data: Record<string, any>;
    try { data = await callConversation(formData); }
    catch (e: any) { Alert.alert('Network Error', e?.message); setProcessing(false); return; }
    if (data.error) { Alert.alert('Voice Error', `${data.error}${data.detail ? '\n' + data.detail : ''}`); setProcessing(false); return; }
    handleReply(data);
  }

  // ── TEXT ────────────────────────────────────────────────────────────────────
  async function submitText() {
    const text = textInput.trim();
    if (!text || !session) return;
    setTextInput(''); setHints([]); setProcessing(true);

    const userId = await getUid();
    let data: Record<string, any>;
    try { data = await callConversation({ action: 'text_reply', sessionId: session.id, userId, transcript: text, exchangeCount: session.exchangeCount, maxExchanges: session.maxExchanges }); }
    catch (e: any) { Alert.alert('Network Error', e?.message); setProcessing(false); return; }
    if (data.error) { Alert.alert('Error', `${data.error}${data.detail ? '\n' + data.detail : ''}`); setProcessing(false); return; }
    handleReply(data);
  }

  // ── HANDLE REPLY ────────────────────────────────────────────────────────────
  function handleReply(data: Record<string, any>) {
    const newExchanges = data.exchangeCount ?? ((session?.exchangeCount ?? 0) + 1);
    const newScore = data.sessionScore ?? ((session?.score ?? 0) + (data.evaluation?.points ?? 0));

    setSession((prev) => prev ? { ...prev, exchangeCount: newExchanges, score: newScore, currentPrompt: data.nextPrompt } : prev);
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: data.transcript, evaluation: data.evaluation },
      { role: 'ai', content: data.nextPrompt },
    ]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    setProcessing(false);

    if (data.sessionDone) {
      const didLevelUp = data.leveledUp ?? false;
      setLeveledUp(didLevelUp);
      getUid().then((userId) => {
        if (userId && session) checkConvoAchievements(userId, session.level, didLevelUp).catch(() => {});
        if (userId) fetchLessonHistory(userId).catch(() => {});
      });
      // Let the user see and hear the AI's closing message before transitioning.
      // Wait for TTS to finish, then pause 1.5s; fall back to 10s if TTS never fires onDone.
      const finish = () => { if (didLevelUp) playLevelUp(); else playSessionComplete(); setTimeout(() => { setScreen('done'); loadAllProgress(); }, 1500); };
      const fallback = setTimeout(finish, 10000);
      try {
        Speech.stop();
        Speech.speak(data.nextPrompt, {
          language: 'en-US',
          rate: slowMode ? 0.5 : 0.9,
          onDone: () => { clearTimeout(fallback); finish(); },
          onError: () => { clearTimeout(fallback); finish(); },
        });
      } catch {
        clearTimeout(fallback);
        finish();
      }
    } else {
      playTts(data.nextPrompt);
    }
  }

  function playTts(text: string) {
    try { Speech.stop(); Speech.speak(text, { language: 'en-US', rate: slowMode ? 0.5 : 0.9 }); } catch { /* ok */ }
  }

  async function submitFeedback(msgIndex: number, rating: 'up' | 'down') {
    if (!session) return;
    const userId = await getUid();
    if (!userId) return;
    supabase.from('feedback').insert({ user_id: userId, ref_type: 'convo', ref_id: `${session.id}-${msgIndex}`, rating } as any);
  }

  // ── LEVEL-UP HELPERS ────────────────────────────────────────────────────────
  function calcLevelXP(level: number, lvlData: LevelProgress | undefined) {
    const scenarios = CURRICULUM[level] ?? [];
    const totalCount = scenarios.length;
    let earnedXP = 0;
    for (const sc of scenarios) {
      const best = lvlData?.bestByScenario?.[sc.id];
      if (best) earnedXP += (best.score / best.maxScore) * 100;
    }
    // Free play counts as 50% XP bonus
    earnedXP += (lvlData?.freePlayXP ?? 0) * 0.5;
    const threshold = 60 * totalCount;
    const fastTrackThreshold = 80 * Math.max(totalCount - 1, 1);
    const completedCount = lvlData?.completedCount ?? 0;
    const pct = Math.min(Math.round((earnedXP / threshold) * 100), 100);
    const ready = earnedXP >= threshold || (earnedXP >= fastTrackThreshold && completedCount >= totalCount - 1);
    return { earnedXP, threshold, pct, ready };
  }

  async function applyLevelUp(fromLevel: number) {
    const userId = await getUid();
    if (!userId) return;
    const newLevel = Math.min(fromLevel + 1, MAX_LEVELS);
    await (supabase.from('user_profiles') as any).update({ convo_level: newLevel }).eq('id', userId);
    await fetchProfile(userId);
    playLevelUp();
    const meta = LEVEL_META.find((m) => m.level === newLevel);
    Alert.alert('🎉 Level Up!', `You've unlocked Level ${newLevel} — ${meta?.label ?? ''}!`);
  }

  // ── DONE SCREEN ─────────────────────────────────────────────────────────────
  if (screen === 'done' && session) {
    const pct = session.maxPossibleScore > 0 ? Math.round((session.score / session.maxPossibleScore) * 100) : 0;
    const grade = pct >= 80 ? { text: '🌟 Excellent!', color: '#F9A825' } : pct >= 60 ? { text: '👍 Good job!', color: '#43A047' } : { text: '💪 Keep going!', color: '#E53935' };
    const lvlData = progress[session.level];
    const lvlMeta = LEVEL_META.find((m) => m.level === session.level);

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.doneContent}>
        <Text style={styles.doneEmoji}>{session.scenarioEmoji}</Text>
        <Text style={styles.doneTitle}>{session.isFreePlay ? `Free Play: ${session.scenarioLabel}` : session.scenarioLabel}</Text>
        {session.persona && <Text style={styles.donePersona}>As: {session.persona}</Text>}
        <Text style={styles.doneSubtitle}>Level {session.level} — {lvlMeta?.label}</Text>

        <View style={styles.doneScoreRow}>
          <Text style={styles.doneScore}>{session.score}</Text>
          <Text style={styles.doneScoreMax}>/ {session.maxPossibleScore} pts</Text>
        </View>
        <View style={styles.scoreBar}>
          <View style={[styles.scoreBarFill, { width: `${pct}%` as any, backgroundColor: grade.color }]} />
        </View>
        <Text style={[styles.doneGrade, { color: grade.color }]}>{grade.text}</Text>

        {lvlData && !session.isFreePlay && (
          <View style={styles.lvlProgressBox}>
            <Text style={styles.lvlProgressLabel}>Level {session.level} Progress</Text>
            <View style={styles.lvlProgressRow}>
              {(CURRICULUM[session.level] ?? []).map((sc) => {
                const done = !!lvlData.bestByScenario?.[sc.id];
                return <Text key={sc.id} style={[styles.lvlDot, { color: done ? '#4CAF50' : Colors.border }]}>●</Text>;
              })}
            </View>
            <Text style={styles.lvlProgressCount}>{lvlData.completedCount} / {lvlData.totalCount} sessions · {lvlData.freePlayCount} free play</Text>
          </View>
        )}

        {session.level < MAX_LEVELS && (() => {
          const { pct: xpPct, ready: levelUpReady } = calcLevelXP(session.level, progress[session.level]);
          return (
            <View style={[styles.xpSection, { width: '100%' }]}>
              <View style={styles.xpLabelRow}>
                <Text style={styles.xpLabel}>🚀 Level-up Progress</Text>
                <Text style={styles.xpPct}>{xpPct}%</Text>
              </View>
              <View style={styles.xpBar}>
                <View style={[styles.xpBarFill, { width: `${xpPct}%` as any, backgroundColor: xpPct >= 100 ? '#4CAF50' : lvlMeta?.color }]} />
              </View>
              {levelUpReady && (
                <TouchableOpacity style={styles.levelUpReadyBtn} onPress={() => { applyLevelUp(session.level); setScreen('map'); }}>
                  <Text style={styles.levelUpReadyBtnText}>🎉 Level Up to Level {session.level + 1}!</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {leveledUp && (
          <View style={styles.levelUpBanner}>
            <Text style={styles.levelUpTitle}>🎉 Level Up!</Text>
            <Text style={styles.levelUpSub}>You've completed all Level {session.level} sessions!</Text>
          </View>
        )}

        <View style={styles.doneActions}>
          <TouchableOpacity style={styles.mapBtn} onPress={() => setScreen('map')}>
            <Ionicons name="map-outline" size={18} color={Colors.white} />
            <Text style={styles.mapBtnText}>Back to Map</Text>
          </TouchableOpacity>
          {session.isFreePlay ? (
            <TouchableOpacity style={styles.retryBtn} onPress={() => startFreePlay(session.level)}>
              <Ionicons name="shuffle-outline" size={18} color={Colors.primary} />
              <Text style={styles.retryBtnText}>New Free Play</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.retryBtn} onPress={() => startSession(session.level, session.scenarioId)}>
              <Ionicons name="refresh-outline" size={18} color={Colors.primary} />
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    );
  }

  // ── MAP SCREEN ──────────────────────────────────────────────────────────────
  if (screen === 'map') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.mapContent}>
        <Text style={styles.mapTitle}>Speaking Practice</Text>

        <View style={styles.modeToggle}>
          <TouchableOpacity style={[styles.modeBtn, inputMode === 'voice' && styles.modeBtnActive]} onPress={() => setInputMode('voice')}>
            <Ionicons name="mic" size={16} color={inputMode === 'voice' ? Colors.white : Colors.textSecondary} />
            <Text style={[styles.modeBtnText, inputMode === 'voice' && styles.modeBtnTextActive]}>Voice</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn, inputMode === 'text' && styles.modeBtnActive]} onPress={() => setInputMode('text')}>
            <Ionicons name="chatbubble-ellipses" size={16} color={inputMode === 'text' ? Colors.white : Colors.textSecondary} />
            <Text style={[styles.modeBtnText, inputMode === 'text' && styles.modeBtnTextActive]}>Silent / Type</Text>
          </TouchableOpacity>
        </View>

        {loadingProgress && <ActivityIndicator color={Colors.primary} style={{ marginBottom: 8 }} />}

        {LEVEL_META.map((lvl) => {
          const maxUnlocked = profile?.convo_level ?? 1;
          const isLocked = lvl.level > maxUnlocked;
          const isCurrentLevel = lvl.level === maxUnlocked;
          const lvlData = progress[lvl.level];
          const completedCount = lvlData?.completedCount ?? 0;
          const totalCount = lvlData?.totalCount ?? (CURRICULUM[lvl.level]?.length ?? 0);
          const freePlayCount = lvlData?.freePlayCount ?? 0;
          const { pct: xpPct, ready: levelUpReady } = calcLevelXP(lvl.level, lvlData);

          return (
            <View key={lvl.level} style={[styles.levelBlock, { borderColor: isLocked ? '#D0D0D0' : lvl.color }]}>
              <View style={[styles.levelBlockHeader, { backgroundColor: isLocked ? '#9E9E9E' : lvl.color }]}>
                <Text style={styles.levelBlockTitle}>Level {lvl.level} — {lvl.label}</Text>
                <View style={styles.levelBlockRight}>
                  {isLocked
                    ? <Ionicons name="lock-closed" size={16} color="#fff" />
                    : <Text style={styles.levelBlockCount}>{completedCount}/{totalCount}</Text>
                  }
                </View>
              </View>

              {isLocked ? (
                <View style={styles.lockedBody}>
                  <Ionicons name="lock-closed-outline" size={28} color="#BDBDBD" />
                  <Text style={styles.lockedText}>Complete Level {lvl.level - 1} to unlock</Text>
                </View>
              ) : (
                <>
                  {/* XP level-up bar (not on max level) */}
                  {isCurrentLevel && lvl.level < MAX_LEVELS && (
                    <View style={styles.xpSection}>
                      <View style={styles.xpLabelRow}>
                        <Text style={styles.xpLabel}>🚀 Level-up Progress</Text>
                        <Text style={styles.xpPct}>{xpPct}%</Text>
                      </View>
                      <View style={styles.xpBar}>
                        <View style={[styles.xpBarFill, { width: `${xpPct}%` as any, backgroundColor: xpPct >= 100 ? '#4CAF50' : lvl.color }]} />
                      </View>
                      {levelUpReady ? (
                        <TouchableOpacity style={styles.levelUpReadyBtn} onPress={() => applyLevelUp(lvl.level)}>
                          <Text style={styles.levelUpReadyBtnText}>🎉 Level Up to Level {lvl.level + 1}!</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.xpHint}>
                          {completedCount < totalCount
                            ? `Complete all ${totalCount} sessions at 60%+ avg to level up`
                            : 'Replay sessions to improve your score'}
                        </Text>
                      )}
                    </View>
                  )}

                  <View style={styles.lvlBar}>
                    <View style={[styles.lvlBarFill, { width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` as any : '0%', backgroundColor: lvl.color }]} />
                  </View>

                  {lvl.level === 1 && (
                    <View style={styles.hintNotice}>
                      <Ionicons name="bulb-outline" size={13} color="#856404" />
                      <Text style={styles.hintNoticeText}>Hints available in this level</Text>
                    </View>
                  )}

                  {/* Structured scenario cards */}
                  <View style={styles.scenarioGrid}>
                    {(CURRICULUM[lvl.level] ?? []).map((sc) => {
                      const best = lvlData?.bestByScenario?.[sc.id];
                      const isCompleted = !!best;
                      return (
                        <TouchableOpacity
                          key={sc.id}
                          style={[styles.scenarioCard, isCompleted && styles.scenarioCardDone, processing && styles.scenarioCardDisabled]}
                          onPress={() => !processing && startSession(lvl.level, sc.id)}
                          disabled={processing}
                        >
                          <Text style={styles.scenarioCardEmoji}>{sc.emoji}</Text>
                          <Text style={styles.scenarioCardLabel} numberOfLines={2}>{sc.label}</Text>
                          {isCompleted ? (
                            <View style={styles.scenarioScore}>
                              <Text style={styles.scenarioScoreText}>{best.score}/{best.maxScore}</Text>
                              <Text style={styles.scenarioScoreStar}>⭐</Text>
                            </View>
                          ) : (
                            <Text style={styles.scenarioTap}>Tap to start</Text>
                          )}
                          {isCompleted && <View style={styles.scenarioDoneBadge}><Text style={styles.scenarioDoneText}>✓</Text></View>}
                        </TouchableOpacity>
                      );
                    })}

                    {/* 🎲 Free Play card */}
                    <TouchableOpacity
                      style={[styles.scenarioCard, styles.freePlayCard, processing && styles.scenarioCardDisabled]}
                      onPress={() => !processing && startFreePlay(lvl.level)}
                      disabled={processing}
                    >
                      <Text style={styles.scenarioCardEmoji}>🎲</Text>
                      <Text style={[styles.scenarioCardLabel, { color: lvl.color }]} numberOfLines={2}>Free Play</Text>
                      <Text style={styles.scenarioTap}>{freePlayCount > 0 ? `${freePlayCount}× done` : 'Random topic'}</Text>
                    </TouchableOpacity>
                  </View>

                  {freePlayCount > 0 && (
                    <Text style={styles.freePlayHint}>🎲 {freePlayCount} free play session{freePlayCount !== 1 ? 's' : ''} completed — each counts toward your XP</Text>
                  )}
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  }

  // ── CHAT SCREEN ─────────────────────────────────────────────────────────────
  const progressPct = session ? session.exchangeCount / session.maxExchanges : 0;
  const lvlMeta = LEVEL_META.find((m) => m.level === session?.level);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
      <View style={[styles.chatHeader, { borderBottomColor: lvlMeta?.color ?? Colors.border }]}>
        <TouchableOpacity onPress={() => { setScreen('map'); setSession(null); setMessages([]); setHints([]); Speech.stop(); }}>
          <Text style={styles.backText}>← Map</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>{session?.scenarioEmoji}</Text>
          <Text style={styles.chatTitle} numberOfLines={1}>
            {session?.isFreePlay ? session.scenarioLabel : session?.scenarioLabel}
          </Text>
          {session?.persona && (
            <Text style={styles.personaLabel}>with {session.persona}</Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.slowBtn, slowMode && styles.slowBtnActive]}
            onPress={() => setSlowMode((v) => !v)}
          >
            <Text style={styles.slowBtnText}>🐢</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleEndEarly} style={styles.endBtn}>
            <Ionicons name="stop-circle-outline" size={20} color={Colors.error} />
          </TouchableOpacity>
          {Platform.OS !== 'web' && (
            <TouchableOpacity onPress={() => setInputMode((m) => m === 'voice' ? 'text' : 'voice')}>
              <Ionicons name={inputMode === 'voice' ? 'chatbubble-ellipses-outline' : 'mic-outline'} size={20} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={[styles.progressContainer, { backgroundColor: lvlMeta?.bg ?? Colors.surface }]}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct * 100}%` as any, backgroundColor: lvlMeta?.color ?? Colors.primary }]} />
        </View>
        <Text style={styles.progressLabel}>{session?.exchangeCount ?? 0}/{session?.maxExchanges ?? 6}</Text>
        <Text style={styles.progressScore}>⭐ {session?.score ?? 0} pts</Text>
      </View>

      <ScrollView ref={scrollRef} style={styles.chat} contentContainerStyle={styles.chatContent}>
        {messages.map((msg, i) => (
          <View key={i} style={msg.role === 'ai' ? styles.aiBubble : styles.userBubble}>
            <Text style={[styles.bubbleText, msg.role === 'user' && { color: Colors.white }]}>{msg.content}</Text>
            {msg.role === 'ai' && (
              <TouchableOpacity onPress={() => playTts(msg.content)} style={styles.bubbleSpeakBtn}>
                <Ionicons name="volume-high" size={13} color={Colors.primary} />
              </TouchableOpacity>
            )}
            {msg.evaluation && (
              <View style={styles.evalBox}>
                <Text style={[styles.evalStatus, msg.evaluation.status === 'correct' && { color: Colors.success }, msg.evaluation.status === 'acceptable' && { color: Colors.warning }, msg.evaluation.status === 'preferred' && { color: Colors.error }]}>
                  {msg.evaluation.status === 'correct' ? '✓ Great!' : msg.evaluation.status === 'acceptable' ? '💡 Try this:' : '📝 Better:'}
                </Text>
                {msg.evaluation.preferred_phrasing && <Text style={styles.evalPref}>"{msg.evaluation.preferred_phrasing}"</Text>}
                <Text style={styles.evalPoints}>+{msg.evaluation.points} pts</Text>
                <View style={styles.feedbackRow}>
                  <TouchableOpacity onPress={() => submitFeedback(i, 'up')}><Text>👍</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => submitFeedback(i, 'down')}><Text>👎</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ))}
        {processing && <ActivityIndicator color={Colors.primary} style={{ marginTop: 12 }} />}
      </ScrollView>

      {/* Hints (level 1 only) */}
      {session?.level === 1 && !processing && (
        <View style={styles.hintsArea}>
          {hints.length === 0 ? (
            <TouchableOpacity style={styles.hintBtn} onPress={fetchHints} disabled={loadingHints}>
              {loadingHints ? <ActivityIndicator size="small" color={Colors.primary} /> : <>
                <Ionicons name="bulb-outline" size={14} color={Colors.primary} />
                <Text style={styles.hintBtnText}>Show hints</Text>
              </>}
            </TouchableOpacity>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hintChips}>
              {hints.map((h, i) => (
                <TouchableOpacity key={i} style={styles.hintChip} onPress={() => { setTextInput(h); setHints([]); if (inputMode === 'voice') setInputMode('text'); }}>
                  <Text style={styles.hintChipText}>{h}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setHints([])}><Ionicons name="close-circle" size={18} color={Colors.textMuted} /></TouchableOpacity>
            </ScrollView>
          )}
        </View>
      )}

      {inputMode === 'voice' && Platform.OS !== 'web' ? (
        <View style={styles.micRow}>
          <TouchableOpacity style={[styles.micBtn, recording && styles.micBtnRecording, { backgroundColor: recording ? Colors.error : (lvlMeta?.color ?? Colors.primary) }]} onPress={recording ? stopRecordingAndSubmit : startRecording} disabled={processing}>
            <Ionicons name={recording ? 'stop-circle' : 'mic'} size={32} color={Colors.white} />
            <Text style={styles.micLabel}>{recording ? 'Tap to send' : 'Tap to speak'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.textRow}>
          <TextInput style={styles.textInput} value={textInput} onChangeText={setTextInput} placeholder="Type your answer…" placeholderTextColor={Colors.textMuted} multiline returnKeyType="send" onSubmitEditing={submitText} editable={!processing} />
          <TouchableOpacity style={[styles.sendBtn, (!textInput.trim() || processing) && styles.sendBtnDisabled, { backgroundColor: textInput.trim() && !processing ? (lvlMeta?.color ?? Colors.primary) : Colors.border }]} onPress={submitText} disabled={!textInput.trim() || processing}>
            <Ionicons name="send" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  mapContent: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 40, gap: 20 },
  mapTitle: { fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold, color: Colors.text },

  modeToggle: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden' },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  modeBtnActive: { backgroundColor: Colors.primary },
  modeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  modeBtnTextActive: { color: Colors.white },

  levelBlock: { borderRadius: 18, borderWidth: 2, overflow: 'hidden', backgroundColor: Colors.surface },
  levelBlockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  levelBlockTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.white },
  levelBlockRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelBlockCount: { fontSize: FontSize.sm, color: Colors.white, fontWeight: FontWeight.bold },
  lockedBody: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  lockedText: { fontSize: FontSize.sm, color: '#9E9E9E', textAlign: 'center' },

  xpSection: { marginHorizontal: 16, marginTop: 12, marginBottom: 2, gap: 4 },
  xpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  xpLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  xpPct: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.text },
  xpBar: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  xpBarFill: { height: '100%', borderRadius: 4 },
  xpHint: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  levelUpReadyBtn: { marginTop: 6, backgroundColor: '#4CAF50', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center' },
  levelUpReadyBtnText: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.sm },

  lvlBar: { height: 4, backgroundColor: Colors.border, marginHorizontal: 16, marginTop: 10, borderRadius: 2, overflow: 'hidden' },
  lvlBarFill: { height: '100%', borderRadius: 2 },
  hintNotice: { flexDirection: 'row', alignItems: 'center', gap: 5, marginHorizontal: 16, marginTop: 8 },
  hintNoticeText: { fontSize: FontSize.xs, color: '#856404' },

  scenarioGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  scenarioCard: { width: '47%', backgroundColor: Colors.background, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: Colors.border, gap: 4, position: 'relative' },
  scenarioCardDone: { borderColor: '#4CAF50', backgroundColor: '#F1F8E9' },
  scenarioCardDisabled: { opacity: 0.5 },
  freePlayCard: { borderStyle: 'dashed', borderColor: Colors.primary + '80', backgroundColor: Colors.primary + '08' },
  scenarioCardEmoji: { fontSize: 28 },
  scenarioCardLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  scenarioScore: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  scenarioScoreText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  scenarioScoreStar: { fontSize: 12 },
  scenarioTap: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  scenarioDoneBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#4CAF50', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  scenarioDoneText: { color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold },
  freePlayHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginHorizontal: 16, marginBottom: 12 },

  // DONE
  doneContent: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 80, paddingBottom: 40, gap: 14 },
  doneEmoji: { fontSize: 64 },
  doneTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.text, textAlign: 'center' },
  donePersona: { fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic' },
  doneSubtitle: { fontSize: FontSize.base, color: Colors.textSecondary },
  doneScoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  doneScore: { fontSize: 56, fontWeight: FontWeight.extrabold, color: Colors.primary },
  doneScoreMax: { fontSize: FontSize.lg, color: Colors.textMuted },
  scoreBar: { width: '100%', height: 10, backgroundColor: Colors.border, borderRadius: 5, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 5 },
  doneGrade: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  lvlProgressBox: { width: '100%', backgroundColor: Colors.surface, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  lvlProgressLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  lvlProgressRow: { flexDirection: 'row', gap: 8 },
  lvlDot: { fontSize: 22 },
  lvlProgressCount: { fontSize: FontSize.sm, color: Colors.textMuted },
  levelUpBanner: { width: '100%', backgroundColor: '#FFF9C4', borderRadius: 16, padding: 16, borderWidth: 2, borderColor: '#FBC02D', alignItems: 'center', gap: 4 },
  levelUpTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: '#F57F17' },
  levelUpSub: { fontSize: FontSize.sm, color: '#E65100', textAlign: 'center' },
  doneActions: { flexDirection: 'row', gap: 12, width: '100%' },
  mapBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  mapBtnText: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.base },
  retryBtn: { flex: 1, backgroundColor: Colors.surface, borderRadius: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: Colors.primary },
  retryBtnText: { color: Colors.primary, fontWeight: FontWeight.bold, fontSize: FontSize.base },

  // CHAT
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10, borderBottomWidth: 2 },
  backText: { fontSize: FontSize.base, color: Colors.primary, fontWeight: FontWeight.semibold },
  headerCenter: { flex: 1, alignItems: 'center', gap: 1, paddingHorizontal: 8 },
  headerEmoji: { fontSize: 18 },
  chatTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.text },
  personaLabel: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  endBtn: { padding: 2 },
  slowBtn:      { borderRadius: 14, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surface },
  slowBtnActive:{ borderColor: Colors.primary, backgroundColor: Colors.primary + '18' },
  slowBtnText:  { fontSize: 15 },

  progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  progressTrack: { flex: 1, height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  progressScore: { fontSize: FontSize.xs, color: Colors.xp, fontWeight: FontWeight.bold },

  chat: { flex: 1 },
  chatContent: { padding: 16, gap: 10, paddingBottom: 8 },
  aiBubble: { backgroundColor: Colors.surface, borderRadius: 16, borderBottomLeftRadius: 4, padding: 14, alignSelf: 'flex-start', maxWidth: '85%', borderWidth: 1, borderColor: Colors.border, gap: 8 },
  userBubble: { backgroundColor: Colors.primary, borderRadius: 16, borderBottomRightRadius: 4, padding: 14, alignSelf: 'flex-end', maxWidth: '85%', gap: 8 },
  bubbleText: { fontSize: FontSize.base, color: Colors.text },
  bubbleSpeakBtn: { alignSelf: 'flex-end', padding: 4, opacity: 0.6 },
  evalBox: { backgroundColor: Colors.background, borderRadius: 10, padding: 10, gap: 4 },
  evalStatus: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  evalPref: { fontSize: FontSize.sm, color: Colors.text, fontStyle: 'italic' },
  evalPoints: { fontSize: FontSize.sm, color: Colors.xp, fontWeight: FontWeight.bold },
  feedbackRow: { flexDirection: 'row', gap: 8, marginTop: 4 },

  hintsArea: { paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface, minHeight: 44 },
  hintBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  hintBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold },
  hintChips: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  hintChip: { backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#A5D6A7' },
  hintChipText: { fontSize: FontSize.sm, color: '#2E7D32', fontWeight: FontWeight.semibold },

  micRow: { padding: 20, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center' },
  micBtn: { borderRadius: 50, paddingVertical: 16, paddingHorizontal: 48, alignItems: 'center', gap: 6 },
  micBtnRecording: { backgroundColor: Colors.error },
  micLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.white },
  textRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface },
  textInput: { flex: 1, backgroundColor: Colors.background, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 10, fontSize: FontSize.base, color: Colors.text, maxHeight: 100 },
  sendBtn: { borderRadius: 22, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: Colors.border },
});
