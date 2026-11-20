# Offline Kokoro native integration status

The app now has an experimental `react-native-sherpa-onnx` 0.4.4 integration branch. It includes a deterministic postinstall patch for the upstream iOS TurboModule registration, Kokoro dictionary discovery, bilingual lexicon selection, and the native Kokoro `dict_dir` configuration. The branch also adds a config plugin for iOS background-download completion handling.

The upstream issue [#112](https://github.com/XDcobra/react-native-sherpa-onnx/issues/112) reports a TurboModule registration failure on the same Expo SDK 54 / React Native 0.81.5 / iOS New Architecture combination. The local patch is a candidate fix, not a verified upstream fix.

The app-side integration now includes:
- one shared Kokoro int8 multilingual model asset with 103 speaker IDs
- explicit user confirmation before downloading
- checksum verification, progress, pause/resume, extraction, and deletion
- online-first, offline-only, and cloud-only playback modes
- offline synthesis through the same speaker IDs and WAV playback queue as online synthesis
- a startup native-module health check

This branch must remain unmerged until CI completes all of the following:
1. deterministic native patch applies cleanly during `npm install`
2. Expo iOS prebuild and CocoaPods install succeed
3. iOS Simulator app compiles and launches
4. `testSherpaInit()` succeeds at runtime and the app logs `KOKORO_NATIVE_READY`
5. model download, extraction, 103-speaker discovery, and real offline synthesis are validated before enabling this in a production release

If the native module check fails, the app must keep offline controls unavailable, continue to support cloud Kokoro, and never silently fall back to iPhone system speech. No model is downloaded automatically.
