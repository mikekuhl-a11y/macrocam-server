import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

type Meal = {
  id: string;
  ts: number;
  description: string;
  calories: number;
  protein_g: number;
};

const STORAGE_KEY = "@macrocam_meals_v1";

function dateKey(ts: number) {
  return new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
}

function lastNDays(n: number) {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out; // today first
}

export default function WeekScreen() {
  const insets = useSafeAreaInsets();
  const [meals, setMeals] = useState<Meal[]>([]);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      setMeals(raw ? JSON.parse(raw) : []);
    })();
  }, []);

  const days = useMemo(() => lastNDays(7), []);

  const perDay = useMemo(() => {
    return days.map((day) => {
      const dayMeals = meals.filter((m) => dateKey(m.ts) === day);
      const calories = dayMeals.reduce((s, m) => s + m.calories, 0);
      const protein = dayMeals.reduce((s, m) => s + m.protein_g, 0);
      return { day, calories, protein };
    });
  }, [meals, days]);

  const weeklyTotals = useMemo(() => {
    const calories = perDay.reduce((s, d) => s + d.calories, 0);
    const protein = perDay.reduce((s, d) => s + d.protein, 0);
    return { calories, protein };
  }, [perDay]);

  return (
    <ThemedView
      style={[
        styles.container,
        { paddingTop: insets.top + 8 },
      ]}
    >
      <ThemedText type="title">Week</ThemedText>
      <ThemedText style={styles.subtle}>Last 7 days</ThemedText>

      <ThemedView style={styles.totalsRow}>
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Weekly Calories</ThemedText>
          <ThemedText style={styles.bigNumber}>
            {weeklyTotals.calories}
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Weekly Protein</ThemedText>
          <ThemedText style={styles.bigNumber}>
            {weeklyTotals.protein} g
          </ThemedText>
        </ThemedView>
      </ThemedView>

      <ThemedText
        type="subtitle"
        style={{ marginTop: 14, marginBottom: 8 }}
      >
        Daily breakdown
      </ThemedText>

      {perDay.map((d) => (
        <ThemedView key={d.day} style={styles.dayRow}>
          <ThemedText style={{ flex: 1 }}>{d.day}</ThemedText>
          <ThemedText style={styles.rightText}>
            {d.calories} kcal • {d.protein} g
          </ThemedText>
        </ThemedView>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  subtle: { opacity: 0.7, marginTop: 4 },
  totalsRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  card: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  bigNumber: { fontSize: 26, fontWeight: "700", marginTop: 6 },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  rightText: { width: 150, textAlign: "right", opacity: 0.9 },
});
