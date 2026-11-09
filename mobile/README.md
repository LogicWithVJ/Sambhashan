# Sambhashan Android app

This React Native client shares accounts, profiles, presence, signaling, and call
history with the FastAPI backend. It uses an Expo development build because
`react-native-webrtc` requires native Android code; Expo Go is not supported.

## Requirements

- Node.js and npm
- Android Studio with Android SDK/platform tools, or an Android phone with USB
  debugging enabled
- The Sambhashan backend running and reachable from the Android device

## Connect an Android phone on Wi-Fi

1. Find the laptop's IPv4 address with `ipconfig`.
2. Create `mobile/.env.local`:

   ```text
   EXPO_PUBLIC_API_URL=http://192.168.1.10:8000
   ```

   Replace the example address with the laptop's IPv4 address. The phone and laptop
   must be on the same network.
3. Start FastAPI from `backend/` with
   `.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --reload`.
4. If prompted, allow Python through Windows Firewall for private networks.
5. From `mobile/`, run:

   ```powershell
   npm install
   npx expo run:android
   ```

   This creates and installs the native development app. Grant microphone permission
   when Android asks.
6. For later JavaScript-only changes, run `npm start` in `mobile/`.

The development build allows local plain HTTP so it can reach a laptop backend.
Production builds do not enable cleartext HTTP; deploy the API over HTTPS.

## Android Emulator

The default API URL is `http://10.0.2.2:8000`, which reaches the host computer from
the standard Android Studio emulator. Start the emulator, then run `npm run android`.

## Verification

From `mobile/`, run `npm run typecheck`, `npx expo install --check`, and
`npx expo export --platform android`. The last command checks the JavaScript bundle;
an actual Android build and hardware media test require Android SDK/device tools.

## Calling

Sign into two accounts on the Android app and another client (web or a second phone).
Search the other user's ID and start a voice call. Answer the invitation, grant
microphone permission, and try the mute control. Calls may fail on restrictive
networks until a TURN service is configured.
