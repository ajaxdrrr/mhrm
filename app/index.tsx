import { auth } from "@/lib/firebase"; // your file that exports `auth`
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

const ONBOARD_KEY = "has_seen_onboarding";

export default function Index() {
  const router = useRouter();

  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        const seen = (await AsyncStorage.getItem(ONBOARD_KEY)) === "1";

        unsub = onAuthStateChanged(auth, (user) => {
          const target = !seen
            ? "/onboarding"
            : user
            ? "/(tabs)"
            : "/login";

          // Navigate once
          router.replace(target);

          setBootstrapped(true);
        });
      } catch (e) {
        router.replace("/login");
        setBootstrapped(true);
      }
    })();

    return () => unsub && unsub();
  }, [router]);

  if (!bootstrapped) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return null;
}
