#!/bin/bash
# Compile l'APK signé (nécessite JDK 21, le SDK Android et android/keystore.properties)
set -e
cd "$(dirname "$0")/.."
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
echo "APK : android/app/build/outputs/apk/release/app-release.apk"
