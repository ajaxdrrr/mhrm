import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function AboutScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>MHRM App</Text>
      <Text style={styles.mono}>Version 0.1.0</Text>
      <Text style={styles.body}>
        A simple way to scan receipts and track spending. A Capstone presented to _______.
      </Text>
      <Text style={styles.muted}>© {new Date().getFullYear()} Code Pandas</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, padding:16, backgroundColor:"#fff" },
  title: { fontSize:20, fontWeight:"800", marginBottom:6 },
  mono: { fontFamily: "System", color:"#6B7280", marginBottom:14 },
  body: { fontSize:16, color:"#111827", lineHeight:22 },
  muted: { marginTop:16, color:"#9CA3AF", fontSize:12 },
});
