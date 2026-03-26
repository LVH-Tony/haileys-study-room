import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

// Speak a short celebratory phrase and fire haptics.
// We use Speech for audio feedback so no bundled audio files are needed.

export async function playCorrect() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  const phrases = ['Correct!', 'Great!', 'Nice one!', 'Well done!', 'Spot on!'];
  speak(phrases[Math.floor(Math.random() * phrases.length)]);
}

export async function playWrong() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  const phrases = ['Not quite!', 'Try again!', 'Almost!'];
  speak(phrases[Math.floor(Math.random() * phrases.length)]);
}

export async function playComplete() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  // Brief pause so the UI can update first
  setTimeout(() => speak('Amazing! Session complete!'), 300);
}

export async function playLevelUp() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  setTimeout(() => speak('Congratulations! You leveled up!'), 300);
}

export async function playSessionComplete() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  setTimeout(() => speak('Well done! You finished this session!'), 300);
}

export async function playAchievement(title: string) {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  setTimeout(() => speak(`Achievement unlocked! ${title}`), 400);
}

function speak(text: string) {
  try { Speech.stop(); Speech.speak(text, { language: 'en-US', rate: 0.95, pitch: 1.1 }); } catch { /* ignore */ }
}
