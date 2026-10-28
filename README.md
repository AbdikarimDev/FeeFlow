# FeeFlow — Employee Fee Payments (Android)

Fresh standalone React Native + Expo source with bundled Kotlin USSD bridge. No backend required. Designed for 10–20 employees.

## Features
- Register/edit/deactivate employees and store amount, phone, outgoing SIM.
- One-time and monthly schedules; notification reminders **never execute payments**.
- Review employees and total; explicitly approve the batch before transfers.
- One USSD transfer at a time; 3-second cooldown; pause and cancel remaining payments.
- Secure wallet PIN in expo-secure-store, not SQLite.
- Persistent SQLite batch, payment and attempt ledger with unique `(batchId, employeeId)`.
- Separate confirmed / failed / needs-review history; explicit manual verification before retry.
- CSV export compatible with Excel.
- Native Kotlin USSD bridge, accessibility service, and Expo prebuild config plugin included.

## Important limitations
1. **Unverified release source.** This archive is source code, not a compiled/tested APK. Test on the Samsung A17 before using real money. A clean `expo prebuild` must generate the Android project and compile all Kotlin components.
2. Native `resetSession(true)` attempts to dismiss an older USSD dialog but does not prove it closed. Auto-proceeding after a timed-out transfer can cross sessions. For production, implement native dialog-closed confirmation and stop the queue if it cannot be verified.
3. A timeout or unrecognized carrier reply goes into `REVIEW`, not definitive `FAILED`. It is not retried automatically. Operator must verify it was **not paid** before marking it retry-ready.
4. `RETRY_READY` payments are re-executed only when the original batch is explicitly approved again. `CONFIRMED` cannot be retried.
5. When the app is killed or backgrounded, it cannot execute the USSD queue. Android notification delivery may be delayed by power management. Schedule notifications are reminders, not execution guarantees.
6. Android has restrictions on accessibility services, exact alarms and sideloaded app permissions. Enable the app's accessibility service manually, and do not distribute without appropriate platform and regulatory review.
7. No external backend, audit authentication, encrypted database backup or synchronization. Do not delete app data without exporting reports/backing up.
8. Before releasing: review local requirements for employee transfers, verify phone/carrier UI layouts and safe PIN injection, ensure duplicate protection and recovery after process death.

## Setup
Prerequisites: Node 22+, Android SDK, Java 17, Samsung device with USB debugging.

```bash
npm install
npx expo install --fix
npx expo prebuild --platform android --clean
npx expo run:android --device
```

**Kotlin source** is bundled at `native/ussd/*.kt`. `plugins/withUssdNative.js` copies Kotlin, registers its React Native package, and registers accessibility XML/service on prebuild. The Android folder is deliberately generated because the project is a fresh Expo app; no existing Android native project is required.

For standalone APK, after successful native compilation:

```bash
cd android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
adb devices
adb install -r app/build/outputs/apk/release/app-release.apk
```

Configure release signing properly before production use. When installed: grant Phone permission; Android Settings > Accessibility > Installed apps > FeeFlow USSD Service, enable service; choose SIM, store PIN in Settings. First test balance and low-value transactions on a real phone.

## UI flow
Employees → Schedule date/time & monthly/one-time → notification → Home batch review → approve → per-employee payment attempts → History → verify/mark paid or retry after verifying not paid. CSV export from History.

## Security
No PIN saved in employee/transaction records. Local SQLite records contain employee phone numbers, amount, and carrier messages; protect phone access and device backups. The Kotlin accessibility service is sourced from the earlier USSD runner and must be independently tested against your phone firmware.
# FeeFlow
