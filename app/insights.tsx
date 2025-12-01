import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { auth } from "@/lib/firebase";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getDatabase, onValue, ref } from "firebase/database";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

const SCAN_LIMIT_PER_BUDGET = 5;

type BudgetPlan = {
  id: string;
  budget_name: string;
  budget_period: string;
  budget_income?: number;
  budget_target?: number;
};

type Expense = {
  id: string;
  merchant: string;
  category: string;
  total: number;
  createdAt?: number;
  dayKey?: string; // YYYY-MM-DD for this expense
  txnName?: string | null;
};

const formatCurrency = (n?: number) => {
  const num = typeof n === "number" ? n : 0;
  return `₱${num.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export default function InsightsScreen() {
  const router = useRouter();
  const { budgetId, name } = useLocalSearchParams<{
    budgetId?: string;
    name?: string;
  }>();

  const [plan, setPlan] = useState<BudgetPlan | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(true);

  // Scan / plan state
  const [scanCount, setScanCount] = useState(0);
  const [isPaidPlan, setIsPaidPlan] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const user = auth.currentUser;
  const uid = user?.uid || null;

  // Load budget plan
  useEffect(() => {
    if (!uid || !budgetId) return;
    const db = getDatabase(auth.app);
    const planRef = ref(db, `budget/${uid}/${budgetId}`);

    setLoadingPlan(true);
    const unsub = onValue(planRef, (snap) => {
      const val = snap.val();
      if (!val) {
        setPlan(null);
      } else {
        setPlan({
          id: budgetId,
          budget_name: val.budget_name ?? name ?? "Budget Plan",
          budget_period: val.budget_period ?? "",
          budget_income:
            typeof val.budget_income === "number"
              ? val.budget_income
              : Number(val.budget_income) || 0,
          budget_target:
            typeof val.budget_target === "number"
              ? val.budget_target
              : Number(val.budget_target) || 0,
        });
      }
      setLoadingPlan(false);
    });

    return () => unsub();
  }, [uid, budgetId, name]);

  // Load expenses for THIS budget (per-budget)
  useEffect(() => {
    if (!uid || !budgetId) return;
    const db = getDatabase(auth.app);
    const expRef = ref(db, `expenses/${uid}/${budgetId}`);

    setLoadingExpenses(true);

    const unsub = onValue(expRef, (snap) => {
      const data = snap.val() ?? {};
      const arr: Expense[] = Object.keys(data).map((id) => ({
        id,
        merchant: data[id]?.merchant ?? "Unknown",
        category: data[id]?.category ?? "Other",
        total: Number(data[id]?.total) || 0,
        createdAt: data[id]?.createdAt ?? undefined,
        dayKey: data[id]?.dayKey ?? undefined,
        txnName: data[id]?.txnName ?? null,
      }));
      setExpenses(arr);
      setLoadingExpenses(false);
    });

    return () => unsub();
  }, [uid, budgetId]);

  // Load user payment flag + scan count for this budget
  useEffect(() => {
    if (!uid || !budgetId) return;
    const db = getDatabase(auth.app);

    const userRef = ref(db, `users/${uid}`);
    const scanRef = ref(db, `scanCounts/${uid}/${budgetId}`);

    const offUser = onValue(userRef, (snap) => {
      const val = snap.val() ?? {};
      const paymentFlag = !!val.payment;
      setIsPaidPlan(paymentFlag);
    });

    const offScan = onValue(scanRef, (snap) => {
      const val = snap.val();
      setScanCount(typeof val === "number" ? val : Number(val || 0));
    });

    return () => {
      offUser();
      offScan();
    };
  }, [uid, budgetId]);

  const loading = loadingPlan || loadingExpenses;

  /** ---------- Derived Metrics & Insights ---------- */
  const {
    totalSpent,
    income,
    target,
    plannedSavings,
    actualSavings,
    savingRate,
    overspent,
    overspentAmount,
    overspentPct,
    underAmount,
    underPct,
    deltaSavings,
    deltaSavingsPct,
    categoryEntries,
    dailyEntries,
    avgDailySpend,
    peakDay,
    topMerchants,
    recurringMerchants,
    topCategoryShare,
  } = useMemo(() => {
    const income = plan?.budget_income ?? 0;
    const target = plan?.budget_target ?? 0;
    const totalSpent = expenses.reduce((sum, e) => sum + (e.total || 0), 0);

    const plannedSavings = income && target ? income - target : 0;
    const actualSavings = income ? income - totalSpent : 0;
    const savingRate = income ? actualSavings / income : 0;

    const overspent = target > 0 && totalSpent > target;
    const overspentAmount = overspent ? totalSpent - target : 0;
    const overspentPct = overspent && target ? overspentAmount / target : 0;

    const underAmount = !overspent && target ? target - totalSpent : 0;
    const underPct = !overspent && target ? underAmount / target : 0;

    const deltaSavings = actualSavings - plannedSavings;
    const deltaSavingsPct =
      plannedSavings !== 0 ? deltaSavings / Math.abs(plannedSavings) : 0;

    // Category breakdown
    const catTotals: Record<string, number> = {};
    expenses.forEach((e) => {
      const cat = e.category || "Other";
      catTotals[cat] = (catTotals[cat] || 0) + (e.total || 0);
    });
    const categoryEntries = Object.entries(catTotals).sort(
      (a, b) => b[1] - a[1]
    );

    // Daily totals using dayKey (with fallback to createdAt)
    const dailyTotals: Record<
      string,
      { label: string; amount: number; ts: number }
    > = {};

    expenses.forEach((e) => {
      let key: string | null = null;
      let ts: number | null = null;

      if (e.dayKey) {
        key = e.dayKey;
        const [y, m, d] = e.dayKey.split("-").map(Number);
        if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
          ts = new Date(y, m - 1, d).getTime();
        }
      } else if (e.createdAt) {
        const d = new Date(e.createdAt);
        if (!Number.isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = d.getMonth() + 1;
          const day = d.getDate();
          key = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(
            2,
            "0"
          )}`;
          ts = new Date(y, m - 1, day).getTime();
        }
      }

      if (!key || ts == null) return;

      if (!dailyTotals[key]) {
        const dateObj = new Date(ts);
        const label = `${String(dateObj.getMonth() + 1).padStart(
          2,
          "0"
        )}/${String(dateObj.getDate()).padStart(2, "0")}`; // MM/DD
        dailyTotals[key] = { label, amount: 0, ts };
      }
      dailyTotals[key].amount += e.total || 0;
    });

    const dailyEntries = Object.values(dailyTotals).sort(
      (a, b) => a.ts - b.ts
    );

    // ---------- Pro-only deeper metrics ----------

    // 1) Average daily spend (over active days with any spend)
    const activeDays = dailyEntries.length;
    const avgDailySpend = activeDays > 0 ? totalSpent / activeDays : 0;

    // 2) Peak spend day
    const peakDay =
      dailyEntries.length > 0
        ? dailyEntries.reduce((max, d) =>
            d.amount > max.amount ? d : max
          )
        : null;

    // 3) Merchant stats
    const merchantStats: Record<string, { total: number; count: number }> = {};
    expenses.forEach((e) => {
      const m = e.merchant || "Unknown";
      if (!merchantStats[m]) {
        merchantStats[m] = { total: 0, count: 0 };
      }
      merchantStats[m].total += e.total || 0;
      merchantStats[m].count += 1;
    });

    const merchantEntries = Object.entries(merchantStats).sort(
      (a, b) => b[1].total - a[1].total
    );
    const topMerchants = merchantEntries.slice(0, 3);
    const recurringMerchants = merchantEntries.filter(
      ([, v]) => v.count >= 2
    );

    // 4) Share of top category
    const topCategoryShare =
      totalSpent > 0 && categoryEntries.length
        ? categoryEntries[0][1] / totalSpent
        : 0;

    return {
      totalSpent,
      income,
      target,
      plannedSavings,
      actualSavings,
      savingRate,
      overspent,
      overspentAmount,
      overspentPct,
      underAmount,
      underPct,
      deltaSavings,
      deltaSavingsPct,
      categoryEntries,
      dailyEntries,
      avgDailySpend,
      peakDay,
      topMerchants,
      recurringMerchants,
      topCategoryShare,
    };
  }, [plan, expenses]);

  const statusLabel = useMemo(() => {
    if (!target || totalSpent === 0) return "No activity yet";
    if (overspent) return "Overspent";
    if (totalSpent === target) return "On target";
    return "Under budget";
  }, [overspent, target, totalSpent]);

  const statusColor = overspent ? "#DC2626" : "#16A34A";

  // Handler for Add expenses with scan limit check
  const handleAddExpensesPress = () => {
    if (!uid || !budgetId) return;

    // Free plan + reached scan limit
    if (!isPaidPlan && scanCount >= SCAN_LIMIT_PER_BUDGET) {
      setShowUpgradeModal(true);
      return;
    }

    router.push({
      pathname: "/scan",
      params: { budgetId: String(budgetId), name: plan?.budget_name },
    });
  };

  if (!uid) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Please log in to view insights.</ThemedText>
      </ThemedView>
    );
  }

  if (!budgetId) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>No budget plan selected.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Loading overlay */}
      {loading && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      )}

      {/* Header / AppBar */}
      <View style={styles.header}>
        {/* Top nav row only for the Dashboard button */}
        <View style={styles.topBar}>
          <Pressable style={styles.backBtn} onPress={() => router.push("/")}>
            <Text style={styles.backIcon}>◀</Text>
            <Text style={styles.backText}>Dashboard</Text>
          </Pressable>
        </View>

        {/* Title block separated below */}
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerEyebrow}>Budget Insights</Text>
          <ThemedText
            type="title"
            style={styles.headerTitle}
            numberOfLines={1}
          >
            {plan?.budget_name || name || "Budget Plan"}
          </ThemedText>
          {plan?.budget_period ? (
            <View style={styles.periodPill}>
              <Text style={styles.periodPillText}>{plan.budget_period}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------- Summary Card ---------- */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>Total spent</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(totalSpent)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>Target budget</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(target || 0)}
              </Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>Remaining vs target</Text>
              <Text
                style={[
                  styles.summaryDelta,
                  {
                    color: overspent ? "#DC2626" : "#16A34A",
                  },
                ]}
              >
                {overspent
                  ? `-${formatCurrency(overspentAmount)}`
                  : `+${formatCurrency(underAmount)}`}
              </Text>
            </View>
            <View style={styles.statusPill}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: statusColor },
                ]}
              />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* Add expenses button (with scan usage info for free users) */}
        <Pressable
          style={styles.addExpenseBtn}
          onPress={handleAddExpensesPress}
        >
          <Text style={styles.addExpenseBtnText}>
            Add expenses
            {!isPaidPlan &&
              ` (${Math.min(
                scanCount,
                SCAN_LIMIT_PER_BUDGET
              )}/${SCAN_LIMIT_PER_BUDGET} scans)`}
          </Text>
        </Pressable>

        {/* Top stats / chips */}
        <View style={styles.chipRow}>
          <View style={[styles.chip, { flex: 1.2 }]}>
            <Text style={styles.chipLabel}>Status</Text>
            <Text style={[styles.chipValue, { color: statusColor }]}>
              {statusLabel}
            </Text>
            {!!target && (
              <Text style={styles.chipHint}>
                {overspent
                  ? `Overspent by ${formatCurrency(
                      overspentAmount
                    )} (${Math.round((overspentPct || 0) * 100)}%)`
                  : `Under by ${formatCurrency(underAmount)} (${Math.round(
                      (underPct || 0) * 100
                    )}%)`}
              </Text>
            )}
          </View>

          <View style={[styles.chip, { flex: 1 }]}>
            <Text style={styles.chipLabel}>Planned savings</Text>
            <Text style={styles.chipValue}>
              {formatCurrency(plannedSavings)}
            </Text>
            <Text style={styles.chipHint}>
              Income: {formatCurrency(income)}
            </Text>
          </View>

          <View style={[styles.chip, { flex: 1 }]}>
            <Text style={styles.chipLabel}>Actual savings</Text>
            <Text style={styles.chipValue}>
              {formatCurrency(actualSavings)}
            </Text>
            <Text style={styles.chipHint}>
              {savingRate
                ? `${Math.round((savingRate || 0) * 100)}% of income`
                : "—"}
            </Text>
          </View>
        </View>

        {/* ---------- Graph 1: Spend vs Target ---------- */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Spend vs Target</Text>
            <Text style={styles.cardTitleValue}>
              {formatCurrency(totalSpent)} / {formatCurrency(target)}
            </Text>
          </View>

          <Text style={styles.cardSubtitle}>
            How much of your planned budget you&apos;ve already used.
          </Text>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${
                    target > 0 ? Math.min(1, totalSpent / target) * 100 : 0
                  }%`,
                  backgroundColor: overspent ? "#DC2626" : "#4F46E5",
                },
              ]}
            />
          </View>

          {!!target && (
            <Text style={styles.progressCaption}>
              {target
                ? `${Math.round(
                    Math.min(1, totalSpent / target) * 100
                  )}% of target used`
                : "No target set"}
            </Text>
          )}
        </View>

        {/* ---------- Graph 2: Spending by Category ---------- */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Spending by category</Text>
            <Text style={styles.cardTitleValue}>
              {categoryEntries.length ? "Top categories" : "No data"}
            </Text>
          </View>
          <Text style={styles.cardSubtitle}>
            See where this budget&apos;s money actually goes.
          </Text>

          {categoryEntries.length === 0 ? (
            <Text style={styles.emptyText}>No expenses recorded yet.</Text>
          ) : (
            <View style={{ marginTop: 8 }}>
              {categoryEntries.map(([cat, amt]) => {
                const maxAmt = categoryEntries[0][1] || 1;
                const pct = (amt / maxAmt) * 100;
                const share =
                  totalSpent > 0 ? Math.round((amt / totalSpent) * 100) : 0;
                return (
                  <View key={cat} style={styles.catRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.catLabelRow}>
                        <View style={styles.catDot} />
                        <Text style={styles.catLabel}>{cat}</Text>
                      </View>
                      <Text style={styles.catSub}>
                        {formatCurrency(amt)} • {share}% of spend
                      </Text>
                    </View>
                    <View style={styles.catBarTrack}>
                      <View
                        style={[styles.catBarFill, { width: `${pct}%` }]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ---------- Graph 3: Daily Spending Trend ---------- */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Daily spending trend</Text>
            <Text style={styles.cardTitleValue}>
              {dailyEntries.length ? `${dailyEntries.length} days` : "No data"}
            </Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Visualize how your spending is distributed across the period.
          </Text>

          {dailyEntries.length === 0 ? (
            <Text style={styles.emptyText}>No dated expenses to show.</Text>
          ) : (
            <View style={styles.trendChart}>
              {(() => {
                const maxDaily =
                  dailyEntries.reduce(
                    (m, d) => (d.amount > m ? d.amount : m),
                    0
                  ) || 1;
                return dailyEntries.map((d) => {
                  const height = (d.amount / maxDaily) * 80; // px
                  return (
                    <View key={d.label} style={styles.trendBarContainer}>
                      <View style={[styles.trendBar, { height }]} />
                      <Text style={styles.trendLabel}>{d.label}</Text>
                    </View>
                  );
                });
              })()}
            </View>
          )}
        </View>

        {/* ---------- Insights Summary ---------- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Insights</Text>
          <Text style={styles.cardSubtitle}>
            A quick summary of how this budget is performing.
          </Text>

          <View style={{ marginTop: 10, gap: 8 }}>
            <Text style={styles.insightText}>
              • You spent{" "}
              <Text style={styles.bold}>{formatCurrency(totalSpent)}</Text> out
              of a target of{" "}
              <Text style={styles.bold}>{formatCurrency(target)}</Text>.
            </Text>

            {income ? (
              <Text style={styles.insightText}>
                • Based on your income of{" "}
                <Text style={styles.bold}>{formatCurrency(income)}</Text>, your
                actual savings is{" "}
                <Text style={styles.bold}>
                  {formatCurrency(actualSavings)}
                </Text>{" "}
                ({savingRate ? Math.round(savingRate * 100) : 0}% of income).
              </Text>
            ) : (
              <Text style={styles.insightText}>
                • Set an income for this budget period to unlock savings
                insights.
              </Text>
            )}

            {income && target ? (
              <Text style={styles.insightText}>
                • Compared to your planned savings of{" "}
                <Text style={styles.bold}>
                  {formatCurrency(plannedSavings)}
                </Text>
                , your savings changed by{" "}
                <Text
                  style={[
                    styles.bold,
                    {
                      color:
                        deltaSavings > 0
                          ? "#16A34A"
                          : deltaSavings < 0
                          ? "#DC2626"
                          : "#111827",
                    },
                  ]}
                >
                  {deltaSavings >= 0 ? "+" : ""}
                  {formatCurrency(deltaSavings)}{" "}
                  {deltaSavingsPct
                    ? `(${deltaSavingsPct > 0 ? "+" : ""}${Math.round(
                        deltaSavingsPct * 100
                      )}%)`
                    : ""}
                </Text>
                .
              </Text>
            ) : null}

            {categoryEntries.length > 0 && (
              <Text style={styles.insightText}>
                • Your top spending category is{" "}
                <Text style={styles.bold}>{categoryEntries[0][0]}</Text> at{" "}
                <Text style={styles.bold}>
                  {formatCurrency(categoryEntries[0][1])}
                </Text>
                .
              </Text>
            )}
          </View>
        </View>

        {/* ---------- Pro-only deeper insights ---------- */}
        {isPaidPlan && (
          <View style={styles.card}>
            <View style={styles.proHeaderRow}>
              <Text style={styles.cardTitle}>Deeper insights (Pro)</Text>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            </View>
            <Text style={styles.cardSubtitle}>
              Extra analytics based on your spending pattern for this budget.
            </Text>

            <View style={{ marginTop: 8, gap: 6 }}>
              <Text style={styles.insightText}>
                • You spend{" "}
                <Text style={styles.bold}>
                  {formatCurrency(avgDailySpend)}
                </Text>{" "}
                per active day on average.
              </Text>

              {peakDay && (
                <Text style={styles.insightText}>
                  • Your highest spend day was{" "}
                  <Text style={styles.bold}>{peakDay.label}</Text> with{" "}
                  <Text style={styles.bold}>
                    {formatCurrency(peakDay.amount)}
                  </Text>{" "}
                  spent.
                </Text>
              )}

              {topMerchants.length > 0 && (
                <Text style={styles.insightText}>
                  • Top merchants this period:{" "}
                  <Text style={styles.bold}>
                    {topMerchants
                      .map(
                        ([merchant, stats]) =>
                          `${merchant} (${formatCurrency(stats.total)})`
                      )
                      .join(", ")}
                  </Text>
                  .
                </Text>
              )}

              {recurringMerchants.length > 0 && (
                <Text style={styles.insightText}>
                  • You frequently spend at{" "}
                  <Text style={styles.bold}>
                    {recurringMerchants
                      .map(([merchant]) => merchant)
                      .join(", ")}
                  </Text>
                  .
                </Text>
              )}

              {topCategoryShare > 0 && (
                <Text style={styles.insightText}>
                  • Your top category accounts for{" "}
                  <Text style={styles.bold}>
                    {Math.round(topCategoryShare * 100)}%
                  </Text>{" "}
                  of your total spend.
                </Text>
              )}
            </View>

            {/* PRO CHART: Top merchants bar chart */}
            {topMerchants.length > 0 && (
              <View style={styles.proChartSection}>
                <Text style={styles.proChartTitle}>
                  Top merchants (share of spend)
                </Text>
                <View style={styles.proChart}>
                  {(() => {
                    const maxMerchantTotal =
                      topMerchants[0][1].total || 1;
                    return topMerchants.map(([merchant, stats]) => {
                      const height =
                        (stats.total / maxMerchantTotal) * 80; // px
                      const shortName =
                        merchant.length > 12
                          ? merchant.slice(0, 11) + "…"
                          : merchant;
                      return (
                        <View
                          key={merchant}
                          style={styles.proChartBarContainer}
                        >
                          <View
                            style={[
                              styles.proChartBar,
                              { height },
                            ]}
                          />
                          <Text
                            style={styles.proChartLabel}
                            numberOfLines={1}
                          >
                            {shortName}
                          </Text>
                          <Text style={styles.proChartAmount}>
                            {Math.round(
                              (stats.total / (totalSpent || 1)) * 100
                            )}
                            %
                          </Text>
                        </View>
                      );
                    });
                  })()}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Upgrade modal for scan limit */}
      <Modal transparent visible={showUpgradeModal} animationType="fade">
        <View style={styles.upgradeOverlay}>
          <View style={styles.upgradeCard}>
            <Text style={styles.upgradeTitle}>Upgrade your plan</Text>
            <Text style={styles.upgradeText}>
              You&apos;ve reached the free limit of {SCAN_LIMIT_PER_BUDGET} receipt
              scans for this budget. Upgrade to unlock unlimited smart scans for
              the month and keep your insights fully up to date.
            </Text>

            <View style={styles.upgradeBadgeRow}>
              <View style={styles.upgradeBadge}>
                <Text style={styles.upgradeBadgeText}>Unlimited scans</Text>
              </View>
              <View style={styles.upgradeBadge}>
                <Text style={styles.upgradeBadgeText}>Smarter insights</Text>
              </View>
              <View style={styles.upgradeBadge}>
                <Text style={styles.upgradeBadgeText}>Priority processing</Text>
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
                <Text style={styles.upgradeBtnText}>Go to plans page</Text>
              </Pressable>
              <Pressable
                style={[styles.upgradeBtn, styles.upgradeGhost]}
                onPress={() => setShowUpgradeModal(false)}
              >
                <Text style={[styles.upgradeBtnText, { color: "#111827" }]}>
                  Not now
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 16,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  loaderOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.65)",
    zIndex: 5,
  },

  header: {
    marginBottom: 18,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  backIcon: {
    fontSize: 13,
    color: "#4B5563",
    marginRight: 4,
  },
  backText: { color: "#111827", fontWeight: "600", fontSize: 13 },

  headerTextWrap: {
    alignSelf: "flex-start",
  },
  headerEyebrow: {
    fontSize: 11,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#111827" },
  headerSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  periodPill: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
  },
  periodPillText: {
    fontSize: 11,
    color: "#4B5563",
    fontWeight: "500",
  },

  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 11,
    color: "#6B7280",
  },
  summaryValue: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  summaryDelta: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "700",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },

  addExpenseBtn: {
    marginBottom: 14,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6b33d4",
  },
  addExpenseBtnText: {
    color: "#F9FAFB",
    fontWeight: "700",
    fontSize: 14,
  },

  chipRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  chip: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  chipLabel: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 2,
  },
  chipValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  chipHint: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  cardTitleValue: { fontSize: 13, fontWeight: "600", color: "#4B5563" },
  cardSubtitle: { fontSize: 12, color: "#6B7280", marginBottom: 8 },

  progressTrack: {
    height: 14,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  progressCaption: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 4,
  },

  emptyText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  catLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  catDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#4F46E5",
    marginRight: 6,
  },
  catLabel: { fontSize: 13, fontWeight: "600", color: "#111827" },
  catSub: { fontSize: 11, color: "#6B7280" },
  catBarTrack: {
    width: 100,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  catBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#4F46E5",
  },

  trendChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 10,
    gap: 6,
  },
  trendBarContainer: {
    alignItems: "center",
    justifyContent: "flex-end",
    flex: 1,
  },
  trendBar: {
    width: 10,
    borderRadius: 999,
    backgroundColor: "#6366F1",
  },
  trendLabel: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 4,
  },

  insightText: {
    fontSize: 12,
    color: "#4B5563",
    lineHeight: 18,
  },
  bold: {
    fontWeight: "700",
    color: "#111827",
  },

  // Pro deeper insights styles
  proHeaderRow: {
    flexDirection: "row",
    justifyContent: "spaceBetween",
    alignItems: "center",
    marginBottom: 4,
  },
  proBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
  },
  proBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4F46E5",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // Pro chart styles
  proChartSection: {
    marginTop: 14,
  },
  proChartTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4B5563",
    marginBottom: 8,
  },
  proChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  proChartBarContainer: {
    flex: 1,
    alignItems: "center",
  },
  proChartBar: {
    width: 16,
    borderRadius: 999,
    backgroundColor: "#4F46E5",
  },
  proChartLabel: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 4,
    textAlign: "center",
  },
  proChartAmount: {
    fontSize: 10,
    color: "#4B5563",
    marginTop: 2,
  },

  // Upgrade modal styles
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
