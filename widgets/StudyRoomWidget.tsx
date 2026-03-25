/**
 * StudyRoomWidget — Android home screen widget
 * Shows: Word of the Day + streak count
 * Tapping opens the app directly to the Home tab
 */
import React from 'react';
import {
  FlexWidget,
  TextWidget,
  ImageWidget,
} from 'react-native-android-widget';

export interface WidgetData {
  word: string;
  topic: string;
  imageUrl: string | null;
  streakDays: number;
}

// Warm beige palette matching the app
const C = {
  bg: '#F5ECD7',
  surface: '#FDF6E9',
  border: '#D9C9A8',
  primary: '#E07B39',
  text: '#3D2B1F',
  textSec: '#7A6251',
  textMuted: '#A89080',
  white: '#FFFFFF',
  xp: '#E8B84B',
};

export function StudyRoomWidget({ word, topic, imageUrl, streakDays }: WidgetData) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: C.bg,
        borderRadius: 20,
        padding: 14,
        gap: 10,
      }}
      clickAction="OPEN_APP"
      clickActionData={{ screen: 'home' }}
    >
      {/* Header row */}
      <FlexWidget
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <TextWidget
          text="✨ Word of the Day"
          style={{ fontSize: 11, fontFamily: 'sans-serif-medium', color: C.primary }}
        />
        {/* Streak badge */}
        <FlexWidget
          style={{
            flexDirection: 'row',
            backgroundColor: C.xp + '44',
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 4,
            alignItems: 'center',
            gap: 4,
          }}
        >
          <TextWidget text="🔥" style={{ fontSize: 12 }} />
          <TextWidget
            text={`${streakDays}d`}
            style={{ fontSize: 12, fontFamily: 'sans-serif-bold', color: C.text }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* Body: image + word */}
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        {imageUrl ? (
          <ImageWidget
            image={{ uri: imageUrl }}
            imageWidth={72}
            imageHeight={72}
            style={{ borderRadius: 12, width: 72, height: 72 }}
          />
        ) : (
          <FlexWidget
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              backgroundColor: C.border,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <TextWidget text="📚" style={{ fontSize: 28 }} />
          </FlexWidget>
        )}

        <FlexWidget style={{ flex: 1, flexDirection: 'column', gap: 4 }}>
          <TextWidget
            text={word}
            style={{
              fontSize: 24,
              fontFamily: 'sans-serif-black',
              color: C.text,
            }}
          />
          <TextWidget
            text={topic}
            style={{ fontSize: 12, fontFamily: 'sans-serif', color: C.textSec }}
          />
          <TextWidget
            text="Tap to learn →"
            style={{ fontSize: 11, fontFamily: 'sans-serif', color: C.textMuted }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
