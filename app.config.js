module.exports = ({ config }) => {
  const projectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;
  const extra = { ...(config.extra || {}) };
  const updates = { ...(config.updates || {}) };

  if (projectId) {
    extra.eas = { ...(extra.eas || {}), projectId };
    updates.url = "https://u.expo.dev/" + projectId;
  }

  // The unsigned GitHub IPA build does not run through EAS Build, so
  // explicitly embed its update channel. EAS builds keep using eas.json.
  const updateChannel = process.env.APP_UPDATE_CHANNEL;
  if (updateChannel) {
    updates.requestHeaders = {
      ...(updates.requestHeaders || {}),
      "expo-channel-name": updateChannel,
    };
  }

  return { ...config, extra, updates };
};
