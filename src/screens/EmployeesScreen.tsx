import React from "react";
import { Text, View, TouchableOpacity, Alert } from "react-native";
import { Btn, Field, Tag, money, styles } from "./ui";
import { toggleEmployee } from "../db";

export default function EmployeesScreen(p: any) {
  const {
    editing,
    name,
    setName,
    phone,
    setPhone,
    amount,
    setAmount,
    simSlot,
    setSimSlot,
    saveEmployee,
    employees,
    editEmployee,
    setTick,
    setEditing,
  } = p;
  return (
    <>
      <Text style={styles.h1}>Employees</Text>
      <View style={styles.card}>
        <Text style={styles.h2}>
          {editing ? "Edit employee" : "Register employee"}
        </Text>
        <Field
          label="Full name"
          value={name}
          onChange={setName}
          placeholder="Employee name"
        />
        <Field
          label="Mobile number"
          value={phone}
          onChange={setPhone}
          keyboardType="phone-pad"
          placeholder="61xxxxxxx"
        />
        <Field
          label="Fee amount (USD)"
          value={amount}
          onChange={setAmount}
          keyboardType="decimal-pad"
        />
        <Text style={styles.fieldLabel}>Outgoing SIM</Text>
        <View style={styles.row}>
          <Btn
            secondary={simSlot !== "1"}
            label="SIM 1"
            onPress={() => setSimSlot("1")}
          />
          <Btn
            secondary={simSlot !== "2"}
            label="SIM 2"
            onPress={() => setSimSlot("2")}
          />
        </View>
        <Btn
          label={editing ? "Save changes" : "Add employee"}
          onPress={saveEmployee}
        />
        {editing && (
          <Btn
            label="Cancel edit"
            secondary
            onPress={() => {
              setEditing(null);
              setName("");
              setPhone("");
              setAmount("");
            }}
          />
        )}
      </View>
      {employees.map((e) => (
        <View style={styles.card} key={e.id}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{e.name}</Text>
            <Tag value={e.active ? "ACTIVE" : "INACTIVE"} />
          </View>
          <Text style={styles.muted}>
            {e.phone} · {money(e.amount)} · SIM {e.simSlot}
          </Text>
          <View style={styles.row}>
            <Btn label="Edit" secondary onPress={() => editEmployee(e)} />
            <Btn
              label={e.active ? "Deactivate" : "Activate"}
              secondary
              onPress={async () => {
                await toggleEmployee(e.id, e.active ? 0 : 1);
                setTick((x) => x + 1);
              }}
            />
          </View>
        </View>
      ))}
    </>
  );
}
