import React from "react";
import { Text, View, TouchableOpacity, Alert } from "react-native";
import { Btn, Field, Tag, money, styles } from "./ui";
import { control } from "../engine";

export default function DashboardScreen(p: any) {
  const {
    employees,
    due,
    rows,
    status,
    plans,
    current,
    items,
    setTick,
    openBatch,
    approveBatch,
  } = p;
  return (
    <>
      <Text style={styles.h1}>Overview</Text>
      <Text style={styles.muted}>{status}</Text>
      <View style={styles.stats}>
        <View style={styles.metric}>
          <Text style={styles.metricVal}>
            {employees.filter((x) => x.active).length}
          </Text>
          <Text>Employees</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricVal}>{due.length}</Text>
          <Text>Due batches</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricVal}>
            {rows.filter((r) => r.state === "REVIEW").length}
          </Text>
          <Text>Needs review</Text>
        </View>
      </View>
      {control.running && (
        <View style={styles.card}>
          <Text style={styles.h2}>Batch running</Text>
          <View style={styles.row}>
            <Btn
              label={control.pauseRequested ? "Resume queue" : "Pause queue"}
              onPress={() => {
                control.pauseRequested = !control.pauseRequested;
                setTick((x) => x + 1);
              }}
              secondary
            />
            <Btn
              label="Cancel remaining"
              danger
              onPress={() =>
                Alert.alert(
                  "Stop remaining transfers?",
                  "Current in-progress USSD cannot be cancelled safely. Future jobs will not begin.",
                  [
                    { text: "Keep" },
                    {
                      text: "Cancel remaining",
                      style: "destructive",
                      onPress: () => {
                        control.cancelRequested = true;
                        setTick((x) => x + 1);
                      },
                    },
                  ],
                )
              }
            />
          </View>
        </View>
      )}
      <Text style={styles.h2}>Payment batches</Text>
      {plans.map((b) => (
        <TouchableOpacity
          key={b.id}
          style={styles.card}
          onPress={() => openBatch(b.id)}
        >
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{b.title}</Text>
            <Tag value={b.state} />
          </View>
          <Text style={styles.muted}>
            {new Date(b.dueAt).toLocaleString()} ·{" "}
            {b.recurring ? "Monthly" : "One-time"}
          </Text>
          <Text style={styles.link}>Review batch ›</Text>
        </TouchableOpacity>
      ))}
      {!plans.length && (
        <Text style={styles.muted}>
          No batches yet. Add employees and create a schedule.
        </Text>
      )}
      {current && (
        <View style={styles.card}>
          <Text style={styles.h2}>Batch #{current.id} review</Text>
          <Text style={styles.muted}>
            {current.title} · {items.length} employees ·{" "}
            {money(items.reduce((a, p) => a + p.amount, 0))}
          </Text>
          {items.map((p) => (
            <View key={p.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  {p.name} · {money(p.amount)}
                </Text>
                <Text style={styles.muted}>
                  {p.phone} · SIM {p.simSlot}
                </Text>
                <Text style={styles.muted}>{p.reason || ""}</Text>
              </View>
              <Tag value={p.state} />
            </View>
          ))}
          {["SCHEDULED", "PAUSED", "CANCELLED", "COMPLETED"].includes(
            current.state,
          ) && items.some((p) => ["READY", "RETRY_READY"].includes(p.state)) ? (
            <Btn
              label="Approve and send batch"
              onPress={() => approveBatch(current)}
              disabled={control.running}
            />
          ) : null}
        </View>
      )}
    </>
  );
}
