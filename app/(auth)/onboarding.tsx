import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { useState, useRef } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth.store';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import type { AgeGroup, LearningGoal } from '@/lib/database.types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AGE_OPTIONS: { key: AgeGroup; emoji: string; label: string; sub: string }[] = [
  { key: 'kid',  emoji: '🧒', label: 'Kid',  sub: '5 – 12 years old' },
  { key: 'teen', emoji: '🧑', label: 'Teen', sub: '13 – 17 years old' },
  { key: 'adult', emoji: '🧓', label: 'Adult', sub: '18 and above' },
];

const GOAL_OPTIONS: { key: LearningGoal; emoji: string; label: string; sub: string }[] = [
  { key: 'fun',    emoji: '😄', label: 'Just for fun',  sub: 'Casual everyday learning' },
  { key: 'travel', emoji: '✈️', label: 'Travel',        sub: 'Communicate on trips' },
  { key: 'school', emoji: '📖', label: 'School',        sub: 'Homework & exams' },
  { key: 'career', emoji: '💼', label: 'Work & Career', sub: 'Professional English' },
];

const DAILY_OPTIONS: { value: number; label: string; sub: string }[] = [
  { value: 5,  label: '5 min',  sub: 'Quick daily habit' },
  { value: 10, label: '10 min', sub: 'Steady progress' },
  { value: 20, label: '20 min', sub: 'Serious learner' },
  { value: 30, label: '30 min', sub: 'Dedicated study' },
];

const STEPS = [
  { title: 'How old are you?',       subtitle: "We'll tailor content just for you" },
  { title: "What's your goal?",      subtitle: "We'll suggest the most useful lessons" },
  { title: 'How much time per day?', subtitle: "We'll send you friendly reminders" },
];

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [goal, setGoal] = useState<LearningGoal | null>(null);
  const [dailyMinutes, setDailyMinutes] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const { session, fetchProfile } = useAuthStore();
  const router = useRouter();

  function animateToNext() {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -SCREEN_WIDTH, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: SCREEN_WIDTH, duration: 0, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }

  function nextStep() {
    if (step < STEPS.length - 1) {
      animateToNext();
      setStep((s) => s + 1);
    } else {
      handleFinish();
    }
  }

  function canProceed() {
    if (step === 0) return ageGroup !== null;
    if (step === 1) return goal !== null;
    return dailyMinutes !== null;
  }

  async function handleFinish() {
    if (!session?.user.id) return;
    setSaving(true);
    try {
      await supabase
        .from('user_profiles')
        .update({
          age_group: ageGroup,
          learning_goal: goal,
          daily_goal_minutes: dailyMinutes ?? 10,
          onboarding_completed: true,
        })
        .eq('id', session.user.id);

      await fetchProfile(session.user.id);
      router.replace('/(tabs)/');
    } catch (e) {
      console.warn('Onboarding save error:', e);
      router.replace('/(tabs)/');
    } finally {
      setSaving(false);
    }
  }

  const currentStep = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brand}>Let's set you up 🎯</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.stepCounter}>{step + 1} of {STEPS.length}</Text>
      </View>

      {/* Step content */}
      <Animated.View style={[styles.body, { transform: [{ translateX: slideAnim }] }]}>
        <Text style={styles.title}>{currentStep.title}</Text>
        <Text style={styles.subtitle}>{currentStep.subtitle}</Text>

        {step === 0 && (
          <View style={styles.optionList}>
            {AGE_OPTIONS.map((o) => (
              <OptionCard
                key={o.key}
                emoji={o.emoji}
                label={o.label}
                sub={o.sub}
                selected={ageGroup === o.key}
                onPress={() => setAgeGroup(o.key)}
              />
            ))}
          </View>
        )}

        {step === 1 && (
          <View style={styles.optionList}>
            {GOAL_OPTIONS.map((o) => (
              <OptionCard
                key={o.key}
                emoji={o.emoji}
                label={o.label}
                sub={o.sub}
                selected={goal === o.key}
                onPress={() => setGoal(o.key)}
              />
            ))}
          </View>
        )}

        {step === 2 && (
          <View style={styles.optionList}>
            {DAILY_OPTIONS.map((o) => (
              <OptionCard
                key={o.value}
                emoji="⏱️"
                label={o.label}
                sub={o.sub}
                selected={dailyMinutes === o.value}
                onPress={() => setDailyMinutes(o.value)}
              />
            ))}
          </View>
        )}
      </Animated.View>

      {/* CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
          onPress={nextStep}
          disabled={!canProceed() || saving}
        >
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.nextBtnText}>
              {step < STEPS.length - 1 ? 'Continue →' : 'Get started!'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function OptionCard({
  emoji, label, sub, selected, onPress,
}: {
  emoji: string; label: string; sub: string; selected: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.cardEmoji}>{emoji}</Text>
      <View style={styles.cardText}>
        <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>{label}</Text>
        <Text style={styles.cardSub}>{sub}</Text>
      </View>
      {selected && <View style={styles.checkDot} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 24,
    gap: 12,
  },
  brand: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  stepCounter: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },

  body: {
    flex: 1,
    paddingHorizontal: 28,
    gap: 8,
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.extrabold,
    color: Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginBottom: 20,
  },

  optionList: { gap: 12 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: 18,
    gap: 16,
  },
  cardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight + '18',
  },
  cardEmoji: { fontSize: 28 },
  cardText: { flex: 1, gap: 2 },
  cardLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  cardLabelSelected: { color: Colors.primary },
  cardSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  checkDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },

  footer: {
    paddingHorizontal: 28,
    paddingBottom: 48,
    paddingTop: 16,
  },
  nextBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  nextBtnDisabled: {
    backgroundColor: Colors.border,
  },
  nextBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.md,
  },
});
