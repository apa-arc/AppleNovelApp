# Offline Kokoro native integration blocker

The app's offline voice catalog and manual-download state machine are implemented, but they are not wired to a native inference runtime yet.

The current candidate is `react-native-sherpa-onnx`. Its upstream issue [#112](https://github.com/XDcobra/react-native-sherpa-onnx/issues/112) reports that `TurboModuleRegistry.getEnforcing("SherpaOnnx")` fails on the exact Expo SDK 54 / React Native 0.81.5 / iOS New Architecture combination used by this app. The issue remains open. The latest upstream v0.4.4 release notes do not document a fix for that iOS registration problem.

For that reason, the dependency has deliberately not been added to the production app. A broken native module could prevent the app from launching. The cloud Kokoro path is implemented separately and does not depend on this module.

Before enabling offline model download:
1. Verify a fixed upstream release or a reviewed fork.
2. Run an EAS iOS development build to verify TurboModule registration.
3. Verify Kokoro model archive download, extraction, model discovery, and speaker selection on an iPhone.
4. Only then expose the manual download controls as active.

Until those checks pass, the app must clearly report that offline Kokoro is unavailable. It must not download a 147 MB model that it cannot run, and must not silently fall back to iPhone system speech.
