// app/(auth)/signup.tsx
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import WavyBackground from "@/components/WavyBackground";

import { auth } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
} from "firebase/auth";
import { getDatabase, ref, set } from "firebase/database";

export default function SignupScreen() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [agree, setAgree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const validate = () => {
    if (!name.trim()) return "Please enter your full name.";
    if (!phone.trim()) return "Please enter your phone number.";
    if (!email.trim()) return "Please enter your email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "Please enter a valid email address.";
    if (!password || password.length < 6)
      return "Password must be at least 6 characters.";
    if (!agree) return "You must agree to the Terms & Conditions.";
    return null;
  };

  const onSignup = async () => {
    setHint(null);
    const errMsg = validate();
    if (errMsg) {
      setHint(errMsg);
      return;
    }

    try {
      setSubmitting(true);

      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      await updateProfile(cred.user, { displayName: name.trim() });

      const db = getDatabase(auth.app);
      const uid = cred.user.uid;
      const free = 5;
      await set(ref(db, `users/${uid}`), {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        payment: false,
        createdAt: Date.now(),
        agreedToTermsAt: Date.now(),
        trial: free
      });

      await sendEmailVerification(cred.user);

      Alert.alert(
        "Account created",
        "We sent a verification link to your email. Please verify to continue."
      );

      router.replace("/(tabs)");
    } catch (err: any) {
      console.log("[Signup error]", err);
      const code = err?.code ?? "auth/unknown";
      if (code === "auth/email-already-in-use") {
        setHint("An account already exists with this email.");
      } else if (code === "auth/invalid-email") {
        setHint("Invalid email address.");
      } else if (code === "auth/weak-password") {
        setHint("Password is too weak (min 6 chars).");
      } else {
        setHint(err?.message ?? "Sign up failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <WavyBackground />

      <ThemedText type="title" style={styles.title}>
        Create Account
      </ThemedText>

      {/* Name */}
      <TextInput
        style={styles.input}
        placeholder="Full name"
        placeholderTextColor="#999"
        value={name}
        onChangeText={setName}
        editable={!submitting}
        returnKeyType="next"
      />

      {/* Phone */}
      <TextInput
        style={styles.input}
        placeholder="Phone number"
        placeholderTextColor="#999"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        editable={!submitting}
        returnKeyType="next"
      />

      {/* Email */}
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        editable={!submitting}
        returnKeyType="next"
      />

      {/* Password */}
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#999"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!submitting}
        returnKeyType="go"
        onSubmitEditing={!submitting ? onSignup : undefined}
      />

      {/* Terms checkbox */}
      <Pressable
        style={styles.termsRow}
        onPress={() => setAgree((v) => !v)}
        disabled={submitting}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agree }}
      >
        <View style={[styles.checkbox, agree && styles.checkboxChecked]}>
          {agree ? <Text style={styles.checkboxTick}>✓</Text> : null}
        </View>
        <Text style={styles.termsText}>
          I agree with{" "}
          <Text
            style={styles.termsLink}
            onPress={(e) => {
              e.stopPropagation();
              setShowTerms(true);
            }}
          >
            Terms & Conditions
          </Text>
        </Text>
      </Pressable>

      {!!hint && <ThemedText style={styles.hintText}>{hint}</ThemedText>}

      {/* Create Account */}
      <Pressable
        style={[styles.button, submitting && { opacity: 0.7 }]}
        onPress={onSignup}
        disabled={submitting}
        accessibilityState={{ busy: submitting, disabled: submitting }}
      >
        <ThemedText style={styles.buttonText}>
          {submitting ? "Creating account…" : "Create Account"}
        </ThemedText>
      </Pressable>

      <View style={{ marginTop: 12, alignItems: "center" }}>
        <ThemedText style={{ fontSize: 16 }}>
          Don’t have an account?{" "}
          <Pressable
            onPress={() => !submitting && router.push("/login")}
            disabled={submitting}
            hitSlop={10}
            accessibilityRole="link"
          >
            <ThemedText style={{ color: "#4F46E5", fontWeight: "700", textDecorationLine: "underline" }}>
              Sign In
            </ThemedText>
          </Pressable>
        </ThemedText>
      </View>

      {/* Terms modal */}
      <Modal transparent visible={showTerms} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ThemedText type="title" style={{ marginBottom: 8 }}>
              Terms & Conditions
            </ThemedText>
            <ScrollView style={{ maxHeight: 300 }}>
              <Text style={styles.modalBody}>
                By creating an account, you agree to our Terms & Conditions and
                Privacy Policy. You consent to the processing of your data to
                provide core app features. You may delete your account or request
                data export at any time. Do not use the app for illegal activity.
              </Text>
            </ScrollView>

            <Pressable style={styles.closeBtn} onPress={() => setShowTerms(false)}>
              <Text style={styles.closeBtnText}>I Understand</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Loader overlay */}
      {submitting && (
        <View style={styles.loaderOverlay} pointerEvents="none">
          <View style={styles.loaderCard}>
            <ActivityIndicator size="large" />
            <ThemedText style={styles.loaderText}>Creating…</ThemedText>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: "bold", marginBottom: 20 },
  input: {
    width: "100%",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
    fontSize: 16,
  },
  termsRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#4F46E5",
    alignItems: "center", justifyContent: "center", backgroundColor: "#fff",
  },
  checkboxChecked: {
    backgroundColor: "#4F46E5",
    borderColor: "#4F46E5",
  },
  checkboxTick: { color: "#fff", fontWeight: "900", fontSize: 14, lineHeight: 14 },
  termsText: { color: "#374151", fontSize: 13 },
  termsLink: { color: "#4F46E5", fontWeight: "700", textDecorationLine: "underline" },

  hintText: {
    width: "100%",
    color: "#B91C1C",
    fontSize: 13,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 10,
    padding: 8,
  },
  button: {
    marginTop: 6,
    width: "100%",
    backgroundColor: "#4F46E5",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  outlinedBtn: {
    marginTop: 12,
    width: "100%",
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: "#4F46E5",
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  outlinedBtnText: { fontSize: 16, fontWeight: "600", color: "#4F46E5" },

  // Modal
  modalOverlay: {
    position: "absolute", inset: 0 as any,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center", alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%", maxWidth: 560,
    backgroundColor: "#fff", borderRadius: 16,
    padding: 16, gap: 10,
  },
  modalBody: { color: "#111827", lineHeight: 20 },
  closeBtn: {
    marginTop: 10, backgroundColor: "#111827",
    paddingVertical: 12, borderRadius: 10, alignItems: "center",
  },
  closeBtnText: { color: "#fff", fontWeight: "700" },

  // Loader
  loaderOverlay: {
    position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: "rgba(0,0,0,0.15)",
    justifyContent: "center", alignItems: "center",
  },
  loaderCard: {
    minWidth: 180, paddingVertical: 16, paddingHorizontal: 18,
    borderRadius: 14, backgroundColor: "#fff", alignItems: "center", gap: 10,
  },
  loaderText: { fontSize: 14 },
});
