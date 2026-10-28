import React from "react";
import { Text, View, TouchableOpacity, Alert } from "react-native";
import { Btn, Field, Tag, money, styles } from "./ui";

export default function ScheduleScreen(p: any) {
  const {
    title,
    setTitle,
    date,
    setDate,
    time,
    setTime,
    monthly,
    setMonthly,
    chosen,
    setChosen,
    employees,
    createSchedule,
  } = p;
  return (
    <>
      <Text style={styles.h1}>Schedule payments</Text>
      <View style={styles.card}>
        <Field label="Batch title" value={title} onChange={setTitle} />
        <Field
          label="Date (YYYY-MM-DD)"
          value={date}
          onChange={setDate}
          placeholder="2026-11-01"
        />
        <Field
          label="Time (HH:MM, 24-hour)"
          value={time}
          onChange={setTime}
          placeholder="09:00"
        />
        <Text style={styles.fieldLabel}>Frequency</Text>
        <View style={styles.row}>
          <Btn
            label="One time"
            secondary={monthly}
            onPress={() => setMonthly(false)}
          />
          <Btn
            label="Monthly"
            secondary={!monthly}
            onPress={() => setMonthly(true)}
          />
        </View>
        <Text style={styles.fieldLabel}>
          Select employees ({chosen.length})
        </Text>
        {employees
          .filter((e) => e.active)
          .map((e) => (
            <TouchableOpacity
              key={e.id}
              onPress={() =>
                setChosen((a) =>
                  a.includes(e.id) ? a.filter((i) => i !== e.id) : [...a, e.id],
                )
              }
              style={styles.choice}
            >
              <Text style={styles.cardTitle}>
                {chosen.includes(e.id) ? "☑" : "☐"} {e.name}
              </Text>
              <Text>{money(e.amount)}</Text>
            </TouchableOpacity>
          ))}
        <Text style={styles.muted}>
          Total:{" "}
          {money(
            employees
              .filter((e) => chosen.includes(e.id))
              .reduce((a, e) => a + e.amount, 0),
          )}
        </Text>
        <Btn
          label="Save schedule (approval required)"
          onPress={createSchedule}
        />
      </View>
      <Text style={styles.muted}>
        A notification is a reminder only. You must open the app and approve
        before money is sent. Monthly schedules create the next batch after
        processing the current one.
      </Text>
    </>
  );
}
