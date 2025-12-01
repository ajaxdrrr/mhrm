import React from "react";
import { Dimensions, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";

const { width, height } = Dimensions.get("screen"); // 👈 full device height

export default function WavyBackground() {
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={styles.svg}
    >
      {/* Top wave */}
      <Path
        d={`M0 0 Q${width / 2} ${height * 0.1} ${width} 0 L${width} 0 L0 0 Z`}
        fill="#4F46E5"
        opacity={0.7}
      />

      {/* Bottom wave */}
      <Path
        d={`M0 ${height * 0.85} Q${width / 2} ${height} ${width} ${
          height * 0.85
        } L${width} ${height} L0 ${height} Z`}
        fill="#6366F1"
        opacity={0.8}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  svg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
