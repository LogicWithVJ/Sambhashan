const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withDevelopmentCleartextTraffic(config, { enabled }) {
  return withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error("Android application node is missing from the manifest.");
    }

    if (enabled) {
      application.$["android:usesCleartextTraffic"] = "true";
    } else {
      delete application.$["android:usesCleartextTraffic"];
    }
    return modConfig;
  });
};
