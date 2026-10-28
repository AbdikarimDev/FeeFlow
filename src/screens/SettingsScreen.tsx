import React from "react";
import { Text, View, TouchableOpacity, Alert } from "react-native";
import { Btn, Field, Tag, money, styles } from "./ui";
import { savePin, removePin, permissions } from "../engine";
import { sims } from "../ussd";

export default function SettingsScreen(p: any) {
  const {
    hasPin,
    pin,
    setPinState,
    setTick,
    showError,
    deviceSims,
    setDeviceSims,
  } = p;
  return (
    <>
      <Text style={styles.h1}>Settings</Text>
      <View style={styles.card}>
        <Text style={styles.h2}>Wallet PIN</Text>
        <Text style={styles.muted}>
          {hasPin
            ? "PIN stored in Android secure storage"
            : "Set a wallet PIN before approving payments"}
        </Text>
        <Field
          label="PIN (4–8 digits)"
          secure
          keyboardType="number-pad"
          value={pin}
          onChange={setPinState}
        />
        <Btn
          label="Save PIN securely"
          onPress={async () => {
            try {
              await savePin(pin);
              setPinState("");
              setTick((x) => x + 1);
              Alert.alert("Saved", "Wallet PIN stored securely");
            } catch (e) {
              showError(e);
            }
          }}
        />
        <Btn
          secondary
          label="Remove saved PIN"
          onPress={() =>
            Alert.alert(
              "Remove PIN?",
              "This disables future payment execution until you save a new PIN.",
              [
                { text: "Cancel" },
                {
                  text: "Remove",
                  style: "destructive",
                  onPress: async () => {
                    await removePin();
                    setTick((x) => x + 1);
                  },
                },
              ],
            )
          }
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.h2}>Android SIMs</Text>
        {deviceSims.map((s) => (
          <Text key={s.subscriptionId} style={styles.muted}>
            Slot {s.slotIndex + 1}: {s.carrierName} (subscription{" "}
            {s.subscriptionId})
          </Text>
        ))}
        <Btn
          label="Refresh SIM list"
          secondary
          onPress={async () => {
            try {
              setDeviceSims(await sims());
            } catch (e) {
              showError(e);
            }
          }}
        />
        <Btn
          label="Check phone permissions / accessibility"
          secondary
          onPress={() =>
            permissions()
              .then(() =>
                Alert.alert(
                  "Ready",
                  "Native USSD bridge and permissions available",
                ),
              )
              .catch(showError)
          }
        />
      </View>
      <Text style={styles.muted}>
        Payments only run while the app is open and approved. A timeout requires
        review; do not retry an unknown payment until verified not paid.
      </Text>
    </>
  );
}
