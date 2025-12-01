// app/(auth)/login.tsx
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

// UI
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import WavyBackground from "@/components/WavyBackground";

// Firebase (Web SDK)
import { auth } from "@/lib/firebase";
import {
  fetchSignInMethodsForEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const onLogin = async () => {
    setHint(null);
    if (!email || !password) {
      Alert.alert("Missing info", "Please enter email and password.");
      return;
    }

    try {
      setSubmitting(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/(tabs)");
    } catch (err: any) {
      const code = err?.code ?? "auth/unknown";
      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found"
      ) {
        try {
          const methods = await fetchSignInMethodsForEmail(auth, email.trim());
          const projectId =
            (auth.app.options as any)?.projectId ?? "unknown-project";
          if (!methods || methods.length === 0) {
            setHint(
              `Invalid email or password`
            );
          } else {
            setHint(
              `Account exists for ${email.trim()} in project “${projectId}”. The credential was rejected (Firebase returns a generic error).`
            );
          }
          console.log("[Auth debug]", {
            projectId,
            email: email.trim(),
            providers: methods,
            err,
          });
        } catch (probeErr) {
          setHint(
            "Login failed. Could not verify account status for this email."
          );
          console.log("[Auth probe error]", probeErr);
        }
      } else if (code === "auth/too-many-requests") {
        setHint(
          "Too many attempts. Temporarily blocked by Firebase. Try again later."
        );
      } else if (code === "auth/user-disabled") {
        setHint("This account is disabled in Firebase.");
      } else {
        setHint(err?.message ?? "Login failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <WavyBackground />

      <ThemedText type="title" style={styles.title}>
        Login
      </ThemedText>

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

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#999"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!submitting}
        returnKeyType="go"
        onSubmitEditing={!submitting ? onLogin : undefined}
      />

      {!!hint && <ThemedText style={styles.hintText}>{hint}</ThemedText>}

      <Pressable
        style={[styles.button, submitting && { opacity: 0.7 }]}
        onPress={onLogin}
        disabled={submitting}
        accessibilityState={{ busy: submitting, disabled: submitting }}
      >
        <ThemedText style={styles.buttonText}>
          {submitting ? "Logging in…" : "Login"}
        </ThemedText>
      </Pressable>

      <View style={{ marginTop: 12, alignItems: "center" }}>
        <ThemedText style={{ fontSize: 16 }}>
          Don’t have an account?{" "}
          <Pressable
            onPress={() => !submitting && router.push("/signup")}
            disabled={submitting}
            hitSlop={10}
            accessibilityRole="link"
          >
            <ThemedText style={{ color: "#4F46E5", fontWeight: "700", textDecorationLine: "underline" }}>
              Sign up
            </ThemedText>
          </Pressable>
        </ThemedText>
      </View>

      {/* Full-screen loader overlay */}
      {submitting && (
        <View style={styles.loaderOverlay} pointerEvents="none">
          <View style={styles.loaderCard}>
            <ActivityIndicator size="large" />
            <ThemedText style={styles.loaderText}>Authenticating…</ThemedText>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
  },
  input: {
    width: "100%",
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
    fontSize: 16,
  },
  hintText: {
    width: "100%",
    color: "red",
    fontSize: 13,
    backgroundColor: "#fff",
    display: "flex",
    alignContent: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "red",
    borderRadius: 10,
    padding: 7,
  },
  button: {
    marginTop: 10,
    width: "100%",
    backgroundColor: "#4F46E5",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
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
  outlinedBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4F46E5",
  },
  // Loader styles
  loaderOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  loaderCard: {
    minWidth: 180,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    gap: 10,
  },
  loaderText: {
    fontSize: 14,
  },
});
