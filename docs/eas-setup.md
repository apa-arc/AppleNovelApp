# EAS project setup

The repository has EAS preview/production build profiles and OTA publishing workflows. Before running either workflow, link the Expo project once:

1. Create an Expo account and create/link this app as an EAS project.
2. Copy the EAS project UUID from the Expo project settings.
3. In GitHub repository Settings → Secrets and variables → Actions:
   - Add secret `EXPO_TOKEN` with an Expo access token.
   - Add repository variable `EAS_PROJECT_ID` with the project UUID.
4. Run **Build iOS app** for a preview or production build, or **Publish OTA update** for a JavaScript-only update.

The app config reads `EAS_PROJECT_ID` and sets both `extra.eas.projectId` and `updates.url`. The iOS build and OTA workflows run in GitHub Actions, so a local Mac/Xcode is not required for those cloud operations.

## First-time activation checklist

1. Confirm the UUID belongs to the Expo project for this exact app.
2. Add `EAS_PROJECT_ID` as a GitHub Actions repository variable and `EXPO_TOKEN` as a repository secret. Never commit the token.
3. Run **Build iOS app** with the production profile and wait for a successful build. Install that build on an iPhone before expecting OTA delivery; an existing binary without the matching Updates URL/runtime cannot receive these updates.
4. Run **Publish OTA update** and select the same channel used by the installed build (normally `production`). Enter concise release notes.
5. Open the installed app, allow its startup check to finish, and verify that the update can be downloaded and applied after restart. The update center shows the app version and whether Expo Updates is enabled.
6. Publish a second small update to verify the full repeatable release loop.
7. The GitHub OTA workflow runs TypeScript checks and the App feature test suite before publishing, validates the resolved EAS project ID/update URL/runtime version, and publishes only the iOS platform.

The app deliberately uses `checkAutomatically: "NEVER"` because it performs its own startup check after local app data loads and exposes a manual check in「我的」. This avoids competing automatic checks.

A successful cloud build is not the same as an iPhone installation or device test. Native audio, Keychain storage, background playback, and the Kokoro native offline runtime still require final iPhone verification.
