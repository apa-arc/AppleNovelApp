module.exports = ({ config }) => {
  // Keep the existing EAS project linked in every environment, including
  // non-interactive EAS Build workers where EAS_PROJECT_ID may be unset.
  const projectId =
    process.env.EAS_PROJECT_ID ||
    config.extra?.eas?.projectId ||
    "b4d937a0-68db-426d-8114-c4b41cc1d9d4";
  const extra = { ...(config.extra || {}) };
  const updates = { ...(config.updates || {}) };

  extra.eas = { ...(extra.eas || {}), projectId };
  updates.url = "https://u.expo.dev/" + projectId;

  // The unsigned GitHub IPA build does not run through EAS Build, so
  // explicitly embed its update channel. EAS builds keep using eas.json.
  // Versioned release branches package the current JS bundle in the self-sign IPA.
  // Keep this workflow path-triggered so each release artifact matches its source commit.
  const updateChannel = process.env.APP_UPDATE_CHANNEL;
  if (updateChannel) {
    updates.requestHeaders = {
      ...(updates.requestHeaders || {}),
      "expo-channel-name": updateChannel,
    };
  }

  const plugins = [...(config.plugins || [])];
  if (!plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === "expo-audio")) {
    plugins.push([
      "expo-audio",
      {
        microphonePermission: false,
        recordAudioAndroid: false,
        enableBackgroundRecording: false,
      },
    ]);
  }
  if (!plugins.includes("@kesha-antonov/react-native-background-downloader")) {
    plugins.push("@kesha-antonov/react-native-background-downloader");
  }

  const ios = { ...(config.ios || {}) };
  const infoPlist = { ...(ios.infoPlist || {}) };
  const backgroundModes = Array.isArray(infoPlist.UIBackgroundModes)
    ? [...infoPlist.UIBackgroundModes]
    : [];
  if (!backgroundModes.includes("audio")) backgroundModes.push("audio");
  infoPlist.UIBackgroundModes = backgroundModes;
  ios.infoPlist = infoPlist;

  return { ...config, ios, plugins, extra, updates };
};
