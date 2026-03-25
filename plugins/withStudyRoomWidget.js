/**
 * Expo config plugin: injects the Study Room Android widget into the native project
 * and pins Gradle to a compatible version.
 * Runs automatically during `expo prebuild` so customizations survive CNG rebuilds.
 */
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const WIDGET_INFO_XML = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="250dp"
    android:minHeight="110dp"
    android:targetCellWidth="4"
    android:targetCellHeight="2"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/rn_widget_init_layout"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:previewLayout="@layout/rn_widget_init_layout">
</appwidget-provider>`;

// Step 1: Add widget receiver to AndroidManifest.xml
function withWidgetManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    if (!app.receiver) app.receiver = [];
    const alreadyAdded = app.receiver.some(
      (r) => r.$?.['android:name']?.includes('StudyRoomWidgetProvider')
    );
    if (alreadyAdded) return config;

    app.receiver.push({
      $: {
        'android:name': 'com.lvhtony.haileysStudyRoom.StudyRoomWidgetProvider',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.appwidget.provider',
            'android:resource': '@xml/study_room_widget_info',
          },
        },
      ],
    });

    return config;
  });
}

// Step 2: Write the widget XML resource file
function withWidgetXml(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const xmlDir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res/xml'
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, 'study_room_widget_info.xml'), WIDGET_INFO_XML);
      return config;
    },
  ]);
}

// Step 3: Pin Gradle to 8.10.2 (Gradle 9 breaks React Native IBM_SEMERU toolchain)
function withGradleVersion(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const wrapperPath = path.join(
        config.modRequest.platformProjectRoot,
        'gradle/wrapper/gradle-wrapper.properties'
      );
      if (fs.existsSync(wrapperPath)) {
        let content = fs.readFileSync(wrapperPath, 'utf8');
        content = content.replace(
          /distributionUrl=.*/,
          'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.10.2-bin.zip'
        );
        fs.writeFileSync(wrapperPath, content);
      }
      return config;
    },
  ]);
}

module.exports = function withStudyRoomWidget(config) {
  config = withWidgetManifest(config);
  config = withWidgetXml(config);
  config = withGradleVersion(config);
  return config;
};
