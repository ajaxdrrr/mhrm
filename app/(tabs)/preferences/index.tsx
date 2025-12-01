import { auth } from "@/lib/firebase";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Link, useRouter, type Href } from "expo-router";
import { signOut } from "firebase/auth";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type RowProps = {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  href?: Href | string;               // ← make href optional
  tint?: string;
  onPress?: () => void;        // ← allow custom action (e.g., logout)
  danger?: boolean;            // ← red style for destructive actions
};

function Row({
  title,
  subtitle,
  icon,
  href,
  tint = "#4F46E5",
  onPress,
  danger = false,
}: RowProps) {
  const content = (
    <View style={styles.row} pointerEvents="box-only">
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: `${danger ? "#ef4444" : tint}15` },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={danger ? "#ef4444" : tint}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.title,
            danger && { color: "#ef4444" },
          ]}
        >
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}
      </View>
      {!danger && (
        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      )}
    </View>
  );

  if (href !== undefined) {
    const linkHref = href as Href;
    return (
      <Link href={linkHref} asChild>
        <Pressable android_ripple={{ color: "rgba(0,0,0,0.06)" }}>
          {content}
        </Pressable>
      </Link>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "rgba(0,0,0,0.06)" }}
    >
      {content}
    </Pressable>
  );
}

export default function SettingsHome() {
  const router = useRouter();
  const [showLogout, setShowLogout] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleLogout = async () => {
    try {
      setBusy(true);
      await signOut(auth);
      await AsyncStorage.removeItem("@user");
      setShowLogout(false);
      router.replace("/login");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Row
            title="Profile"
            subtitle="Name, email, photo"
            icon="person-outline"
            href="/(tabs)/preferences/profile"
          />
          <Row
            title="Categories"
            subtitle="Add new Category"
            icon="grid-outline"
            href="/(tabs)/preferences/categories"
            tint="#7c8dfc"
          />
          <Row
            title="Plans and Billing"
            subtitle="Upgrade your current plan"
            icon="card-outline"
            href="/plans"
            tint="#69d7db"
          />
        </View>

        <View style={styles.card}>
          <Row
            title="About"
            subtitle="Version, licenses"
            icon="information-circle-outline"
            href="/(tabs)/preferences/about"
            tint="#0ea5e9"
          />
          {/* --- Logout row --- */}
          <Row
            title="Logout"
            icon="log-out-outline"   // or "exit-outline" if you prefer
            danger
            onPress={() => setShowLogout(true)}
          />
        </View>
      </ScrollView>

      {/* Logout confirmation modal */}
      <Modal transparent visible={showLogout} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Log out?</Text>
            <Text style={styles.modalBody}>
              You will need to sign in again to access your account.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.btnDanger]}
                onPress={handleLogout}
                disabled={busy}
              >
                <Text style={styles.modalBtnText}>
                  {busy ? "Logging out..." : "Logout"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.btnLight]}
                onPress={() => setShowLogout(false)}
                disabled={busy}
              >
                <Text style={[styles.modalBtnText, { color: "#111827" }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: "#f7f7fb",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 6,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  title: { fontSize: 16, fontWeight: "600", color: "#111827" },
  subtitle: { fontSize: 12, color: "#6B7280", marginTop: 2 },

  // Modal
  modalOverlay: {
    position: "absolute",
    top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  modalBody: { color: "#374151" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    minWidth: 96,
  },
  btnLight: { backgroundColor: "#F3F4F6" },
  btnDanger: { backgroundColor: "#ef4444" },
  modalBtnText: { color: "#fff", fontWeight: "700" },
});
