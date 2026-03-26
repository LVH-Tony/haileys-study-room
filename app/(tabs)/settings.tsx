import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/auth.store';
import { useSettingsStore, ReminderWindow } from '@/store/settings.store';
import {
  scheduleStudyReminders,
  scheduleWotdNotification,
  cancelStudyReminders,
  requestNotificationPermissions,
  setupAndroidChannels,
} from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { fetchUserAchievements, type Achievement } from '@/lib/achievements';
import type { AgeGroup, LearningGoal } from '@/lib/database.types';

// ─── profile option sets ──────────────────────────────────────────────────────
const AGE_OPTIONS: { key: AgeGroup; emoji: string; label: string }[] = [
  { key: 'kid',   emoji: '🧒', label: 'Kid (5–12)' },
  { key: 'teen',  emoji: '🧑', label: 'Teen (13–17)' },
  { key: 'adult', emoji: '🧓', label: 'Adult (18+)' },
];

const GOAL_OPTIONS: { key: LearningGoal; emoji: string; label: string }[] = [
  { key: 'fun',    emoji: '😄', label: 'Just for fun' },
  { key: 'travel', emoji: '✈️', label: 'Travel' },
  { key: 'school', emoji: '📖', label: 'School' },
  { key: 'career', emoji: '💼', label: 'Work & Career' },
];

const DAILY_OPTIONS: { value: number; label: string }[] = [
  { value: 5,  label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
];

// ─── notification option sets ─────────────────────────────────────────────────
const WINDOWS: { key: ReminderWindow; label: string; time: string }[] = [
  { key: 'morning',   label: '🌅 Morning',   time: '7–9 AM'  },
  { key: 'afternoon', label: '☀️ Afternoon', time: '12–2 PM' },
  { key: 'evening',   label: '🌙 Evening',   time: '7–9 PM'  },
];
const REPEAT_OPTIONS = [{ value: 1, label: 'Once' }, { value: 2, label: 'Twice' }, { value: 3, label: '3×' }];
const GAP_OPTIONS    = [{ value: 15, label: '15 min' }, { value: 30, label: '30 min' }, { value: 60, label: '1 hr' }, { value: 120, label: '2 hr' }];
const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

// ─── level labels ─────────────────────────────────────────────────────────────
const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Beginner 🌱',
  elementary: 'Elementary 🌿',
  'pre-intermediate': 'Pre-Intermediate 🌳',
  intermediate: 'Intermediate 🌲',
};

// ─── initials avatar ──────────────────────────────────────────────────────────
function Avatar({ name, avatarUrl, size = 72, onEdit, loading }: { name: string; avatarUrl?: string | null; size?: number; onEdit?: () => void; loading?: boolean }) {
  const initials = name
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const badgeSize = Math.round(size * 0.32);
  return (
    <TouchableOpacity onPress={onEdit} activeOpacity={onEdit ? 0.75 : 1} style={{ position: 'relative' }} disabled={loading}>
      <View style={[avatarStyles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
        {loading ? (
          <ActivityIndicator color={Colors.white} />
        ) : avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        ) : (
          <Text style={[avatarStyles.text, { fontSize: size * 0.38 }]}>{initials}</Text>
        )}
      </View>
      {onEdit && !loading && (
        <View style={[avatarStyles.editBadge, { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2, bottom: 0, right: 0 }]}>
          <Ionicons name="camera" size={badgeSize * 0.55} color={Colors.white} />
        </View>
      )}
    </TouchableOpacity>
  );
}
const avatarStyles = StyleSheet.create({
  circle:    { backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  text:      { color: Colors.white, fontWeight: '800' },
  editBadge: {
    position: 'absolute',
    backgroundColor: Colors.textSecondary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: Colors.surface,
  },
});

// ─── main screen ─────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { profile, session, fetchProfile, signOut } = useAuthStore();
  const router = useRouter();

  const { settings, fetchSettings, updateSettings } = useSettingsStore();

  // editable profile state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingAboutMe, setEditingAboutMe] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    if (profile?.id) {
      fetchSettings(profile.id);
      setupAndroidChannels();
      setNameInput(profile.display_name);
    }
  }, [profile?.id]);

  useFocusEffect(useCallback(() => {
    if (profile?.id) {
      fetchUserAchievements(profile.id).then(setAchievements).catch(() => {});
    }
  }, [profile?.id]));

  // ── profile save ────────────────────────────────────────────────────────────
  async function saveProfileField(patch: Record<string, unknown>) {
    if (!profile?.id) return;
    setSavingProfile(true);
    await supabase.from('user_profiles').update(patch).eq('id', profile.id);
    await fetchProfile(profile.id);
    setSavingProfile(false);
  }

  async function handlePickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingAvatar(true);
    try {
      const rawExt = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const ext = rawExt === 'jpg' ? 'jpeg' : rawExt;
      const fileName = `${profile!.id}.${ext}`;

      if (!asset.base64) throw new Error('Could not read image data. Please try again.');
      const binaryStr = atob(asset.base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, bytes, { upsert: true, contentType: `image/${ext}` });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      await saveProfileField({ avatar_url: urlData.publicUrl });
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload photo. Try again.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    await saveProfileField({ display_name: trimmed });
    setEditingName(false);
  }

  // ── notification helpers ─────────────────────────────────────────────────────
  async function saveSetting(patch: Parameters<typeof updateSettings>[1]) {
    if (!profile?.id || !settings) return;
    await updateSettings(profile.id, patch);
  }

  async function applySchedule(s: typeof settings) {
    if (!s) return;
    await scheduleStudyReminders({
      enabled: s.reminder_enabled,
      mode: s.reminder_mode,
      window: s.reminder_window,
      specificTime: s.reminder_time,
      repeatCount: s.reminder_repeat_count,
      repeatGapMinutes: s.reminder_repeat_gap,
    });
  }

  async function handleToggleReminder(val: boolean) {
    if (!profile?.id || !settings) return;
    if (val) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert('Permission needed', 'Enable notifications in your device Settings.');
        return;
      }
    }
    await saveSetting({ reminder_enabled: val });
    await applySchedule({ ...settings, reminder_enabled: val });
  }

  async function handleToggleWotd(val: boolean) {
    if (!profile?.id || !settings) return;
    await saveSetting({ wotd_enabled: val });
    if (val) {
      await scheduleWotdNotification('your new word', 7, 0);
    } else {
      await cancelStudyReminders();
      await applySchedule({ ...settings, wotd_enabled: val });
    }
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const specHour   = settings ? Number(settings.reminder_time.split(':')[0]) : 8;
  const specMinute = settings ? Number(settings.reminder_time.split(':')[1]) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Profile hero ─────────────────────────────────────────────────── */}
      <View style={styles.hero}>
        <View style={styles.avatarWrap}>
          <Avatar
            name={profile.display_name}
            avatarUrl={profile.avatar_url}
            size={80}
            onEdit={handlePickAvatar}
            loading={uploadingAvatar}
          />
        </View>

        {editingName ? (
          <View style={styles.nameEditRow}>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <TouchableOpacity onPress={handleSaveName} disabled={savingProfile} style={styles.nameEditBtn}>
              <Ionicons name="checkmark" size={22} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditingName(false); setNameInput(profile.display_name); }} style={styles.nameEditBtn}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.nameRow} onPress={() => setEditingName(true)}>
            <Text style={styles.displayName}>{profile.display_name}</Text>
            <Ionicons name="pencil" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}

        <Text style={styles.levelBadge}>{LEVEL_LABEL[profile.starting_level] ?? profile.starting_level}</Text>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatPill icon="flame" value={`${profile.streak_days}d`} label="Streak" color="#E07B39" />
          <StatPill icon="star"  value={`${profile.xp}`}           label="XP"     color="#D4A017" />
          <StatPill icon="time"  value={`${profile.daily_goal_minutes}m`} label="Daily goal" color={Colors.primary} />
        </View>
      </View>

      {/* ── About me ─────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>About me</Text>
          <TouchableOpacity onPress={() => setEditingAboutMe((v) => !v)} style={styles.editIconBtn}>
            <Ionicons name={editingAboutMe ? 'checkmark-circle' : 'pencil'} size={18} color={Colors.primary} />
            <Text style={styles.editIconLabel}>{editingAboutMe ? 'Done' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.sectionCard}>
          {editingAboutMe ? (
            <>
              <SubLabel>Age group</SubLabel>
              <ChipRow>
                {AGE_OPTIONS.map((o) => (
                  <Chip
                    key={o.key}
                    label={`${o.emoji} ${o.label}`}
                    active={profile.age_group === o.key}
                    onPress={() => saveProfileField({ age_group: o.key })}
                  />
                ))}
              </ChipRow>

              <SubLabel>Learning goal</SubLabel>
              <ChipRow>
                {GOAL_OPTIONS.map((o) => (
                  <Chip
                    key={o.key}
                    label={`${o.emoji} ${o.label}`}
                    active={profile.learning_goal === o.key}
                    onPress={() => saveProfileField({ learning_goal: o.key })}
                  />
                ))}
              </ChipRow>

              <SubLabel>Daily study target</SubLabel>
              <ChipRow>
                {DAILY_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    active={profile.daily_goal_minutes === o.value}
                    onPress={() => saveProfileField({ daily_goal_minutes: o.value })}
                  />
                ))}
              </ChipRow>
            </>
          ) : (
            <>
              <AboutMeRow
                label="Age group"
                value={AGE_OPTIONS.find((o) => o.key === profile.age_group)
                  ? `${AGE_OPTIONS.find((o) => o.key === profile.age_group)!.emoji} ${AGE_OPTIONS.find((o) => o.key === profile.age_group)!.label}`
                  : 'Not set'}
              />
              <AboutMeRow
                label="Learning goal"
                value={GOAL_OPTIONS.find((o) => o.key === profile.learning_goal)
                  ? `${GOAL_OPTIONS.find((o) => o.key === profile.learning_goal)!.emoji} ${GOAL_OPTIONS.find((o) => o.key === profile.learning_goal)!.label}`
                  : 'Not set'}
              />
              <AboutMeRow
                label="Daily study target"
                value={`${profile.daily_goal_minutes} min`}
                last
              />
            </>
          )}
        </View>
      </View>

      {/* ── Notifications (mobile only) ──────────────────────────────────── */}
      {settings && Platform.OS !== 'web' && (
        <>
          <Section title="Word of the Day">
            <SettingRow
              label="Daily word"
              sub="A new word every morning"
              right={
                <Switch
                  value={settings.wotd_enabled}
                  onValueChange={handleToggleWotd}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor={Colors.white}
                />
              }
            />
          </Section>

          <Section title="Study Reminders">
            <SettingRow
              label="Daily reminder"
              sub="Nudge me to practice"
              right={
                <Switch
                  value={settings.reminder_enabled}
                  onValueChange={handleToggleReminder}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor={Colors.white}
                />
              }
            />

            {settings.reminder_enabled && (
              <>
                <View style={styles.segmentRow}>
                  {['window', 'specific'].map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.segment, settings.reminder_mode === mode && styles.segmentActive]}
                      onPress={() => saveSetting({ reminder_mode: mode as 'window' | 'specific' })}
                    >
                      <Text style={[styles.segmentText, settings.reminder_mode === mode && styles.segmentTextActive]}>
                        {mode === 'window' ? 'Time window' : 'Specific time'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {settings.reminder_mode === 'window' && (
                  <ChipRow>
                    {WINDOWS.map((w) => (
                      <TouchableOpacity
                        key={w.key}
                        style={[styles.chip, settings.reminder_window === w.key && styles.chipActive]}
                        onPress={() => saveSetting({ reminder_window: w.key })}
                      >
                        <Text style={[styles.chipLabel, settings.reminder_window === w.key && styles.chipLabelActive]}>{w.label}</Text>
                        <Text style={styles.chipSub}>{w.time}</Text>
                      </TouchableOpacity>
                    ))}
                  </ChipRow>
                )}

                {settings.reminder_mode === 'specific' && (
                  <View style={styles.timePicker}>
                    <Text style={styles.timePickerLabel}>Hour</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {HOURS.map((h) => (
                        <TouchableOpacity
                          key={h}
                          style={[styles.timeChip, specHour === h && styles.chipActive]}
                          onPress={() => saveSetting({ reminder_time: `${String(h).padStart(2, '0')}:${String(specMinute).padStart(2, '0')}` })}
                        >
                          <Text style={[styles.timeChipText, specHour === h && styles.chipLabelActive]}>
                            {String(h).padStart(2, '0')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <Text style={styles.timePickerLabel}>Minute</Text>
                    <ChipRow>
                      {MINUTES.map((m) => (
                        <TouchableOpacity
                          key={m}
                          style={[styles.chip, specMinute === m && styles.chipActive]}
                          onPress={() => saveSetting({ reminder_time: `${String(specHour).padStart(2, '0')}:${String(m).padStart(2, '0')}` })}
                        >
                          <Text style={[styles.chipLabel, specMinute === m && styles.chipLabelActive]}>
                            :{String(m).padStart(2, '0')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ChipRow>
                  </View>
                )}

                <SubLabel>If dismissed, remind me</SubLabel>
                <ChipRow>
                  {REPEAT_OPTIONS.map((o) => (
                    <Chip
                      key={o.value}
                      label={o.label}
                      active={settings.reminder_repeat_count === o.value}
                      onPress={() => saveSetting({ reminder_repeat_count: o.value })}
                    />
                  ))}
                </ChipRow>

                {settings.reminder_repeat_count > 1 && (
                  <>
                    <SubLabel>Every</SubLabel>
                    <ChipRow>
                      {GAP_OPTIONS.map((o) => (
                        <Chip
                          key={o.value}
                          label={o.label}
                          active={settings.reminder_repeat_gap === o.value}
                          onPress={() => saveSetting({ reminder_repeat_gap: o.value })}
                        />
                      ))}
                    </ChipRow>
                  </>
                )}

                <TouchableOpacity
                  style={styles.applyBtn}
                  onPress={async () => { await applySchedule(settings); Alert.alert('Saved', 'Schedule updated!'); }}
                >
                  <Text style={styles.applyBtnText}>Apply schedule</Text>
                </TouchableOpacity>
              </>
            )}
          </Section>
        </>
      )}

      {/* ── Account ──────────────────────────────────────────────────────── */}
      {/* ── User Code + Social ── */}
      {profile?.user_code && (
        <Section title="Your ID">
          <TouchableOpacity style={styles.socialRow} onPress={() => router.push('/social')}>
            <View style={styles.userCodeBox}>
              <Text style={styles.userCodeLabel}>Share code</Text>
              <Text style={styles.userCodeValue}>#{profile.user_code}</Text>
              <Text style={styles.userCodeHint}>Friends can search this to add you</Text>
            </View>
            <View style={styles.socialBtn}>
              <Ionicons name="people" size={18} color={Colors.white} />
              <Text style={styles.socialBtnText}>Friends & Leaderboard</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.white} />
            </View>
          </TouchableOpacity>
        </Section>
      )}

      {/* ── Achievements ── */}
      <Section title="Achievements">
        <View style={styles.badgeGrid}>
          {achievements.map((a) => (
            <View key={a.id} style={[styles.badgeCard, !a.earned_at && styles.badgeCardLocked]}>
              <Text style={[styles.badgeEmoji, !a.earned_at && styles.badgeLocked]}>{a.emoji}</Text>
              <Text style={[styles.badgeTitle, !a.earned_at && { color: Colors.textMuted }]} numberOfLines={2}>{a.title}</Text>
              {a.earned_at
                ? <Text style={styles.badgeXp}>+{a.xp_reward} XP</Text>
                : <Text style={styles.badgeLockText}>🔒</Text>
              }
            </View>
          ))}
          {achievements.length === 0 && (
            <Text style={styles.noBadges}>Play games and conversations to earn badges!</Text>
          )}
        </View>
      </Section>

      <Section title="Account">
        <SettingRow
          label={session?.user.email ?? ''}
          sub="Free access — all features unlocked"
          right={null}
        />

        <TouchableOpacity
          style={styles.retakeBtn}
          onPress={() =>
            Alert.alert(
              'Retake Placement Test',
              'This will reset your current level and run you through the placement test again. Continue?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Retake',
                  onPress: async () => {
                    if (!profile?.id) return;
                    await supabase
                      .from('user_profiles')
                      .update({ placement_score: null })
                      .eq('id', profile.id);
                    await fetchProfile(profile.id);
                    // _layout.tsx will detect placement_score = null and route to the test
                  },
                },
              ],
            )
          }
        >
          <Ionicons name="reload-outline" size={18} color={Colors.primary} />
          <Text style={styles.retakeText}>Retake Placement Test</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutBtn} onPress={() => {
          if (Platform.OS === 'web') {
            if (window.confirm('Are you sure you want to sign out?')) signOut();
          } else {
            Alert.alert('Sign out', 'Are you sure?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: signOut },
            ]);
          }
        }}>
          <Ionicons name="log-out-outline" size={18} color={Colors.error} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </Section>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

// ─── small shared components ──────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function SubLabel({ children }: { children: string }) {
  return <Text style={styles.subLabel}>{children}</Text>;
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SettingRow({ label, sub, right }: { label: string; sub: string; right: React.ReactNode }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingMeta}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingSub}>{sub}</Text>
      </View>
      {right}
    </View>
  );
}

function StatPill({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <View style={styles.statPill}>
      <Ionicons name={icon as React.ComponentProps<typeof Ionicons>['name']} size={18} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AboutMeRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.aboutMeRow, !last && styles.aboutMeRowBorder]}>
      <Text style={styles.aboutMeLabel}>{label}</Text>
      <Text style={styles.aboutMeValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content:   { paddingTop: 56, paddingBottom: 48, gap: 20 },
  center:    { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.base },

  // Hero
  hero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 8,
  },
  avatarWrap: {
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4, borderRadius: 40,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  displayName: { fontSize: FontSize.xl, fontWeight: FontWeight.extrabold, color: Colors.text },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '80%' },
  nameInput: {
    flex: 1, fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text,
    borderBottomWidth: 2, borderBottomColor: Colors.primary, paddingVertical: 4,
  },
  nameEditBtn: { padding: 6 },
  levelBadge: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 4, alignSelf: 'stretch', paddingHorizontal: 8 },
  statPill: {
    flex: 1,
    alignItems: 'center', gap: 2,
    backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 12,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  statValue: { fontSize: FontSize.md, fontWeight: FontWeight.extrabold, color: Colors.text },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },

  // Sections
  section: { gap: 8, paddingHorizontal: 20 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4, paddingRight: 4 },
  sectionTitle: {
    fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  editIconBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editIconLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary },
  sectionCard: {
    backgroundColor: Colors.surface, borderRadius: 18,
    borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden', gap: 0,
  },

  aboutMeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  aboutMeRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  aboutMeLabel: { fontSize: FontSize.base, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  aboutMeValue: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.text },

  subLabel: {
    fontSize: FontSize.sm, color: Colors.textSecondary,
    fontWeight: FontWeight.semibold, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  chip: {
    borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    paddingVertical: 8, paddingHorizontal: 14, backgroundColor: Colors.background, alignItems: 'center',
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipLabel:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },
  chipLabelActive: { color: Colors.white },
  chipSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  settingMeta: { flex: 1, gap: 2, paddingRight: 12 },
  settingLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.text },
  settingSub:   { fontSize: FontSize.sm, color: Colors.textSecondary },

  segmentRow: {
    flexDirection: 'row', margin: 12,
    backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segmentActive: { backgroundColor: Colors.primary },
  segmentText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  segmentTextActive: { color: Colors.white },

  timePicker: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  timePickerLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  timeChip: {
    borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border,
    paddingVertical: 8, paddingHorizontal: 10, marginRight: 6, backgroundColor: Colors.background,
  },
  timeChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },

  applyBtn: {
    margin: 12, backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 13, alignItems: 'center',
  },
  applyBtnText: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.base },

  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 16, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  retakeText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.primary },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 16, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  signOutText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.error },

  // Achievements
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12 },
  badgeCard: {
    width: '30%', backgroundColor: Colors.background, borderRadius: 14, padding: 10,
    alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: Colors.primary + '55',
  },
  badgeCardLocked: { borderColor: Colors.border, backgroundColor: Colors.surfaceAlt },
  badgeEmoji:  { fontSize: 28 },
  badgeLocked: { opacity: 0.35 },
  badgeTitle:  { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.text, textAlign: 'center' },
  badgeXp:     { fontSize: 10, color: Colors.xp, fontWeight: FontWeight.bold },
  badgeLockText: { fontSize: 10, color: Colors.textMuted },
  noBadges: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', padding: 16 },

  // Social / user code
  socialRow:     { padding: 12, gap: 10 },
  userCodeBox:   { alignItems: 'center', gap: 2, paddingVertical: 8 },
  userCodeLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  userCodeValue: { fontSize: 32, fontWeight: FontWeight.extrabold, color: Colors.primary, letterSpacing: 4 },
  userCodeHint:  { fontSize: FontSize.xs, color: Colors.textMuted },
  socialBtn:     { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  socialBtnText: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.base, flex: 1 },
});
