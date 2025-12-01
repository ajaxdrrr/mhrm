import receiptMock from "@/app/receipt_1.json";
import { ThemedView } from "@/components/ThemedView";
import { auth } from "@/lib/firebase";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { get, getDatabase, ref, set } from "firebase/database";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const USE_MOCK = true;

const gen9 = () =>
  String(Math.floor(100_000_000 + Math.random() * 900_000_000));
const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

/** ---------- Categories node types (from Firebase) ---------- */

type CategoryBrand = {
  name: string;
  aliases?: string[]; // optional
};

type CategoryNode = {
  [categoryKey: string]: {
    label?: string;
    brands?: {
      [brandKey: string]: CategoryBrand;
    };
  };
};

/** ---------------- Helpers ---------------- */
const tokenize = (s: string) =>
  (s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

const fmtPhp = (n: number) =>
  `Php ${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const toNum = (v: any) =>
  typeof v === "number"
    ? v
    : parseFloat(String(v ?? "0").replace(/[^\d.-]/g, "")) || 0;

/** Match merchant text using the /categories node */
const mapMerchant = (
  merchantRaw: string,
  categoriesMap?: CategoryNode | null
): { brand: string; category: string } => {
  const niceBrand = (merchantRaw || "Unknown Merchant")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

  if (!categoriesMap || !merchantRaw) {
    return { brand: niceBrand, category: "Uncategorized" };
  }

  const mToks = tokenize(merchantRaw);

  const tokenIncludesAll = (needleTokens: string[]) =>
    needleTokens.every((t) => mToks.includes(t));

  // Iterate categories → brands → name + aliases
  for (const catKey of Object.keys(categoriesMap)) {
    const cat = categoriesMap[catKey];
    const categoryLabel = cat.label || catKey;
    const brands = cat.brands || {};

    for (const brandKey of Object.keys(brands)) {
      const brandObj = brands[brandKey];
      const brandName = brandObj.name;

      // Match by brand name tokens
      if (brandName) {
        const bToks = tokenize(brandName);
        if (bToks.length && tokenIncludesAll(bToks)) {
          return { brand: brandName, category: categoryLabel };
        }
      }

      // Match by aliases tokens
      if (brandObj.aliases && brandObj.aliases.length) {
        for (const alias of brandObj.aliases) {
          const aToks = tokenize(alias);
          if (aToks.length && tokenIncludesAll(aToks)) {
            return { brand: brandName || niceBrand, category: categoryLabel };
          }
        }
      }
    }
  }

  // Fallback if nothing matched
  return { brand: niceBrand, category: "Uncategorized" };
};

/** Parse ONLY merchant + total (with safe fallback compute) */
function parseNanonetsResult(json: any): {
  merchantRaw: string;
  totalNum: number;
} {
  const preds = json?.result?.[0]?.prediction ?? [];
  const merchantRaw =
    preds.find((p: any) => p.label === "Merchant_Name")?.ocr_text || "";
  const totalFromOCR =
    preds.find((p: any) => p.label === "Total_Amount")?.ocr_text || "";

  let computed = 0;
  const tableBlock = preds.find((p: any) => p.type === "table");
  if (tableBlock?.cells?.length) {
    const grouped: Record<number, Record<string, string>> = {};
    for (const c of tableBlock.cells) {
      if (!grouped[c.row]) grouped[c.row] = {};
      grouped[c.row][c.label] = c.text;
    }
    computed = Object.values(grouped).reduce((sum, row) => {
      const qty = Math.max(1, toNum(row["Quantity"]));
      const price = toNum(row["Price"]);
      const line = toNum(row["Line_Amount"]);
      const calc = +(qty * price).toFixed(2);
      return sum + (line || calc || 0);
    }, 0);
  }

  const totalNum = toNum(totalFromOCR) || computed || 0;
  return { merchantRaw, totalNum };
}

/** ---------------- Component ---------------- */
type SummaryRow = { merchant: string; category: string; amount: number };

export default function ScanReceipt() {
  const router = useRouter();
  const { budgetId, name } = useLocalSearchParams<{
    budgetId?: string;
    name?: string;
  }>();

  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [txnName, setTxnName] = useState("");

  // 🔹 Categories loaded from /categories node
  const [categoriesMap, setCategoriesMap] = useState<CategoryNode | null>(null);

  // Load categories map on mount
  useEffect(() => {
    (async () => {
      try {
        const db = getDatabase(auth.app);
        const categoriesRef = ref(db, "categories");
        const snap = await get(categoriesRef);
        if (snap.exists()) {
          setCategoriesMap(snap.val() as CategoryNode);
        } else {
          setCategoriesMap({});
        }
      } catch (err) {
        console.log("Failed to load categories:", err);
        setCategoriesMap({});
      }
    })();
  }, []);

  useEffect(() => {
    const onBack = () => (loading ? true : false);
    if (loading) {
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub?.remove();
    }
  }, [loading]);

  const resetAll = () => {
    setImage(null);
    setSummaryRows([]);
    setTxnName("");
  };

  const pickImageGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
      performOCR(result.assets[0]);
    }
  };

  const pickImageCamera = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
      performOCR(result.assets[0]);
    }
  };

  const performOCR = async (file: any) => {
    try {
      setLoading(true);

      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 400));
        const parsed = parseNanonetsResult(receiptMock);

        // Guard: if total is 0, ask user to rescan and DO NOT add to summary
        if (!parsed.totalNum || parsed.totalNum <= 0) {
          Alert.alert(
            "Try again",
            "We couldn't detect a total amount from this receipt. Please rescan or try a clearer photo."
          );
          return;
        }

        const mapped = mapMerchant(parsed.merchantRaw, categoriesMap);
        setSummaryRows((rows) => [
          ...rows,
          {
            merchant: mapped.brand,
            category: mapped.category,
            amount: parsed.totalNum,
          },
        ]);
        return;
      }

      // LIVE MODE
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        type: "image/jpeg",
        name: "receipt.jpg",
      } as any);

      const response = await fetch(
        "https://app.nanonets.com/api/v2/OCR/Model/a24d7abe-aa37-4a86-8189-faf786abd694/LabelFile/",
        {
          method: "POST",
          headers: {
            Authorization:
              "Basic NjhkZWQxMzItODBiMi0xMWYwLWJiODMtMDY5NGM5NWZhNWRjOg==",
          },
          body: formData,
        }
      );

      const json = await response.json();
      if (!(json?.result?.[0]?.prediction)) {
        Alert.alert("Error", "No text detected in receipt.");
        return;
      }

      const parsed = parseNanonetsResult(json);

      // Same guard for live OCR
      if (!parsed.totalNum || parsed.totalNum <= 0) {
        Alert.alert(
          "Try again",
          "We couldn't detect a total amount from this receipt. Please rescan or try a clearer photo."
        );
        return;
      }

      const mapped = mapMerchant(parsed.merchantRaw, categoriesMap);
      setSummaryRows((rows) => [
        ...rows,
        {
          merchant: mapped.brand,
          category: mapped.category,
          amount: parsed.totalNum,
        },
      ]);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "OCR failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async () => {
    if (!summaryRows.length) {
      Alert.alert("Missing data", "Please scan a receipt first.");
      return;
    }

    const user = auth.currentUser;
    if (!user?.uid) {
      Alert.alert("Not signed in", "Please login first.");
      return;
    }

    if (!budgetId) {
      Alert.alert(
        "No budget selected",
        "Please open Scan from a budget plan so expenses are linked correctly."
      );
      return;
    }

    const db = getDatabase(auth.app);
    const uid = user.uid;

    try {
      setLoading(true);
      const now = new Date();

      // Save each detected row as an expense
      await Promise.all(
        summaryRows.map((r) => {
          const id = gen9();
          const node = ref(db, `expenses/${uid}/${budgetId}/${id}`);
          return set(node, {
            merchant: r.merchant,
            category: r.category,
            total: Number(r.amount),
            createdAt: now.getTime(),
            dayKey: dayKey(now),
            txnName: txnName || null,
            budgetId: String(budgetId),
            monthKey: monthKey(now),
          });
        })
      );

      // Increment scan count for this budget (1 per "Save to budget" session)
      const scanRef = ref(db, `scanCounts/${uid}/${budgetId}`);
      const snap = await get(scanRef);
      const current = Number(snap.val() || 0);
      await set(scanRef, current + 1);

      const totalAmount = summaryRows.reduce((s, r) => s + r.amount, 0);
      Alert.alert(
        "Expense added",
        `${txnName || "Scanned receipts"} — Php ${totalAmount.toFixed(2)}`
      );

      resetAll();

      // Redirect back to Insights with appropriate params
      router.replace({
        pathname: "/insights",
        params: { budgetId: String(budgetId), name: name ?? undefined },
      });
    } catch (e: any) {
      console.error("DB write failed", e);
      Alert.alert("Error", "Failed to save to database.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (budgetId) {
      router.push({
        pathname: "/insights",
        params: { budgetId: String(budgetId), name: name ?? undefined },
      });
    } else {
      router.push("/");
    }
  };

  const sessionTotal = summaryRows.reduce((s, r) => s + r.amount, 0);

  return (
    <ThemedView style={styles.container}>
      <Modal transparent visible={loading} statusBarTranslucent>
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loaderText}>Processing receipt...</Text>
        </View>
      </Modal>

      {/* App Bar with "Back" ABOVE the header */}
      <View style={styles.appBar}>
        <Pressable style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backIcon}>◀</Text>
          <Text style={styles.backText}>Insights</Text>
        </Pressable>

        <View style={styles.appBarTitleWrap}>
          <Text style={styles.appBarTitle}>Scan receipt</Text>
          <Text style={styles.appBarSub}>
            {name ? `Linked to ${name}` : "Attach expenses to your budget"}
          </Text>
        </View>
      </View>

      {/* Hero / Context card */}
      <View style={styles.heroCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>Smart capture</Text>
          <Text style={styles.heroTitle}>Turn receipts into insights</Text>
          <Text style={styles.heroSub}>
            We&apos;ll detect the merchant, category, and total so you can keep
            your budget up to date in seconds.
          </Text>
        </View>

        <View style={styles.heroPill}>
          <Text style={styles.heroPillLabel}>Current session</Text>
          <Text style={styles.heroPillValue}>
            {summaryRows.length ? fmtPhp(sessionTotal) : "No spend yet"}
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Capture card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Capture receipt</Text>
          <Text style={styles.cardSubtitle}>
            Use your camera or gallery. We&apos;ll auto-extract the key details.
          </Text>

          <View style={styles.capturePreview}>
            {!image ? (
              <View style={styles.captureEmpty}>
                <Text style={styles.captureEmptyIcon}>🧾</Text>
                <Text style={styles.captureEmptyText}>No receipt selected</Text>
                <Text style={styles.captureEmptySub}>
                  Add a photo to start scanning
                </Text>
              </View>
            ) : (
              <View style={styles.captureHasImage}>
                <Text style={styles.captureEmptyIcon}>✅</Text>
                <Text style={styles.captureEmptyText}>
                  Receipt ready to process
                </Text>
                <Text style={styles.captureEmptySub} numberOfLines={2}>
                  {image}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.button, styles.buttonSecondary]}
              onPress={pickImageGallery}
            >
              <Text style={styles.buttonText}>Gallery</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonPrimary]}
              onPress={pickImageCamera}
            >
              <Text style={styles.buttonText}>Camera</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonGhost]}
              onPress={resetAll}
            >
              <Text style={styles.buttonGhostText}>Clear</Text>
            </Pressable>
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>Transaction name</Text>
            <TextInput
              value={txnName}
              onChangeText={setTxnName}
              placeholder="e.g., Weekend groceries + takeout"
              style={styles.input}
              editable={!loading}
              returnKeyType="done"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* Summary / table card */}
        {summaryRows.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>2. Detected totals</Text>
            <Text style={styles.cardSubtitle}>
              Review the extracted amounts before saving to your budget.
            </Text>

            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 1.4 }]}>Merchant</Text>
              <Text style={[styles.th, { flex: 1.2 }]}>Category</Text>
              <Text style={[styles.th, { flex: 1 }]}>Total</Text>
            </View>

            {summaryRows.map((row, idx) => (
              <View
                key={`${row.merchant}-${idx}`}
                style={[
                  styles.tableRow,
                  idx % 2 === 1 && styles.tableRowAlt,
                ]}
              >
                <Text style={[styles.td, { flex: 1.4 }]} numberOfLines={2}>
                  {row.merchant}
                </Text>
                <Text style={[styles.td, { flex: 1.2 }]}>{row.category}</Text>
                <Text style={[styles.td, { flex: 1 }]}>{fmtPhp(row.amount)}</Text>
              </View>
            ))}

            <View style={styles.tableFooter}>
              <Text style={styles.footerLabel}>Session total</Text>
              <Text style={styles.footerValue}>{fmtPhp(sessionTotal)}</Text>
            </View>

            <View style={styles.footerHintRow}>
              <Text style={styles.footerHint}>
                These expenses will be linked to{" "}
                <Text style={styles.footerHintBold}>
                  {name || "this budget plan"}
                </Text>
                .
              </Text>
            </View>
          </View>
        )}

        {summaryRows.length > 0 && !loading ? (
          <Pressable style={styles.submitBtn} onPress={handleAddExpense}>
            <Text style={styles.submitBtnText}>Save to budget</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 50,
    backgroundColor: "#F3F4F6",
  },

  // Loader
  loaderOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  loaderText: {
    color: "#F9FAFB",
    marginTop: 10,
    fontSize: 15,
    fontWeight: "600",
  },

  // App bar
  appBar: {
    marginBottom: 14,
  },
  appBarTitleWrap: {
    alignSelf: "flex-start",
    marginTop: 8,
  },
  appBarTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  appBarSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },

  // Hero
  heroCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 18,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
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
    color: "#4F46E5",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  heroSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    lineHeight: 18,
  },
  heroPill: {
    marginLeft: 12,
    alignItems: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#ECFDF3",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  heroPillLabel: {
    fontSize: 10,
    color: "#15803D",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroPillValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
    color: "#166534",
  },

  // Card
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    marginBottom: 10,
  },

  // Capture preview
  capturePreview: {
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5F5",
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  captureEmpty: {
    alignItems: "center",
    gap: 2,
  },
  captureHasImage: {
    alignItems: "center",
    gap: 4,
  },
  captureEmptyIcon: {
    fontSize: 24,
  },
  captureEmptyText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  captureEmptySub: {
    fontSize: 11,
    color: "#6B7280",
    textAlign: "center",
  },

  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  button: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: { backgroundColor: "#4F46E5" },
  buttonSecondary: { backgroundColor: "#6366F1" },
  buttonGhost: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  buttonGhostText: { color: "#4B5563", fontWeight: "600", fontSize: 13 },

  inputWrap: { marginTop: 16 },
  inputLabel: { fontSize: 12, color: "#6B7280", marginBottom: 6 },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    color: "#111827",
    fontSize: 13,
  },

  // Table
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF2FF",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 4,
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  tableRowAlt: { backgroundColor: "#F9FAFB" },
  th: { fontWeight: "700", color: "#111827", fontSize: 11 },
  td: { color: "#111827", fontSize: 12 },
  tableFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    borderTopWidth: 1,
    paddingTop: 10,
    borderColor: "#E5E7EB",
  },
  footerLabel: {
    fontWeight: "600",
    fontSize: 13,
    color: "#4B5563",
  },
  footerValue: {
    fontWeight: "700",
    fontSize: 14,
    color: "#111827",
  },
  footerHintRow: {
    marginTop: 6,
  },
  footerHint: {
    fontSize: 11,
    color: "#6B7280",
  },
  footerHintBold: {
    fontWeight: "600",
    color: "#111827",
  },

  // CTA
  submitBtn: {
    backgroundColor: "#22C55E",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    shadowColor: "#22C55E",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  submitBtnText: {
    color: "#052E16",
    fontWeight: "800",
    fontSize: 15,
  },

  backBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  backText: { color: "#111827", fontWeight: "600", fontSize: 13 },
  backIcon: {
    fontSize: 13,
    color: "#4B5563",
    marginRight: 4,
  },
});
