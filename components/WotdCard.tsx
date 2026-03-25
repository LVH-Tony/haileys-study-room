import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Audio } from 'expo-av';
import { useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';

interface WotdWord {
  id: string;
  word: string;
  image_url: string | null;
  audio_url: string | null;
  difficulty_score: number;
  topics: { name: string } | null;
}

interface Props {
  wotd: {
    id: string;
    seen: boolean;
    words: WotdWord;
  } | null;
  loading: boolean;
  onMarkSeen: (id: string) => void;
}

export function WotdCard({ wotd, loading, onMarkSeen }: Props) {
  const soundRef = useRef<Audio.Sound | null>(null);

  async function playWord() {
    if (!wotd) return;
    try {
      soundRef.current?.unloadAsync();
      const word = wotd.words;
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
      if (!wotd.seen) onMarkSeen(wotd.id);
    } catch { /* non-fatal */ }
  }

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!wotd) return null;

  const word = wotd.words;

  return (
    <View style={[styles.card, !wotd.seen && styles.cardUnseen]}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>✨ Word of the Day</Text>
        {!wotd.seen && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
      </View>

      <View style={styles.body}>
        {word.image_url && (
          <Image source={{ uri: word.image_url }} style={styles.image} contentFit="cover" />
        )}
        <View style={styles.wordSection}>
          <TouchableOpacity style={styles.wordRow} onPress={playWord} activeOpacity={0.7}>
            <Text style={styles.word}>{word.word}</Text>
            <Text style={styles.speakIcon}>🔊</Text>
          </TouchableOpacity>
          {word.topics?.name && (
            <Text style={styles.topic}>{word.topics.name}</Text>
          )}
          <Text style={styles.hint}>Tap the word to hear it</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 12,
  },
  cardUnseen: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight + '11',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.primaryDark,
  },
  newBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    letterSpacing: 0.5,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 14,
    backgroundColor: Colors.surfaceAlt,
  },
  wordSection: {
    flex: 1,
    gap: 4,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  word: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
  },
  speakIcon: { fontSize: 20 },
  topic: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
