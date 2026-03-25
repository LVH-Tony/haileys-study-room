import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useState, useRef } from 'react';
import { Audio } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import type { ConversationMessage } from '@/lib/database.types';

const CONVERSATION_LEVELS = [
  { level: 1, label: 'Level 1 — Greetings', sub: 'What\'s your name? How old are you?', premium: false },
  { level: 2, label: 'Level 2 — Daily Life', sub: 'What did you eat today? Describe your room.', premium: true },
  { level: 3, label: 'Level 3 — Opinions', sub: 'What do you think about…? Tell me about…', premium: true },
];

export default function ConversationScreen() {
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { profile, session } = useAuthStore();

  async function startSession(level: number) {
    setSelectedLevel(level);
    setMessages([]);
    setProcessing(true);

    const { data, error } = await supabase.functions.invoke('conversation', {
      body: { action: 'start', level, userId: session?.user.id },
    });

    if (error || !data) {
      Alert.alert('Error', 'Could not start conversation. Try again.');
      setSelectedLevel(null);
      setProcessing(false);
      return;
    }

    setSessionId(data.sessionId);
    const aiMsg: ConversationMessage = { role: 'ai', content: data.prompt };
    setMessages([aiMsg]);
    setProcessing(false);
    // Play the AI's first message via TTS
    await playTts(data.prompt);
  }

  async function startRecording() {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setRecording(true);
    } catch {
      Alert.alert('Permission denied', 'Microphone access is required for speaking practice.');
    }
  }

  async function stopRecordingAndSubmit() {
    if (!recordingRef.current) return;
    setRecording(false);
    setProcessing(true);

    await recordingRef.current.stopAndUnloadAsync();
    const uri = recordingRef.current.getURI();
    recordingRef.current = null;

    if (!uri) { setProcessing(false); return; }

    // Send audio to Whisper edge function
    const formData = new FormData();
    formData.append('file', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);
    formData.append('sessionId', sessionId ?? '');
    formData.append('userId', session?.user.id ?? '');
    formData.append('level', String(selectedLevel));

    const { data, error } = await supabase.functions.invoke('conversation', {
      body: formData,
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    if (error || !data) {
      setProcessing(false);
      Alert.alert('Error', 'Could not process your response. Try again.');
      return;
    }

    const userMsg: ConversationMessage = {
      role: 'user',
      content: data.transcript,
      evaluation: data.evaluation,
    };
    const aiMsg: ConversationMessage = { role: 'ai', content: data.nextPrompt };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setProcessing(false);
    await playTts(data.nextPrompt);
    scrollRef.current?.scrollToEnd({ animated: true });
  }

  async function playTts(text: string) {
    try {
      const { data, error } = await supabase.functions.invoke('tts', { body: { text } });
      if (error || !data?.audioUrl) return;
      const { sound } = await Audio.Sound.createAsync({ uri: data.audioUrl });
      await sound.playAsync();
    } catch {
      // TTS failure is non-fatal — user can still read
    }
  }

  async function submitFeedback(msgIndex: number, rating: 'up' | 'down') {
    if (!session || !sessionId) return;
    await supabase.from('feedback').insert({
      user_id: session.user.id,
      ref_type: 'convo',
      ref_id: `${sessionId}-${msgIndex}`,
      rating,
    });
  }

  // Level picker
  if (!selectedLevel) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Speaking Practice</Text>
        <Text style={styles.subtitle}>Pick a conversation level</Text>
        <View style={styles.levels}>
          {CONVERSATION_LEVELS.map((lvl) => {
            const locked = lvl.premium && !profile?.is_premium;
            return (
              <TouchableOpacity
                key={lvl.level}
                style={[styles.levelCard, locked && styles.levelLocked]}
                onPress={() => !locked && startSession(lvl.level)}
                disabled={locked}
              >
                <Text style={styles.levelLabel}>{lvl.label} {locked ? '🔒' : ''}</Text>
                <Text style={styles.levelSub}>{lvl.sub}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedLevel(null)}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Level {selectedLevel}</Text>

      <ScrollView ref={scrollRef} style={styles.chat} contentContainerStyle={styles.chatContent}>
        {messages.map((msg, i) => (
          <View key={i} style={msg.role === 'ai' ? styles.aiBubble : styles.userBubble}>
            <Text style={styles.bubbleText}>{msg.content}</Text>
            {msg.evaluation && (
              <View style={styles.evalBox}>
                <Text style={[
                  styles.evalStatus,
                  msg.evaluation.status === 'correct' && { color: Colors.success },
                  msg.evaluation.status === 'preferred' && { color: Colors.warning },
                ]}>
                  {msg.evaluation.status === 'correct' ? '✓ Correct' :
                    msg.evaluation.status === 'preferred' ? '💡 Good, but try:' : '✓ Acceptable'}
                </Text>
                {msg.evaluation.preferred_phrasing && (
                  <Text style={styles.evalPref}>"{msg.evaluation.preferred_phrasing}"</Text>
                )}
                <Text style={styles.evalPoints}>+{msg.evaluation.points} pts</Text>
                <View style={styles.feedbackRow}>
                  <TouchableOpacity onPress={() => submitFeedback(i, 'up')}>
                    <Text style={styles.fbBtn}>👍</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => submitFeedback(i, 'down')}>
                    <Text style={styles.fbBtn}>👎</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        ))}
        {processing && <ActivityIndicator color={Colors.primary} style={{ marginTop: 12 }} />}
      </ScrollView>

      <View style={styles.micRow}>
        <TouchableOpacity
          style={[styles.micBtn, recording && styles.micBtnRecording]}
          onPress={recording ? stopRecordingAndSubmit : startRecording}
          disabled={processing}
        >
          <Text style={styles.micEmoji}>{recording ? '⏹' : '🎙️'}</Text>
          <Text style={styles.micLabel}>{recording ? 'Tap to send' : 'Tap to speak'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  subtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    paddingHorizontal: 24,
    marginTop: 4,
    marginBottom: 20,
  },
  levels: { paddingHorizontal: 24, gap: 14 },
  levelCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 4,
  },
  levelLocked: { opacity: 0.5 },
  levelLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  levelSub: { fontSize: FontSize.sm, color: Colors.textSecondary },
  backBtn: { paddingHorizontal: 24, paddingTop: 60 },
  backText: { fontSize: FontSize.base, color: Colors.primary, fontWeight: FontWeight.semibold },
  chat: { flex: 1 },
  chatContent: { padding: 20, gap: 12 },
  aiBubble: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 14,
    alignSelf: 'flex-start',
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  userBubble: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    padding: 14,
    alignSelf: 'flex-end',
    maxWidth: '85%',
    gap: 8,
  },
  bubbleText: { fontSize: FontSize.base, color: Colors.text },
  evalBox: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  evalStatus: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  evalPref: { fontSize: FontSize.sm, color: Colors.text, fontStyle: 'italic' },
  evalPoints: { fontSize: FontSize.sm, color: Colors.xp, fontWeight: FontWeight.bold },
  feedbackRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  fbBtn: { fontSize: 18 },
  micRow: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
  },
  micBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 50,
    paddingVertical: 16,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 4,
  },
  micBtnRecording: { backgroundColor: Colors.error },
  micEmoji: { fontSize: 28 },
  micLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.white },
});
