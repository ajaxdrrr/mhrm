import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

export default function OcrResult() {
  const router = useRouter();
  const { uri } = useLocalSearchParams<{ uri: string }>();

  return (
    <ThemedView style={styles.container}>
      {/* Title */}
      <ThemedText type="title" style={styles.title}>
        OCR Result Preview
      </ThemedText>

      {/* Show captured receipt image */}
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="contain"
        />
      ) : (
        <ThemedText>No image received</ThemedText>
      )}

      {/* Placeholder OCR text */}
      <View style={styles.resultBox}>
        <ThemedText type="subtitle" style={styles.resultTitle}>
          Extracted Text (mock for now):
        </ThemedText>
        <ThemedText style={styles.resultText}>
          Example OCR output:  
          {"\n"}Item: Coffee - ₱120  
          {"\n"}Item: Sandwich - ₱250  
          {"\n"}Total: ₱370
        </ThemedText>
      </View>

      {/* Buttons */}
      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, { backgroundColor: "#4F46E5" }]}
          onPress={() => router.back()}
        >
          <ThemedText style={styles.btnText}>Retake</ThemedText>
        </Pressable>

        <Pressable
          style={[styles.btn, { backgroundColor: "#16a34a" }]}
          onPress={() => alert("Save to database (coming soon)")}
        >
          <ThemedText style={styles.btnText}>Save</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, alignItems: "center" },
  title: { marginBottom: 20 },
  image: {
    width: "100%",
    height: 300,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: "#eee",
  },
  resultBox: {
    width: "100%",
    backgroundColor: "#f3f4f6",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  resultTitle: { marginBottom: 8 },
  resultText: { fontSize: 14, color: "#333" },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 12,
  },
  btn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
});
