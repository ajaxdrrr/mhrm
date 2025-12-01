import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function AppearanceScreen() {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [size, setSize] = useState<"S" | "M" | "L">("M");

  return (
    <View style={styles.container}>
      <Text style={styles.section}>Theme</Text>
      <Segmented
        options={[["system","System"],["light","Light"],["dark","Dark"]]}
        value={theme}
        onChange={(v) => setTheme(v as any)}
      />
      <Text style={styles.section}>Text size</Text>
      <Segmented
        options={[["S","Small"],["M","Medium"],["L","Large"]]}
        value={size}
        onChange={(v) => setSize(v as any)}
      />
      <Text style={styles.tip}>Theme applies throughout the app (mocked here).</Text>
    </View>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map(([val, label]) => {
        const active = val === value;
        return (
          <Pressable
            key={val}
            onPress={() => onChange(val)}
            style={[styles.segmentBtn, active && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  section: { marginTop: 6, marginBottom: 8, fontWeight: "700", fontSize: 16 },
  tip: { color: "#6B7280", fontSize: 12, marginTop: 10 },
  segment: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    padding: 4,
    borderRadius: 12,
    marginBottom: 14,
  },
  segmentBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
  },
  segmentBtnActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  segmentText: { color: "#374151", fontWeight: "600" },
  segmentTextActive: { color: "#111827" },
});
