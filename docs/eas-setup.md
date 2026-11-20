# EAS project setup

The repository has EAS preview/production build profiles and OTA publishing workflows. Before running either workflow, link the Expo project once:

1. Create an Expo account and create/link this app as an EAS project.
2. Copy the EAS project UUID from the Expo project settings.
3. In GitHub repository Settings → Secrets and variables → Actions:
   - Add secret `EXPO_TOKEN` with an Expo access token.
   - Add repository variable `EAS_PROJECT_ID` with the project UUID.
4. Run **Build iOS app** for a preview or production build, or **Publish OTA update** for a JavaScript-only update.

The app config reads `EAS_PROJECT_ID` and sets both `extra.eas.projectId` and `updates.url`. The iOS build and OTA workflows run in GitHub Actions, so a local Mac/Xcode is not required for those cloud operations.

A successful cloud build is not the same as an iPhone installation or device test. Native audio, Keychain storage, background playback, and the Kokoro native offline runtime still require final iPhone verification.
