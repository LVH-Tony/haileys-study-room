import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useSettingsStore, ReminderWindow } from '@/store/settings.store';
import {
  scheduleStudyReminders,
  scheduleWotdNotification,
  cancelStudyReminders,
  requestNotificationPermissions,
  setupAndroidChannels,
} from '@/lib/notifications';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';

const WINDOWS: { key: ReminderWindow; label: string; time: string }[] = [
  { key: 'morning',   label: '🌅 Morning',   time: '7–9 AM'  },
  { key: 'afternoon', label: '☀️ Afternoon', time: '12–2 PM' },
  { key: 'evening',   label: '🌙 Evening',   time: '7–9 PM'  },
];

const REPEAT_OPTIONS = [
  { value: 1, label: 'Once' },
  { value: 2, label: 'Twice' },
  { value: 3, label: '3 times' },
];

const GAP_OPTIONS = [
  { value: 15,  label: '15 min' },
  { value: 30,  label: '30 min' },
  { value: 60,  label: '1 hour' },
  { value: 120, label: '2 hours' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

export default function SettingsScreen() {
  const { profile } = useAuthStore();
  const { settings, fetchSettings, updateSettings } = useSettingsStore();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      fetchSettings(profile.id);
      setupAndroidChannels();
    }
  }, [profile?.id]);

  async function handleToggleReminder(val: boolean) {
    if (!profile?.id || !settings) return;
    if (val) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Permission needed',
          'Enable notifications in Settings to receive study reminders.',
        );
        return;
      }
    }
    await save({ reminder_enabled: val });
    await applyNotificationSchedule({ ...settings, reminder_enabled: val });
  }

  async function handleToggleWotd(val: boolean) {
    if (!profile?.id || !settings) return;
    await save({ wotd_enabled: val });
    if (val) {
      await scheduleWotdNotification('your new word', 7, 0);
    } else {
      // Cancel only the wotd notification (keep study reminders)
      // expo-notifications doesn't have cancel-by-identifier in all versions;
      // we cancel all and reschedule reminders
      await cancelStudyReminders();
      await applyNotificationSchedule({ ...settings, wotd_enabled: val });
    }
  }

  async function save(patch: Parameters<typeof updateSettings>[1]) {
    if (!profile?.id || !settings) return;
    setSaving(true);
    await updateSettings(profile.id, patch);
    setSaving(false);
  }

  async function applyNotificationSchedule(s: typeof settings) {
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

  async function handleSaveSchedule() {
    if (!settings) return;
    await applyNotificationSchedule(settings);
    Alert.alert('Saved', 'Your notification schedule has been updated.');
  }

  if (!settings) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading settings…</Text>
      </View>
    );
  }

  const [specHour, specMinute] = settings.reminder_time.split(':').map(Number);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      {/* ── Word of the Day ─────────────────────────────────── */}
      <Section title="Word of the Day">
        <SettingRow
          label="Daily word"
          sub="Get a new word every morning"
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

      {/* ── Study Reminders ──────────────────────────────────── */}
      <Section title="Study Reminders">
        <SettingRow
          label="Daily reminder"
          sub="Notify me to practice"
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
            {/* Mode toggle */}
            <View style={styles.segmentRow}>
              <TouchableOpacity
                style={[styles.segment, settings.reminder_mode === 'window' && styles.segmentActive]}
                onPress={() => save({ reminder_mode: 'window' })}
              >
                <Text style={[styles.segmentText, settings.reminder_mode === 'window' && styles.segmentTextActive]}>
                  Time window
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segment, settings.reminder_mode === 'specific' && styles.segmentActive]}
                onPress={() => save({ reminder_mode: 'specific' })}
              >
                <Text style={[styles.segmentText, settings.reminder_mode === 'specific' && styles.segmentTextActive]}>
                  Specific time
                </Text>
              </TouchableOpacity>
            </View>

            {/* Window selector */}
            {settings.reminder_mode === 'window' && (
              <View style={styles.chipRow}>
                {WINDOWS.map((w) => (
                  <TouchableOpacity
                    key={w.key}
                    style={[styles.chip, settings.reminder_window === w.key && styles.chipActive]}
                    onPress={() => save({ reminder_window: w.key })}
                  >
                    <Text style={[styles.chipLabel, settings.reminder_window === w.key && styles.chipLabelActive]}>
                      {w.label}
                    </Text>
                    <Text style={styles.chipSub}>{w.time}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Specific time picker */}
            {settings.reminder_mode === 'specific' && (
              <View style={styles.timePicker}>
                <Text style={styles.timePickerLabel}>Hour</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScroll}>
                  {HOURS.map((h) => (
                    <TouchableOpacity
                      key={h}
                      style={[styles.timeChip, specHour === h && styles.chipActive]}
                      onPress={() => save({ reminder_time: `${String(h).padStart(2, '0')}:${String(specMinute).padStart(2, '0')}` })}
                    >
                      <Text style={[styles.timeChipText, specHour === h && styles.chipLabelActive]}>
                        {String(h).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.timePickerLabel}>Minute</Text>
                <View style={styles.chipRow}>
                  {MINUTES.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.chip, specMinute === m && styles.chipActive]}
                      onPress={() => save({ reminder_time: `${String(specHour).padStart(2, '0')}:${String(m).padStart(2, '0')}` })}
                    >
                      <Text style={[styles.chipLabel, specMinute === m && styles.chipLabelActive]}>
                        :{String(m).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Repeat count */}
            <Text style={styles.subLabel}>If dismissed, remind me</Text>
            <View style={styles.chipRow}>
              {REPEAT_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.value}
                  style={[styles.chip, settings.reminder_repeat_count === o.value && styles.chipActive]}
                  onPress={() => save({ reminder_repeat_count: o.value })}
                >
                  <Text style={[styles.chipLabel, settings.reminder_repeat_count === o.value && styles.chipLabelActive]}>
                    {o.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Gap between repeats */}
            {settings.reminder_repeat_count > 1 && (
              <>
                <Text style={styles.subLabel}>Every</Text>
                <View style={styles.chipRow}>
                  {GAP_OPTIONS.map((o) => (
                    <TouchableOpacity
                      key={o.value}
                      style={[styles.chip, settings.reminder_repeat_gap === o.value && styles.chipActive]}
                      onPress={() => save({ reminder_repeat_gap: o.value })}
                    >
                      <Text style={[styles.chipLabel, settings.reminder_repeat_gap === o.value && styles.chipLabelActive]}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSchedule}>
              <Text style={styles.saveBtnText}>Apply schedule</Text>
            </TouchableOpacity>
          </>
        )}
      </Section>

      {/* ── Account ─────────────────────────────────────────── */}
      <Section title="Account">
        <SettingRow
          label={profile?.display_name ?? ''}
          sub={profile?.is_premium ? '⭐ Premium member' : 'Free plan'}
          right={null}
        />
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 48, gap: 24 },
  center: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.base },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.extrabold, color: Colors.text },

  section: { gap: 8 },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionCard: {
    backgroundColor: Colors.surface, borderRadius: 18,
    borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden',
  },

  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  settingMeta: { flex: 1, gap: 2, paddingRight: 12 },
  settingLabel: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.text },
  settingSub: { fontSize: FontSize.sm, color: Colors.textSecondary },

  segmentRow: {
    flexDirection: 'row', margin: 12, backgroundColor: Colors.background,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segmentActive: { backgroundColor: Colors.primary },
  segmentText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  segmentTextActive: { color: Colors.white },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  chip: {
    borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    paddingVertical: 8, paddingHorizontal: 14, backgroundColor: Colors.background,
    alignItems: 'center',
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },
  chipLabelActive: { color: Colors.white },
  chipSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

  timePicker: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  timePickerLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  timeScroll: { flexGrow: 0 },
  timeChip: {
    borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border,
    paddingVertical: 8, paddingHorizontal: 10, marginRight: 6, backgroundColor: Colors.background,
  },
  timeChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text },

  subLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, paddingHorizontal: 12, paddingTop: 4 },

  saveBtn: {
    margin: 12, backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 13, alignItems: 'center',
  },
  saveBtnText: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.base },
});
