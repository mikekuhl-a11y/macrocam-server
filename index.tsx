import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

type Meal = {
  id: string;
  ts: number; // timestamp ms
  description: string;
  calories: number;
  protein_g: number;
  photoUri?: string;
};

const STORAGE_KEY = "@macrocam_meals_v1";
const NUMBERPAD_ACCESSORY_ID = "numberPadAccessory";

// 🌍 Production backend (Render)
const SERVER_BASE_URL = "https://macrocam-server.onrender.com";

function dateKey(ts: number) {
  return new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  const [meals, setMeals] = useState<Meal[]>([]);
  const [showModal, setShowModal] = useState(false);

  const [desc, setDesc] = useState("");
  const [calText, setCalText] = useState("");
  const [protText, setProtText] = useState("");
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);

  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      setMeals(raw ? JSON.parse(raw) : []);
    })();
  }, []);

  async function persist(next: Meal[]) {
    setMeals(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const today = dateKey(Date.now());

  const todaysMeals = useMemo(
    () => meals.filter((m) => dateKey(m.ts) === today),
    [meals, today]
  );

  const totals = useMemo(() => {
    const calories = todaysMeals.reduce((s, m) => s + m.calories, 0);
    const protein = todaysMeals.reduce((s, m) => s + m.protein_g, 0);
    return { calories, protein };
  }, [todaysMeals]);

  function openModal() {
    setDesc("");
    setCalText("");
    setProtText("");
    setPhotoUri(undefined);
    setEstimateError(null);
    setEstimating(false);
    setShowModal(true);
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera permission needed",
        "Please allow camera access to take food photos."
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (result.canceled) return;

    const uri = result.assets?.[0]?.uri;
    if (!uri) return;

    setPhotoUri(uri);
  }

  // ✅ REAL estimate call to your local server
  async function estimateFromPhoto() {
    if (!photoUri) return;

    try {
      setEstimateError(null);
      setEstimating(true);

      const form = new FormData();
      form.append("photo", {
        uri: photoUri,
        name: "photo.jpg",
        type: "image/jpeg",
      } as any);

      const resp = await fetch(`${SERVER_BASE_URL}/estimate`, {
        method: "POST",
        body: form,
        headers: {
          // NOTE: do NOT set Content-Type manually for FormData in RN
          Accept: "application/json",
        },
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Server error ${resp.status}: ${text}`);
      }

      const data = (await resp.json()) as {
        description: string;
        calories: number;
        protein_g: number;
      };

      setDesc(data.description || "Food");
      setCalText(String(Math.round(Number(data.calories) || 0)));
      setProtText(String(Math.round(Number(data.protein_g) || 0)));
    } catch (e: any) {
      setEstimateError(e?.message || "Couldn’t estimate from photo. Try again.");
    } finally {
      setEstimating(false);
    }
  }

  async function saveMeal() {
    const calories = parseInt(calText || "0", 10);
    const protein_g = parseInt(protText || "0", 10);

    if (Number.isNaN(calories) || Number.isNaN(protein_g)) {
      Alert.alert("Invalid input", "Calories and protein must be numbers.");
      return;
    }

    const meal: Meal = {
      id: (Date.now() + Math.random()).toString(36),
      ts: Date.now(),
      description: desc.trim() || "Meal",
      calories,
      protein_g,
      photoUri,
    };

    await persist([meal, ...meals]);
    setShowModal(false);
  }

  async function deleteMeal(id: string) {
    const next = meals.filter((m) => m.id !== id);
    await persist(next);
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <ThemedText type="title">Today</ThemedText>
      <ThemedText style={styles.subtle}>{today}</ThemedText>

      <ThemedView style={styles.totalsRow}>
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Calories</ThemedText>
          <ThemedText style={styles.bigNumber}>{totals.calories}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Protein</ThemedText>
          <ThemedText style={styles.bigNumber}>{totals.protein} g</ThemedText>
        </ThemedView>
      </ThemedView>

      <TouchableOpacity style={styles.primaryBtn} onPress={openModal}>
        <ThemedText style={styles.primaryBtnText}>Log meal</ThemedText>
      </TouchableOpacity>

      <ThemedText type="subtitle" style={{ marginTop: 14, marginBottom: 8 }}>
        Meals
      </ThemedText>

      {todaysMeals.length === 0 ? (
        <ThemedText style={styles.subtle}>No meals yet.</ThemedText>
      ) : (
        todaysMeals.map((m) => (
          <ThemedView key={m.id} style={styles.mealRow}>
            {m.photoUri ? (
              <Image source={{ uri: m.photoUri }} style={styles.thumb} />
            ) : null}

            <ThemedView style={{ flex: 1 }}>
              <ThemedText style={styles.mealDesc}>{m.description}</ThemedText>
              <ThemedText style={styles.subtle}>
                {new Date(m.ts).toLocaleTimeString()} • {m.calories} kcal •{" "}
                {m.protein_g} g
              </ThemedText>
            </ThemedView>

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() =>
                Alert.alert("Delete meal?", "This cannot be undone.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => deleteMeal(m.id),
                  },
                ])
              }
            >
              <ThemedText style={{ color: "white" }}>Del</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        ))
      )}

      <Modal visible={showModal} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={Keyboard.dismiss}>
          <Pressable onPress={() => {}} style={{ width: "100%" }}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <ThemedView style={styles.modalCard}>
                <ThemedText type="title" style={{ marginBottom: 10 }}>
                  Log meal
                </ThemedText>

                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{
                    paddingBottom: insets.bottom + 18,
                  }}
                >
                  <ThemedView style={styles.photoRow}>
                    {photoUri ? (
                      <Image
                        source={{ uri: photoUri }}
                        style={styles.photoPreview}
                      />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <ThemedText style={{ opacity: 0.7 }}>No photo</ThemedText>
                      </View>
                    )}

                    <ThemedView style={{ flex: 1 }}>
                      <TouchableOpacity
                        style={styles.secondaryBtn}
                        onPress={takePhoto}
                        disabled={estimating}
                      >
                        <ThemedText>Take photo</ThemedText>
                      </TouchableOpacity>

                      {photoUri ? (
                        <TouchableOpacity
                          style={[styles.secondaryBtn, { marginTop: 10 }]}
                          onPress={() => setPhotoUri(undefined)}
                          disabled={estimating}
                        >
                          <ThemedText>Remove photo</ThemedText>
                        </TouchableOpacity>
                      ) : null}
                    </ThemedView>
                  </ThemedView>

                  {photoUri ? (
                    <TouchableOpacity
                      style={[styles.primaryBtn, { marginTop: 10 }]}
                      onPress={estimateFromPhoto}
                      disabled={estimating}
                    >
                      <ThemedText style={styles.primaryBtnText}>
                        {estimating ? "Estimating..." : "Estimate from photo"}
                      </ThemedText>
                    </TouchableOpacity>
                  ) : null}

                  {estimateError ? (
                    <ThemedText style={{ marginTop: 8, opacity: 0.8 }}>
                      {estimateError}
                    </ThemedText>
                  ) : null}

                  <ThemedText style={styles.label}>Description</ThemedText>
                  <TextInput
                    value={desc}
                    onChangeText={setDesc}
                    placeholder="e.g., meatloaf & potatoes"
                    placeholderTextColor="#999"
                    style={styles.input}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  <ThemedText style={styles.label}>Calories (kcal)</ThemedText>
                  <TextInput
                    value={calText}
                    onChangeText={setCalText}
                    keyboardType="number-pad"
                    placeholder="e.g., 650"
                    placeholderTextColor="#999"
                    style={styles.input}
                    inputAccessoryViewID={
                      Platform.OS === "ios" ? NUMBERPAD_ACCESSORY_ID : undefined
                    }
                  />

                  <ThemedText style={styles.label}>Protein (g)</ThemedText>
                  <TextInput
                    value={protText}
                    onChangeText={setProtText}
                    keyboardType="number-pad"
                    placeholder="e.g., 40"
                    placeholderTextColor="#999"
                    style={styles.input}
                    inputAccessoryViewID={
                      Platform.OS === "ios" ? NUMBERPAD_ACCESSORY_ID : undefined
                    }
                  />

                  <ThemedView style={styles.modalButtons}>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => setShowModal(false)}
                      disabled={estimating}
                    >
                      <ThemedText>Cancel</ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryBtn, styles.modalPrimaryBtn]}
                      onPress={saveMeal}
                      disabled={estimating}
                    >
                      <ThemedText style={styles.primaryBtnText}>Save</ThemedText>
                    </TouchableOpacity>
                  </ThemedView>
                </ScrollView>
              </ThemedView>

              {Platform.OS === "ios" ? (
                <InputAccessoryView nativeID={NUMBERPAD_ACCESSORY_ID}>
                  <View style={styles.accessoryBar}>
                    <TouchableOpacity onPress={Keyboard.dismiss}>
                      <ThemedText style={styles.accessoryDone}>Done</ThemedText>
                    </TouchableOpacity>
                  </View>
                </InputAccessoryView>
              ) : null}
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>
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

  primaryBtn: {
    marginTop: 14,
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryBtnText: { color: "white", fontWeight: "700" },

  modalPrimaryBtn: {
    flex: 1,
    marginTop: 0,
  },

  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
    alignItems: "center",
    flex: 1,
  },

  mealRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
    gap: 10,
  },
  mealDesc: { fontSize: 16, fontWeight: "600" },
  deleteBtn: {
    backgroundColor: "#E03E3E",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#eee",
  },

  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    maxHeight: "85%",
  },

  photoRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  photoPreview: {
    width: 84,
    height: 84,
    borderRadius: 12,
    backgroundColor: "#eee",
  },
  photoPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 12,
    backgroundColor: "#eee",
    alignItems: "center",
    justifyContent: "center",
  },

  label: { marginTop: 8, marginBottom: 6, opacity: 0.8 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "white",
  },

  modalButtons: { flexDirection: "row", gap: 10, marginTop: 14 },

  accessoryBar: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "flex-end",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
    backgroundColor: "#f7f7f7",
  },
  accessoryDone: { fontWeight: "700" },
});
