module.exports = ({ config }) => {
  const projectId = process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId;
  const extra = { ...(config.extra || {}) };
  const updates = { ...(config.updates || {}) };

  if (projectId) {
    extra.eas = { ...(extra.eas || {}), projectId };
    updates.url = "https://u.expo.dev/" + projectId;
  }

  return { ...config, extra, updates };
};
