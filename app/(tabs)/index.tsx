import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "expo-router";
import { onValue, push, ref, remove, set } from "firebase/database";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Calendar, DateObject } from "react-native-calendars";

type BudgetPlan = {
  id: string;
  budget_name: string;
  budget_period: string;
  budget_income?: number;
  budget_target?: number;
};

export default function Dashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions(); // currently unused but fine to keep

  const [plans, setPlans] = useState<BudgetPlan[]>([]);
  const [limit, setLimit] = useState<number>(5);
  const [loadingPlans, setLoadingPlans] = useState(true);

  // user + plan info
  const [userName, setUserName] = useState<string | null>(null);
  const [planLabel, setPlanLabel] = useState<string>("Basic Plan");
  const [isPaidPlan, setIsPaidPlan] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [name, setName] = useState("");

  // Upgrade modal for hitting free plan limit
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Date range picker state
  const [startDate, setStartDate] = useState<string | null>(null); // "YYYY-MM-DD"
  const [endDate, setEndDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Budget numbers (string for TextInput)
  const [income, setIncome] = useState("");
  const [targetBudget, setTargetBudget] = useState("");

  // Long press actions menu
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<BudgetPlan | null>(null);

  const uid = auth.currentUser?.uid;

  const parseMoney = (val: string | number | undefined | null): number =>
    typeof val === "number"
      ? val
      : parseFloat(String(val ?? "").replace(/[^\d.]/g, "")) || 0;

  const formatCurrency = (n?: number) => {
    const num = typeof n === "number" ? n : 0;
    if (!num) return "—";
    return `₱${num.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Load user meta (trial, payment, name) and plans
  useEffect(() => {
    if (!uid) return;

    // trial limit
    const trialRef = ref(db, `users/${uid}/trial`);
    const offTrial = onValue(trialRef, (snap) => {
      const val = snap.val();
      setLimit(typeof val === "number" ? val : 5);
    });

    // user meta: name + payment
    const userRef = ref(db, `users/${uid}`);
    const offUser = onValue(userRef, (snap) => {
      const val = snap.val() ?? {};

      const paymentFlag = !!val.payment;
      setIsPaidPlan(paymentFlag);
      setPlanLabel(paymentFlag ? "Pro Plan" : "Basic Plan");

      const authUser = auth.currentUser;
      const fallbackName =
        val.name ||
        authUser?.displayName ||
        authUser?.email?.split("@")[0] ||
        null;
      setUserName(fallbackName);
    });

    // plans list
    const budgetsRef = ref(db, `budget/${uid}`);
    const offPlans = onValue(budgetsRef, (snap) => {
      const data = snap.val() ?? {};
      const arr: BudgetPlan[] = Object.keys(data).map((key) => ({
        id: key,
        budget_name: data[key]?.budget_name ?? "",
        budget_period: data[key]?.budget_period ?? "",
        budget_income: parseMoney(data[key]?.budget_income),
        budget_target: parseMoney(data[key]?.budget_target),
      }));
      arr.reverse(); // newest-ish first
      setPlans(arr);
      setLoadingPlans(false);
    });

    return () => {
      offTrial();
      offUser();
      offPlans();
    };
  }, [uid]);

  const used = plans.length;
  const remaining = Math.max(0, limit - used);

  // --- Calendar Helpers ---
  const toDate = (s: string) => {
    const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
    return new Date(y, m - 1, d);
  };
  const fmt = (date: Date) => {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const daysBetween = (a: string, b: string) => {
    const start = toDate(a);
    const end = toDate(b);
    const out: string[] = [];
    for (
      let dt = new Date(start.getTime());
      dt <= end;
      dt.setDate(dt.getDate() + 1)
    ) {
      out.push(fmt(dt));
    }
    return out;
  };

  const markedDates = useMemo(() => {
    const marks: Record<
      string,
      {
        startingDay?: boolean;
        endingDay?: boolean;
        color?: string;
        textColor?: string;
      }
    > = {};
    if (startDate && endDate) {
      const dates = daysBetween(startDate, endDate);
      dates.forEach((d, i) => {
        if (i === 0) {
          marks[d] = {
            startingDay: true,
            color: "#4F46E5",
            textColor: "#fff",
          };
        } else if (i === dates.length - 1) {
          marks[d] = {
            endingDay: true,
            color: "#4F46E5",
            textColor: "#fff",
          };
        } else {
          marks[d] = { color: "#A5B4FC", textColor: "#111827" };
        }
      });
    } else if (startDate) {
      marks[startDate] = {
        startingDay: true,
        endingDay: true,
        color: "#4F46E5",
        textColor: "#fff",
      };
    }
    return marks;
  }, [startDate, endDate]);

  const onDayPress = (day: DateObject) => {
    const selected = day.dateString; // "YYYY-MM-DD"
    if (!startDate || (startDate && endDate)) {
      setStartDate(selected);
      setEndDate(null);
    } else {
      if (toDate(selected) < toDate(startDate)) {
        setStartDate(selected);
        setEndDate(null);
      } else if (selected === startDate) {
        setEndDate(selected);
      } else {
        setEndDate(selected);
      }
    }
  };

  const resetForm = () => {
    setName("");
    setStartDate(null);
    setEndDate(null);
    setIncome("");
    setTargetBudget("");
  };

  const handleOpenCreateModal = () => {
    if (!uid) {
      Alert.alert("Not signed in", "Please log in to create a budget plan.");
      return;
    }

    // If NOT Pro and already at limit (e.g. 5/5), show upgrade modal instead
    if (!isPaidPlan && plans.length >= limit) {
      setShowUpgradeModal(true);
      return;
    }

    setModalMode("create");
    setSelectedPlan(null);
    resetForm();
    setShowModal(true);
  };

  const handleOpenEditModal = (plan: BudgetPlan) => {
    if (!uid) {
      Alert.alert("Not signed in", "Please log in to edit a budget plan.");
      return;
    }
    setModalMode("edit");
    setSelectedPlan(plan);
    setName(plan.budget_name);

    if (plan.budget_period) {
      const parts = plan.budget_period.split("–").map((p) => p.trim());
      const [start, end] = parts;
      setStartDate(start || null);
      setEndDate(end || null);
    } else {
      setStartDate(null);
      setEndDate(null);
    }

    setIncome(
      plan.budget_income && plan.budget_income > 0
        ? String(plan.budget_income)
        : ""
    );
    setTargetBudget(
      plan.budget_target && plan.budget_target > 0
        ? String(plan.budget_target)
        : ""
    );

    setShowModal(true);
  };

  const handleSave = async () => {
    if (!uid) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("Missing fields", "Please enter a budget plan name.");
      return;
    }
    if (!startDate || !endDate) {
      Alert.alert("Select dates", "Please pick a start and end date.");
      return;
    }

    const incomeNum = parseMoney(income);
    const targetNum = parseMoney(targetBudget);

    if (!incomeNum || !targetNum) {
      Alert.alert(
        "Missing amounts",
        "Please enter both income and target budget for this period."
      );
      return;
    }

    // Enforce 5-plan limit ONLY when not Pro
    if (modalMode === "create" && !isPaidPlan && plans.length >= limit) {
      setShowUpgradeModal(true);
      return;
    }

    try {
      setSaving(true);
      const periodStr = `${startDate} – ${endDate}`;

      if (modalMode === "create") {
        const nodeRef = ref(db, `budget/${uid}`);
        const newRef = push(nodeRef);
        await set(newRef, {
          budget_name: trimmedName,
          budget_period: periodStr,
          budget_income: incomeNum,
          budget_target: targetNum,
        });
      } else if (modalMode === "edit" && selectedPlan) {
        const planRef = ref(db, `budget/${uid}/${selectedPlan.id}`);
        await set(planRef, {
          budget_name: trimmedName,
          budget_period: periodStr,
          budget_income: incomeNum,
          budget_target: targetNum,
        });
      }

      setShowModal(false);
      setSelectedPlan(null);
      resetForm();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save budget plan.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlan = (plan: BudgetPlan) => {
    if (!uid) return;

    Alert.alert(
      "Delete budget plan",
      `Are you sure you want to delete "${plan.budget_name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const planRef = ref(db, `budget/${uid}/${plan.id}`);
              await remove(planRef);
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to delete budget plan.");
            }
          },
        },
      ]
    );
  };

  const handleAddExpense = (plan: BudgetPlan) => {
    router.push({
      pathname: "/scan",
      params: { budgetId: plan.id },
    });
  };

  const handleOpenInsights = (plan: BudgetPlan) => {
    router.push({
      pathname: "/insights",
      params: { budgetId: plan.id, name: plan.budget_name },
    });
  };

  const openActionMenu = (plan: BudgetPlan) => {
    setSelectedPlan(plan);
    setActionMenuVisible(true);
  };

  const closeActionMenu = () => {
    setActionMenuVisible(false);
  };

  const renderItem = ({ item }: { item: BudgetPlan }) => {
    const incomeNum = item.budget_income ?? 0;
    const targetNum = item.budget_target ?? 0;
    const plannedSavings =
      incomeNum && targetNum ? incomeNum - targetNum : undefined;

    return (
      <Pressable
        style={styles.planItem}
        onPress={() => handleOpenInsights(item)}
        onLongPress={() => openActionMenu(item)}
        delayLongPress={300}
      >
        <View style={styles.planRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.planTitle}>{item.budget_name}</ThemedText>
            <ThemedText style={styles.planPeriod}>
              {item.budget_period}
            </ThemedText>

            {(incomeNum || targetNum) && (
              <View style={styles.planMetaRow}>
                <ThemedText style={styles.planMetaText}>
                  Target: {formatCurrency(targetNum)}
                </ThemedText>
                <ThemedText style={styles.planMetaDot}>•</ThemedText>
                <ThemedText style={styles.planMetaText}>
                  Planned savings:{" "}
                  {plannedSavings !== undefined
                    ? formatCurrency(plannedSavings)
                    : "—"}
                </ThemedText>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  const incomeNumPreview = parseMoney(income);
  const targetNumPreview = parseMoney(targetBudget);
  const plannedSavingsPreview =
    incomeNumPreview && targetNumPreview
      ? incomeNumPreview - targetNumPreview
      : 0;

  return (
    <ThemedView style={styles.container}>
      {/* Hero Header */}
      <View style={styles.heroWrapper}>
        <View style={styles.heroCard}>
          <ThemedText style={styles.heroLabel}>Budget Overview</ThemedText>
          <ThemedText style={styles.heroGreeting}>
            Welcome back{userName ? `, ${userName}` : ""}
          </ThemedText>
          <ThemedText style={styles.heroSubtitle}>
            Stay on top of your spending and keep each plan under control.
          </ThemedText>

          <View style={styles.heroChipsRow}>
            <View
              style={[
                styles.heroChip,
                isPaidPlan ? styles.heroChipPro : styles.heroChipBasic,
              ]}
            >
              <ThemedText style={styles.heroChipLabel}>Plan</ThemedText>
              <ThemedText style={styles.heroChipValue}>{planLabel}</ThemedText>
            </View>

            <View style={styles.heroChip}>
              <ThemedText style={styles.heroChipLabel}>
                {isPaidPlan ? "Budget plans" : "Budget slots"}
              </ThemedText>

              {isPaidPlan ? (
                <>
                  <ThemedText style={styles.heroChipValue}>
                    {used} active
                  </ThemedText>
                  <ThemedText style={styles.heroChipHint}>
                    Unlimited budgets on Pro
                  </ThemedText>
                </>
              ) : (
                <>
                  <ThemedText style={styles.heroChipValue}>
                    {used}/{limit}
                  </ThemedText>
                  <ThemedText style={styles.heroChipHint}>
                    {remaining > 0
                      ? `${remaining} remaining on your trial`
                      : "Limit reached"}
                  </ThemedText>
                </>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Floating main card */}
      <View style={styles.mainCard}>
        {/* Create Budget Button + usage badge */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#4F46E5" }]}
            onPress={handleOpenCreateModal}
          >
            <ThemedText style={styles.actionText}>
              Create a Budget Plan
            </ThemedText>
          </Pressable>

          <View style={styles.limitPill}>
            <ThemedText style={styles.limitText}>
              {isPaidPlan ? `${used}` : `${plans.length}/${limit}`}
            </ThemedText>
            <ThemedText style={styles.limitSubText}>
              {isPaidPlan ? "Plans on Pro" : "Plans used"}
            </ThemedText>
          </View>
        </View>

        {/* Budget Plans */}
        <View style={styles.listBox}>
          <View style={styles.listHeaderRow}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Your budget plans
            </ThemedText>
          </View>

          <FlatList
            data={plans}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              !loadingPlans ? (
                <ThemedText style={{ opacity: 0.65 }}>
                  No budget plans yet. Tap “Create a Budget Plan” to get
                  started.
                </ThemedText>
              ) : null
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>

      {/* Create / Edit Modal (scrollable) */}
      <Modal transparent visible={showModal} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <ThemedText type="title" style={styles.modalTitle}>
                {modalMode === "create"
                  ? "Create Budget Plan"
                  : "Edit Budget Plan"}
              </ThemedText>

              <View style={{ gap: 12 }}>
                {/* Name */}
                <View>
                  <ThemedText style={styles.inputLabel}>
                    Budget Plan Name
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., September Groceries"
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                {/* Date range picker */}
                <View>
                  <ThemedText style={styles.inputLabel}>Budget Period</ThemedText>
                  <View style={styles.rangeHeader}>
                    <ThemedText style={styles.rangeText}>
                      {startDate && endDate
                        ? `${startDate} – ${endDate}`
                        : startDate
                        ? `${startDate} – …`
                        : "Select a start date, then an end date"}
                    </ThemedText>
                    {(startDate || endDate) && (
                      <Pressable
                        style={styles.clearBtn}
                        onPress={() => {
                          setStartDate(null);
                          setEndDate(null);
                        }}
                      >
                        <ThemedText style={styles.clearBtnText}>
                          Clear
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>

                  <Calendar
                    markingType="period"
                    markedDates={markedDates}
                    onDayPress={onDayPress}
                    enableSwipeMonths
                    theme={{
                      todayTextColor: "#4F46E5",
                      arrowColor: "#4F46E5",
                    }}
                  />
                </View>

                {/* Income & Target budget */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.inputLabel}>
                      Income for this period
                    </ThemedText>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 30000"
                      keyboardType="numeric"
                      value={income}
                      onChangeText={setIncome}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.inputLabel}>
                      Target budget (spend)
                    </ThemedText>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 20000"
                      keyboardType="numeric"
                      value={targetBudget}
                      onChangeText={setTargetBudget}
                    />
                  </View>
                </View>

                <ThemedText style={{ opacity: 0.8, fontSize: 12 }}>
                  Planned savings for this period:{" "}
                  {plannedSavingsPreview
                    ? formatCurrency(plannedSavingsPreview)
                    : "—"}
                </ThemedText>

                {!isPaidPlan && (
                  <ThemedText style={{ opacity: 0.7, fontSize: 12 }}>
                    You have {remaining} budget slot
                    {remaining === 1 ? "" : "s"} remaining on your current plan.
                  </ThemedText>
                )}
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalBtn, styles.btnPrimary]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <ThemedText style={styles.modalBtnText}>
                    {saving
                      ? "Saving..."
                      : modalMode === "create"
                      ? "Create"
                      : "Save changes"}
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, styles.btnLight]}
                  onPress={() => {
                    setShowModal(false);
                    setSelectedPlan(null);
                  }}
                  disabled={saving}
                >
                  <ThemedText
                    style={[styles.modalBtnText, { color: "#111827" }]}
                  >
                    Cancel
                  </ThemedText>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Long-press Action Menu */}
      <Modal transparent visible={actionMenuVisible} animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={closeActionMenu}>
          <View style={styles.actionsSheet}>
            <ThemedText style={styles.actionsSheetTitle}>
              {selectedPlan?.budget_name ?? "Budget actions"}
            </ThemedText>

            <Pressable
              style={styles.actionsItem}
              onPress={() => {
                if (selectedPlan) {
                  closeActionMenu();
                  handleOpenEditModal(selectedPlan);
                }
              }}
            >
              <ThemedText style={styles.actionsItemText}>✏️ Edit</ThemedText>
            </Pressable>

            <Pressable
              style={styles.actionsItem}
              onPress={() => {
                if (selectedPlan) {
                  closeActionMenu();
                  handleDeletePlan(selectedPlan);
                }
              }}
            >
              <ThemedText style={[styles.actionsItemText, { color: "#DC2626" }]}>
                🗑 Delete
              </ThemedText>
            </Pressable>

            <Pressable
              style={styles.actionsItem}
              onPress={() => {
                if (selectedPlan) {
                  closeActionMenu();
                  handleAddExpense(selectedPlan);
                }
              }}
            >
              <ThemedText style={styles.actionsItemText}>
                ➕ Add expense
              </ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Upgrade modal for hitting the free budget-plan limit */}
      <Modal transparent visible={showUpgradeModal} animationType="fade">
        <View style={styles.upgradeOverlay}>
          <View style={styles.upgradeCard}>
            <ThemedText style={styles.upgradeTitle}>
              Upgrade your plan
            </ThemedText>
            <ThemedText style={styles.upgradeText}>
              You&apos;ve reached the free limit of {limit} budget plans. Upgrade
              to unlock unlimited budgets, deeper insights, and more control
              over your spending.
            </ThemedText>

            <View style={styles.upgradeBadgeRow}>
              <View style={styles.upgradeBadge}>
                <ThemedText style={styles.upgradeBadgeText}>
                  Unlimited plans
                </ThemedText>
              </View>
              <View style={styles.upgradeBadge}>
                <ThemedText style={styles.upgradeBadgeText}>
                  Deeper insights
                </ThemedText>
              </View>
              <View style={styles.upgradeBadge}>
                <ThemedText style={styles.upgradeBadgeText}>
                  Priority support
                </ThemedText>
              </View>
            </View>

            <View style={styles.upgradeActions}>
              <Pressable
                style={[styles.upgradeBtn, styles.upgradePrimary]}
                onPress={() => {
                  setShowUpgradeModal(false);
                  router.push("/plans");
                }}
              >
                <ThemedText style={styles.upgradeBtnText}>
                  Go to plans page
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.upgradeBtn, styles.upgradeGhost]}
                onPress={() => setShowUpgradeModal(false)}
              >
                <ThemedText
                  style={[styles.upgradeBtnText, { color: "#111827" }]}
                >
                  Not now
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingBottom: 16,
    paddingTop: 10
  },

  heroWrapper: {
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 8,
  },

  heroCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },

  mainCard: {
    flex: 1,
    marginTop: 8,
    marginHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  heroLabel: {
    fontSize: 11,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heroGreeting: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#4B5563",
  },

  heroChipsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  heroChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#F9FAFF",
    borderWidth: 1,
    borderColor: "#E0E7FF",
  },
  heroChipBasic: {
    borderColor: "#E0E7FF",
    backgroundColor: "#EEF2FF",
  },
  heroChipPro: {
    borderColor: "#FACC15",
    backgroundColor: "#FEF3C7",
  },
  heroChipLabel: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 2,
  },
  heroChipValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  heroChipHint: {
    fontSize: 11,
    marginTop: 2,
    color: "#6B7280",
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    flexGrow: 1,
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  limitPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
    alignItems: "flex-start",
  },
  limitText: { fontWeight: "800", color: "#4F46E5", fontSize: 14 },
  limitSubText: { fontSize: 11, color: "#6B7280", marginTop: 2 },

  listBox: { flex: 1, marginTop: 4 },
  listHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 8,
  },
  sectionTitle: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 16,
  },
  sectionHint: {
    fontSize: 11,
    color: "#6B7280",
  },

  planItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  planTitle: { fontSize: 15, fontWeight: "600", color: "#111827" },
  planPeriod: { fontSize: 12, marginTop: 2, color: "#6B7280" },
  planMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    flexWrap: "wrap",
  },
  planMetaText: {
    fontSize: 11,
    color: "#4B5563",
  },
  planMetaDot: {
    marginHorizontal: 4,
    fontSize: 11,
    color: "#9CA3AF",
  },

  separator: { height: 10 },

  // Modal
  modalOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "80%", // so ScrollView can scroll
    backgroundColor: "#F9FAFB",
    borderRadius: 18,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },

  inputLabel: { marginBottom: 6, color: "#4B5563", fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    color: "#111827",
  },

  rangeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  rangeText: { fontSize: 12, color: "#4B5563" },
  clearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
  },
  clearBtnText: { fontWeight: "600", color: "#111827", fontSize: 12 },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    minWidth: 110,
  },
  btnLight: { backgroundColor: "#E5E7EB" },
  btnPrimary: { backgroundColor: "#4F46E5" },
  modalBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Long-press actions sheet
  actionsSheet: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  actionsSheetTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
    paddingHorizontal: 4,
    color: "#111827",
  },
  actionsItem: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  actionsItemText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },

  // Upgrade modal styles (for free plan budget limit)
  upgradeOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  upgradeCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 6,
  },
  upgradeText: {
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 19,
  },
  upgradeBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
  },
  upgradeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
  },
  upgradeBadgeText: {
    fontSize: 11,
    color: "#4F46E5",
    fontWeight: "600",
  },
  upgradeActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 14,
    gap: 8,
  },
  upgradeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    minWidth: 110,
  },
  upgradePrimary: {
    backgroundColor: "#4F46E5",
  },
  upgradeGhost: {
    backgroundColor: "#E5E7EB",
  },
  upgradeBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#F9FAFB",
  },
});
