# Android App Plan

## Direction

The Android app uses Capacitor as a thin native shell around the existing hosted Web UI:

- UI and game flow stay in `web/`.
- The Android project lives in `android/`.
- The initial native shell loads `https://werewolf-pwa.vercel.app`.
- Native code is used only for mobile capabilities that WebView/browser policy makes unreliable.

This keeps future UI/UX redesigns centered on the Web app, so Android does not become a second product that drifts behind.

## Current Native Capability

`HostAudioPlugin` exposes a Capacitor plugin named `HostAudio`.

The Web app calls:

```ts
Capacitor.Plugins.HostAudio.play({ key })
```

when available. The Android plugin plays the matching bundled asset:

```text
android/app/src/main/assets/public/audio/host/<key>.mp3
```

If the native plugin is unavailable or fails, the Web app falls back to the existing HTML audio path.

## Development Commands

```bash
npm run android:sync
npm run android:build
npm run android:open
```

`android:build` produces a debug APK at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The local Gradle build uses Android Studio's bundled Java 21 runtime through `android/gradle.properties`.

## Next Steps

1. Test the APK on a physical Android device.
2. Verify host narration plays through native audio across phase transitions.
3. Add a small in-app diagnostic route or debug panel for native plugin availability if needed.
4. Replace default Android launcher/splash assets with Werewolf Host branded assets.
5. Keep UI changes in `web/` unless a feature truly requires native behavior.
