import React from "react";
import { Text, View, TouchableOpacity, Alert } from "react-native";
import { Btn, Field, Tag, money, styles } from "./ui";
import { attempts } from "../db";

export default function PaymentHistoryScreen(p: any) {
  const {
    rows,
    exportCSV,
    requestRetry,
    markPaid,
    setAttemptFor,
    setAttemptList,
    attemptFor,
    attemptList,
  } = p;
  return (
    <>
      <Text style={styles.h1}>Payment history</Text>
      <Btn label="Export CSV for Excel" onPress={exportCSV} />
      {rows.map((p) => (
        <View key={p.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>
              {p.name} — {money(p.amount)}
            </Text>
            <Tag value={p.state} />
          </View>
          <Text style={styles.muted}>
            {p.title} · {p.phone} · SIM {p.simSlot}
          </Text>
          <Text style={styles.muted}>
            Attempt #{p.attempt} · {new Date(p.updatedAt).toLocaleString()}
          </Text>
          {p.reason && <Text style={styles.reason}>Reason: {p.reason}</Text>}
          {p.response && (
            <Text style={styles.muted}>
              Carrier: {p.response.slice(0, 240)}
            </Text>
          )}
          <View style={styles.row}>
            <Btn
              label="Attempts"
              secondary
              onPress={async () => {
                setAttemptFor(p.id);
                setAttemptList(await attempts(p.id));
              }}
            />
            {["FAILED", "REVIEW"].includes(p.state) && (
              <Btn
                label="Verify not paid / Retry"
                secondary
                onPress={() => requestRetry(p)}
              />
            )}{" "}
            {p.state === "REVIEW" && (
              <Btn label="Mark paid" secondary onPress={() => markPaid(p)} />
            )}
          </View>
          {attemptFor === p.id && (
            <View style={{ marginTop: 8 }}>
              {attemptList.map((a) => (
                <Text style={styles.muted} key={a.id}>
                  Attempt {a.number}: {a.status} · {a.reason || ""}
                </Text>
              ))}
            </View>
          )}
        </View>
      ))}
      {!rows.length && (
        <Text style={styles.muted}>No payment history yet.</Text>
      )}
    </>
  );
}
