import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { onValue, ref } from "firebase/database";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const XENDIT_CREATE_URL =
  "https://mhrm.jpyseyersoled.workers.dev/create-xendit-invoice";
const XENDIT_CHECK_URL =
  "https://mhrm.jpyseyersoled.workers.dev/check-xendit-invoice";

export default function PlansScreen() {
  const router = useRouter();

  const [isPaidPlan, setIsPaidPlan] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setIsPaidPlan(false);
      setLoadingPlan(false);
      return;
    }

    const userRef = ref(db, `users/${uid}`);
    const off = onValue(userRef, (snap) => {
      const val = snap.val() ?? {};
      setIsPaidPlan(!!val.payment);
      setLoadingPlan(false);
    });

    return () => off();
  }, []);

  const handleUpgradeToPro = async () => {
    const uid = auth.currentUser?.uid;
  
    if (!uid) {
      Alert.alert(
        "Sign in required",
        "Please sign in to upgrade to the Pro plan.",
        [
          {
            text: "Go to login",
            onPress: () => router.push("/login"),
          },
          { text: "Cancel", style: "cancel" },
        ]
      );
      return;
    }
  
    try {
      setUpgrading(true);
  
      const res = await fetch(XENDIT_CREATE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: 199,
          description: "Receipt Manager Pro - Monthly Plan",
          userId: uid,
        }),
      });
  
      if (!res.ok) {
        const text = await res.text();
        console.log("Xendit worker error:", text);
        throw new Error(text || "Failed to create invoice");
      }
  
      const data: any = await res.json();
      const invoiceUrl = data?.invoice_url;
  
      if (!invoiceUrl) {
        console.log("Invalid Xendit worker response:", data);
        throw new Error("No invoice_url returned from server");
      }
  
      await WebBrowser.openBrowserAsync(invoiceUrl);
  
    } catch (err: any) {
      console.error("Upgrade error:", err);
      Alert.alert(
        "Upgrade failed",
        err?.message || "Something went wrong while upgrading your plan."
      );
    } finally {
      setUpgrading(false);
    }
  };
  

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backIcon}>◀</Text>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.headerTextWrap}>
          <ThemedText type="title" style={styles.headerTitle}>
            Plans & billing
          </ThemedText>
          <Text style={styles.headerSub}>
            Upgrade your plan to unlock unlimited monthly receipt scans and
            richer insights.
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Free plan */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.planName}>Free</Text>
              <Text style={styles.planPrice}>₱0 / month</Text>
            </View>
            <View style={styles.planTag}>
              <Text style={styles.planTagText}>
                {loadingPlan
                  ? "Loading..."
                  : isPaidPlan
                  ? "Included"
                  : "Current"}
              </Text>
            </View>
          </View>

          <Text style={styles.planDesc}>
            Great for trying out budget tracking with limited receipt scans.
          </Text>

          <View style={styles.featureList}>
            <Text style={styles.featureItem}>
              • Up to 5 scan sessions per budget
            </Text>
            <Text style={styles.featureItem}>• Basic budget insights</Text>
            <Text style={styles.featureItem}>
              • Category breakdown & daily charts
            </Text>
          </View>
        </View>

        {/* Pro plan */}
        <View style={[styles.card, styles.cardPro]}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.planName}>Pro</Text>
              <Text style={styles.planPrice}>₱199 / month</Text>
            </View>
            <View style={[styles.planTag, styles.planTagPro]}>
              <Text style={styles.planTagTextPro}>
                {loadingPlan
                  ? "Loading..."
                  : isPaidPlan
                  ? "Current"
                  : "Recommended"}
              </Text>
            </View>
          </View>

          <Text style={styles.planDesc}>
            For power users who rely on receipt scanning for day-to-day money
            tracking.
          </Text>

          <View style={styles.featureList}>
            <Text style={styles.featureItem}>
              • Unlimited receipt scans per month
            </Text>
            <Text style={styles.featureItem}>• Priority OCR processing</Text>
            <Text style={styles.featureItem}>
              • Deeper insights & trends
            </Text>
          </View>

          {!loadingPlan && !isPaidPlan && (
            <Pressable
              style={[
                styles.proCtaBtn,
                upgrading && { opacity: 0.7 },
              ]}
              disabled={upgrading}
              onPress={handleUpgradeToPro}
            >
              <Text style={styles.proCtaBtnText}>
                {upgrading ? "Redirecting..." : "Upgrade to Pro"}
              </Text>
            </Pressable>
          )}

          {isPaidPlan && !loadingPlan && (
            <Text style={styles.smallHint}>
              You are currently on the Pro plan. Enjoy unlimited scans for all
              budgets for the active month.
            </Text>
          )}

          {!isPaidPlan && (
            <Text style={styles.smallHint}>
              Your Pro plan will give you unlimited scans for all budgets for
              the active month.
            </Text>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 16,
  },
  header: {
    marginBottom: 18,
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
    marginBottom: 8,
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
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  headerSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    maxWidth: 320,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardPro: {
    borderColor: "#4F46E5",
    shadowOpacity: 0.07,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  planName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  planPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginTop: 2,
  },
  planTag: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  planTagPro: {
    backgroundColor: "#EEF2FF",
  },
  planTagText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4B5563",
  },
  planTagTextPro: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4F46E5",
  },
  planDesc: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 10,
  },
  featureList: {
    marginBottom: 12,
  },
  featureItem: {
    fontSize: 12,
    color: "#111827",
    marginBottom: 4,
  },
  proCtaBtn: {
    backgroundColor: "#4F46E5",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  proCtaBtnText: {
    color: "#F9FAFB",
    fontWeight: "700",
    fontSize: 14,
  },
  smallHint: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 8,
  },
});
