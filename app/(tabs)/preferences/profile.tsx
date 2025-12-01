import { auth, db } from "@/lib/firebase";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import { onValue, ref, update } from "firebase/database";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function ProfileScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // password modal state
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Load user email + name from Firebase
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    setEmail(user.email ?? "");

    const uid = user.uid;
    const userRef = ref(db, `users/${uid}`);

    const off = onValue(userRef, (snap) => {
      const val = snap.val() ?? {};

      // Prefer name from DB, else fallback to auth profile
      const fromDb = val.name as string | undefined;
      const fallback =
        user.displayName || user.email?.split("@")[0] || "User";

      setName(fromDb || fallback);
    });

    return () => off();
  }, []);

  const handleSaveProfile = async () => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Not signed in", "Please log in again.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("Missing name", "Please enter your name.");
      return;
    }

    try {
      setSavingProfile(true);
      const uid = user.uid;

      // 1) Update name in Realtime Database (merge, don't overwrite)
      await update(ref(db, `users/${uid}`), {
        name: trimmedName,
      });

      // 2) Optionally keep Firebase Auth displayName in sync
      await updateProfile(user, { displayName: trimmedName });

      Alert.alert("Saved", "Profile updated.");
    } catch (error: any) {
      console.log("Profile update error:", error);
      Alert.alert(
        "Error",
        error?.message || "Failed to update your profile. Please try again."
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const openPasswordModal = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordModalVisible(true);
  };

  const handleChangePassword = async () => {
    const user = auth.currentUser;

    if (!user || !user.email) {
      Alert.alert("Error", "No authenticated user found.");
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Missing fields", "Please fill in all password fields.");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(
        "Weak password",
        "New password should be at least 6 characters."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "New password and confirm password do not match.");
      return;
    }

    try {
      setUpdatingPassword(true);

      // 1. Re-authenticate with current password
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );
      await reauthenticateWithCredential(user, credential);

      // 2. Update password
      await updatePassword(user, newPassword);

      Alert.alert("Success", "Your password has been updated.");
      setPasswordModalVisible(false);
    } catch (error: any) {
      console.log("Password change error:", error);
      let message = "Failed to update password. Please try again.";
      if (error?.code === "auth/wrong-password") {
        message = "The current password you entered is incorrect.";
      } else if (error?.code === "auth/too-many-requests") {
        message = "Too many attempts. Please try again later.";
      }
      Alert.alert("Error", message);
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Full Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        editable={false} // fixed email since registration
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Pressable style={styles.btn} onPress={handleSaveProfile}>
        <Text style={styles.btnText}>
          {savingProfile ? "Saving..." : "Save changes"}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.btn, styles.secondaryBtn]}
        onPress={openPasswordModal}
      >
        <Text style={styles.secondaryBtnText}>Change password</Text>
      </Pressable>

      {/* Change Password Modal */}
      <Modal
        transparent
        visible={passwordModalVisible}
        animationType="fade"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change password</Text>

            <Text style={styles.modalLabel}>Current password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Enter current password"
            />

            <Text style={styles.modalLabel}>New password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password"
            />

            <Text style={styles.modalLabel}>Confirm new password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-type new password"
            />

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalPrimaryBtn]}
                onPress={handleChangePassword}
                disabled={updatingPassword}
              >
                <Text style={styles.modalPrimaryText}>
                  {updatingPassword ? "Updating..." : "Update password"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalSecondaryBtn]}
                onPress={() => setPasswordModalVisible(false)}
                disabled={updatingPassword}
              >
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },

  label: { fontSize: 12, color: "#6B7280", marginTop: 14, marginBottom: 6 },

  input: {
    height: 46,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },

  btn: {
    marginTop: 20,
    backgroundColor: "#4F46E5",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700" },

  secondaryBtn: {
    backgroundColor: "#EEF2FF",
    marginTop: 10,
  },
  secondaryBtnText: {
    color: "#4F46E5",
    fontWeight: "700",
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 10,
    marginBottom: 6,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    minWidth: 110,
    alignItems: "center",
  },
  modalPrimaryBtn: {
    backgroundColor: "#4F46E5",
  },
  modalSecondaryBtn: {
    backgroundColor: "#E5E7EB",
  },
  modalPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  modalSecondaryText: {
    color: "#111827",
    fontWeight: "600",
  },
});
