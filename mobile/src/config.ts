import { Platform } from "react-native";

const androidEmulatorApi = "http://10.0.2.2:8000";
const localWebApi = "http://localhost:8000";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android" ? androidEmulatorApi : localWebApi);
