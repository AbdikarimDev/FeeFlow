import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Notifications from "expo-notifications";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  allEmployees,
  allPayments,
  attempts,
  batches,
  changeBatch,
  Employee,
  initDB,
  makeBatch,
  markNotified,
  Payment,
  payments,
  recurBatch,
  Schedule,
  setPayment,
  toggleEmployee,
  upsertEmployee,
} from "./src/db";
import {
  control,
  permissions,
  pinExists,
  removePin,
  runBatch,
  savePin,
} from "./src/engine";
import { sims, SimInfo } from "./src/ussd";
import { styles, theme, money } from "./src/screens/ui";
import DashboardScreen from "./src/screens/DashboardScreen";
import EmployeesScreen from "./src/screens/EmployeesScreen";
import ScheduleScreen from "./src/screens/ScheduleScreen";
import PaymentHistoryScreen from "./src/screens/PaymentHistoryScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
type Tab = "Home" | "Employees" | "Schedule" | "History" | "Settings";
export default function App() {
  const [tab, setTab] = useState<Tab>("Home");
  const [ready, setReady] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [plans, setPlans] = useState<Schedule[]>([]);
  const [rows, setRows] = useState<
    (Payment & { title: string; dueAt: string })[]
  >([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [items, setItems] = useState<Payment[]>([]);
  const [deviceSims, setDeviceSims] = useState<SimInfo[]>([]);
  const [hasPin, setHasPin] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [simSlot, setSimSlot] = useState("1");
  const [editing, setEditing] = useState<number | null>(null);
  const [title, setTitle] = useState("Monthly fees");
  const [date, setDate] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  );
  const [time, setTime] = useState("09:00");
  const [monthly, setMonthly] = useState(false);
  const [chosen, setChosen] = useState<number[]>([]);
  const [pin, setPinState] = useState("");
  const [status, setStatus] = useState("Ready");
  const [tick, setTick] = useState(0);
  const [attemptList, setAttemptList] = useState<any[]>([]);
  const [attemptFor, setAttemptFor] = useState<number | null>(null);
  const refresh = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      allEmployees(),
      batches(),
      allPayments(),
    ]);
    setEmployees(a);
    setPlans(b);
    setRows(c);
    setHasPin(await pinExists());
    if (selected !== null) setItems(await payments(selected));
  }, [selected]);
  useEffect(() => {
    (async () => {
      try {
        await initDB();
        await Notifications.requestPermissionsAsync();
        if (Platform.OS === "android")
          await Notifications.setNotificationChannelAsync("payments", {
            name: "Payment approvals",
            importance: Notifications.AndroidImportance.HIGH,
          });
        setReady(true);
        await refresh();
        try {
          setDeviceSims(await sims());
        } catch {}
      } catch (e: any) {
        Alert.alert("Setup failed", String(e?.message || e));
      }
    })();
  }, []);
  useEffect(() => {
    if (!ready) return;
    refresh().catch(() => {});
  }, [tick, ready]);
  // Local reminder only: notifications never authorize transfers.
  useEffect(() => {
    if (!ready) return;
    const check = async () => {
      const now = Date.now();
      const all = await batches();
      for (const b of all) {
        if (
          b.state === "SCHEDULED" &&
          new Date(b.dueAt).getTime() <= now &&
          !b.notified
        ) {
          await markNotified(b.id);
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "FeeFlow payment approval",
              body: `${b.title} is due. Open FeeFlow and review the batch.`,
              data: { batchId: b.id },
            },
            trigger: null,
          });
        }
      }
      setTick((v) => v + 1);
    };
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check().catch(() => {});
    });
    check().catch(() => {});
    return () => sub.remove();
  }, [ready]);
  const openBatch = async (id: number) => {
    setSelected(id);
    setItems(await payments(id));
    setTab("Home");
  };
  const showError = (e: any) =>
    Alert.alert("Unable to complete", String(e?.message || e));
  async function saveEmployee() {
    try {
      const a = Number(amount);
      if (
        !name.trim() ||
        !/^\d{7,15}$/.test(phone) ||
        !(a > 0) ||
        ![1, 2].includes(Number(simSlot))
      )
        throw Error("Enter a name, valid phone, positive amount and SIM 1/2");
      await upsertEmployee({
        id: editing || undefined,
        name: name.trim(),
        phone,
        amount: a,
        simSlot: Number(simSlot),
      });
      setName("");
      setPhone("");
      setAmount("");
      setEditing(null);
      setTick((t) => t + 1);
    } catch (e) {
      showError(e);
    }
  }
  function editEmployee(x: Employee) {
    setEditing(x.id);
    setName(x.name);
    setPhone(x.phone);
    setAmount(String(x.amount));
    setSimSlot(String(x.simSlot));
  }
  async function createSchedule() {
    try {
      const d = new Date(`${date}T${time}:00`);
      if (!Number.isFinite(d.getTime()) || d.getTime() < Date.now())
        throw Error("Choose a valid future date/time");
      await makeBatch(
        title.trim() || "Employee fees",
        d.toISOString(),
        monthly,
        chosen,
      );
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "FeeFlow approval required",
          body: `${title}: review and approve employee payments.`,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: d,
        } as any,
      });
      setChosen([]);
      setTab("Home");
      setTick((v) => v + 1);
      Alert.alert(
        "Scheduled",
        "You will be reminded. No money is sent without approval.",
      );
    } catch (e) {
      showError(e);
    }
  }
  const current = plans.find((p) => p.id === selected);
  async function approveBatch(b: Schedule) {
    try {
      if (control.running) throw Error("A batch is already running");
      if (Date.now() < new Date(b.dueAt).getTime())
        throw Error("Batch is not due yet");
      const list = await payments(b.id);
      const todo = list.filter(
        (p) => p.state === "READY" || p.state === "RETRY_READY",
      );
      if (!todo.length) throw Error("No ready payments");
      const sum = todo.reduce((a, p) => a + p.amount, 0);
      Alert.alert(
        "Approve payment batch",
        `${todo.length} employees • ${money(sum)} total\n${b.title}\n\nEach payment will be sent once. Do not close the app during payment.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm and pay",
            onPress: async () => {
              try {
                await permissions();
                if (!(await pinExists()))
                  throw Error("Set the wallet PIN in Settings first");
                await changeBatch(b.id, "RUNNING");
                setStatus(`Paying ${b.title}`);
                const cancelled = await runBatch(todo, async () => {
                  setItems(await payments(b.id));
                  setTick((x) => x + 1);
                });
                if (!cancelled) await changeBatch(b.id, "COMPLETED");
                else await changeBatch(b.id, "CANCELLED");
                if (!cancelled) await recurBatch(b.id);
                setStatus(cancelled ? "Batch cancelled" : "Batch completed");
                setTick((x) => x + 1);
              } catch (e) {
                setStatus("Stopped");
                await changeBatch(b.id, "PAUSED").catch(() => {});
                showError(e);
                setTick((x) => x + 1);
              }
            },
          },
        ],
      );
    } catch (e) {
      showError(e);
    }
  }
  function requestRetry(p: Payment) {
    if (control.running) {
      Alert.alert("Busy", "Wait until the active batch is complete.");
      return;
    }
    Alert.alert(
      "Retry payment safely?",
      `${p.name} — ${money(p.amount)}\n\nOnly retry after checking your wallet/carrier records and confirming this employee was NOT paid. This creates a new attempt.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "I verified NOT paid",
          style: "destructive",
          onPress: async () => {
            await setPayment(p.id, "RETRY_READY", "Operator verified not paid");
            setTick((x) => x + 1);
          },
        },
      ],
    );
  }
  function markPaid(p: Payment) {
    Alert.alert(
      "Manual payment verification",
      `Only mark ${p.name} paid if you have verified the carrier transfer occurred.`,
      [
        { text: "Cancel" },
        {
          text: "Mark paid",
          onPress: async () => {
            await setPayment(p.id, "CONFIRMED", "Manually verified as paid");
            setTick((x) => x + 1);
          },
        },
      ],
    );
  }
  async function exportCSV() {
    try {
      const records = await allPayments();
      const quote = (v: any) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
      const header = [
        "Batch",
        "Due",
        "Employee",
        "Phone",
        "Amount",
        "SIM",
        "State",
        "Attempt",
        "Reason",
        "Carrier Response",
      ];
      const csv = [
        header,
        ...records.map((p) => [
          p.title,
          p.dueAt,
          p.name,
          p.phone,
          p.amount,
          p.simSlot,
          p.state,
          p.attempt,
          p.reason,
          p.response,
        ]),
      ]
        .map((row) => row.map(quote).join(","))
        .join("\r\n");
      const uri =
        (FileSystem.cacheDirectory || FileSystem.documentDirectory) +
        "feeflow-report.csv";
      await FileSystem.writeAsStringAsync(uri, "\ufeff" + csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: "Export FeeFlow payments",
      });
    } catch (e) {
      showError(e);
    }
  }
  if (!ready)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Initializing FeeFlow...</Text>
      </View>
    );
  const due = plans.filter(
    (p) => p.state === "SCHEDULED" && new Date(p.dueAt).getTime() <= Date.now(),
  );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar backgroundColor={theme.navy} barStyle="light-content" />
      <View style={styles.top}>
        <Text style={styles.brand}>◈ FeeFlow</Text>
        <Text style={styles.subtitle}>Employee payments · Offline-first</Text>
      </View>
      <View style={styles.nav}>
        {(
          ["Home", "Employees", "Schedule", "History", "Settings"] as Tab[]
        ).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={[styles.navItem, t === tab && styles.activeNav]}
          >
            <Text style={[styles.navText, t === tab && { color: "#fff" }]}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {tab === "Home" && (
          <DashboardScreen
            employees={employees}
            due={due}
            rows={rows}
            status={status}
            plans={plans}
            current={current}
            items={items}
            setTick={setTick}
            openBatch={openBatch}
            approveBatch={approveBatch}
          />
        )}
        {tab === "Employees" && (
          <EmployeesScreen
            editing={editing}
            name={name}
            setName={setName}
            phone={phone}
            setPhone={setPhone}
            amount={amount}
            setAmount={setAmount}
            simSlot={simSlot}
            setSimSlot={setSimSlot}
            saveEmployee={saveEmployee}
            employees={employees}
            editEmployee={editEmployee}
            setTick={setTick}
            setEditing={setEditing}
          />
        )}
        {tab === "Schedule" && (
          <ScheduleScreen
            title={title}
            setTitle={setTitle}
            date={date}
            setDate={setDate}
            time={time}
            setTime={setTime}
            monthly={monthly}
            setMonthly={setMonthly}
            chosen={chosen}
            setChosen={setChosen}
            employees={employees}
            createSchedule={createSchedule}
          />
        )}
        {tab === "History" && (
          <PaymentHistoryScreen
            rows={rows}
            exportCSV={exportCSV}
            requestRetry={requestRetry}
            markPaid={markPaid}
            setAttemptFor={setAttemptFor}
            setAttemptList={setAttemptList}
            attemptFor={attemptFor}
            attemptList={attemptList}
          />
        )}
        {tab === "Settings" && (
          <SettingsScreen
            hasPin={hasPin}
            pin={pin}
            setPinState={setPinState}
            setTick={setTick}
            showError={showError}
            deviceSims={deviceSims}
            setDeviceSims={setDeviceSims}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
