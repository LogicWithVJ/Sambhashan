# Sambhashan Android app

This React Native client shares accounts, profiles, presence, signaling, and call
history with the FastAPI backend. It uses an Expo development build because
`react-native-webrtc` requires native Android code; Expo Go is not supported.

## Requirements

- Node.js and npm
- Android Studio with Android SDK/platform tools, or an Android phone with USB
  debugging enabled
- The Sambhashan backend running and reachable from the Android device
- For a shareable installable APK built in the cloud: a free Expo account

## Install the app on two phones (same Wi-Fi)

The phones use your laptop as the calling server. Keep the laptop on, and keep both
phones and the laptop connected to the same Wi-Fi network. This setup is for testing;
it will not work when the phones leave that network.

1. Start the backend on the laptop. In PowerShell:

   ```powershell
   cd C:\Users\Admin\Desktop\Bhasha_vani\backend
   $env:SECRET_KEY = "replace-this-with-a-long-random-local-testing-secret"
   .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

2. Find the laptop's Wi-Fi IPv4 address by running `ipconfig`. Use the IPv4 address
   under the Wi-Fi adapter, for example `192.168.1.10` (not `127.0.0.1`).
3. On the laptop, open `http://192.168.1.10:8000/api/health` in a browser, replacing
   the example IP. It should show `{"status":"ok"}`. If it does not load, allow Python
   through Windows Firewall on private networks and check that all devices are on the
   same Wi-Fi.
4. Create a free account at `https://expo.dev/signup`. In PowerShell, link this app
   to your Expo account:

   ```powershell
   cd C:\Users\Admin\Desktop\Bhasha_vani\mobile
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```

   Follow the prompts to create/link the Sambhashan project.
5. In the Expo website, open the Sambhashan project's **Environment variables** and
   add `EXPO_PUBLIC_API_URL` for the **preview** environment. Set its value to
   `http://192.168.1.10:8000`, replacing the example with the laptop's Wi-Fi IPv4
   address. This address is included in the app, so keep the laptop IP stable while
   testing.
6. Build the installable Android APK:

   ```powershell
   npx eas-cli@latest build --platform android --profile preview
   ```

   The build command prints a page link when it is finished. Open that link on each
   phone to download and install the APK. Android may ask you to allow installation
   from the browser; only install APKs you built for this project.
7. Open the installed app on both phones. Register a different account on each,
   search the other account by User ID, start a voice call, and accept it on the
   second phone. Allow microphone access. Try mute and end call.

If either phone cannot reach the server, first open
`http://<laptop-wifi-ip>:8000/api/health` in that phone's browser. Calls through the
internet or a different Wi-Fi require deploying the backend to a public HTTPS host;
the laptop setup is local-network testing only.

## Connect an Android phone on Wi-Fi

For a development build installed directly from Android Studio, find the laptop's
IPv4 address with `ipconfig`.
1. Create `mobile/.env.local`:

   ```text
   EXPO_PUBLIC_API_URL=http://192.168.1.10:8000
   ```

   Replace the example address with the laptop's IPv4 address. The phone and laptop
   must be on the same network.
2. Start FastAPI from `backend/` with
   `.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --reload`.
3. If prompted, allow Python through Windows Firewall for private networks.
4. From `mobile/`, run:

   ```powershell
   npm install
   npx expo run:android
   ```

   This creates and installs the native development app. Grant microphone permission
   when Android asks.
5. For later JavaScript-only changes, run `npm start` in `mobile/`.

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
