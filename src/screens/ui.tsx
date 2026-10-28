import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
export const money = (n: number) => `$${Number(n).toFixed(2)}`;
export const theme = {
  navy: "#102A43",
  green: "#047857",
  muted: "#64748b",
  bg: "#F4F7FB",
  red: "#B91C1C",
};
export const Btn = ({
  label,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) => (
  <TouchableOpacity
    disabled={disabled}
    onPress={onPress}
    style={[
      styles.btn,
      secondary && styles.btnSecondary,
      danger && { backgroundColor: theme.red },
      disabled && { opacity: 0.35 },
    ]}
  >
    <Text style={[styles.btnText, secondary && { color: theme.navy }]}>
      {label}
    </Text>
  </TouchableOpacity>
);
export const Field = ({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  secure = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  keyboardType?: any;
  secure?: boolean;
}) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      value={value}
      onChangeText={onChange}
      keyboardType={keyboardType}
      secureTextEntry={secure}
    />
  </View>
);
export const Tag = ({ value }: { value: string }) => (
  <View
    style={[
      styles.tag,
      {
        backgroundColor:
          value === "CONFIRMED"
            ? "#D1FAE5"
            : value === "FAILED"
              ? "#FEE2E2"
              : value === "REVIEW"
                ? "#FEF3C7"
                : "#E2E8F0",
      },
    ]}
  >
    <Text
      style={{
        fontSize: 11,
        fontWeight: "800",
        color:
          value === "CONFIRMED"
            ? "#065F46"
            : value === "FAILED"
              ? "#991B1B"
              : value === "REVIEW"
                ? "#92400E"
                : theme.navy,
      }}
    >
      {value}
    </Text>
  </View>
);
export const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { backgroundColor: theme.navy, padding: 18, paddingTop: 45 },
  brand: { fontSize: 27, fontWeight: "900", color: "#fff" },
  subtitle: { color: "#C7DAE7" },
  nav: { flexDirection: "row", backgroundColor: "#fff", padding: 5 },
  navItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 9,
  },
  activeNav: { backgroundColor: theme.navy },
  navText: { fontSize: 10, fontWeight: "800", color: theme.navy },
  h1: { fontSize: 25, fontWeight: "800", color: theme.navy, marginBottom: 8 },
  h2: { fontSize: 18, fontWeight: "800", color: theme.navy, marginBottom: 12 },
  muted: { fontSize: 12, color: theme.muted, marginTop: 5, lineHeight: 18 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 16,
    marginVertical: 7,
    borderColor: "#E2E8F0",
    borderWidth: 1,
  },
  cardTitle: { fontSize: 14, fontWeight: "800", color: theme.navy },
  link: { color: theme.green, fontWeight: "700", marginTop: 8 },
  row: { flexDirection: "row", gap: 7, flexWrap: "wrap", marginVertical: 8 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  btn: {
    padding: 11,
    marginVertical: 5,
    backgroundColor: theme.green,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondary: { backgroundColor: "#E2E8F0" },
  btnText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.navy,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 9,
    padding: 12,
    fontSize: 15,
    color: theme.navy,
    backgroundColor: "#fff",
  },
  tag: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5 },
  choice: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
    borderColor: "#e2e8f0",
    borderBottomWidth: 1,
  },
  stats: { flexDirection: "row", gap: 7, marginVertical: 12 },
  metric: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  metricVal: { fontSize: 22, fontWeight: "900", color: theme.green },
  listRow: {
    borderTopColor: "#E2E8F0",
    borderTopWidth: 1,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  reason: { fontSize: 12, color: theme.red, marginTop: 6 },
});
