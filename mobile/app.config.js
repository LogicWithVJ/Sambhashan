const isProduction = process.env.APP_ENV === "production";

module.exports = {
  expo: {
    name: "Sambhashan",
    slug: "sambhashan-mobile",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    scheme: "sambhashan",
    platforms: ["android"],
    android: {
      package: "com.logicwithvj.sambhashan",
      permissions: [
        "android.permission.INTERNET",
        "android.permission.RECORD_AUDIO",
        "android.permission.CAMERA",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.BLUETOOTH",
      ],
      adaptiveIcon: {
        backgroundColor: "#0f172a",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      ["./plugins/withDevelopmentCleartextTraffic", { enabled: !isProduction }],
      [
        "@config-plugins/react-native-webrtc",
        {
          cameraPermission: "Allow Sambhashan to use your camera during video calls.",
          microphonePermission: "Allow Sambhashan to use your microphone during calls.",
        },
      ],
    ],
  },
};
