import { ThemedView } from "@/components/ThemedView";
import { auth } from "@/lib/firebase";
import { getDatabase, onValue, ref, remove, set } from "firebase/database";
import React, { useEffect, useState } from "react";
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

type CategoryBrand = {
  name: string;
  aliases?: string[];
};

type CategoryNode = {
  [categoryKey: string]: {
    label?: string;
    brands?: {
      [brandKey: string]: CategoryBrand;
    };
  };
};

// Slug-ish key generator (for category & brand keys)
const toKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export default function CategoriesScreen() {
  const [categories, setCategories] = useState<CategoryNode>({});
  const [loading, setLoading] = useState(true);

  // Add/Edit category modal
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categoryLabelInput, setCategoryLabelInput] = useState("");
  const [editingCategoryKey, setEditingCategoryKey] = useState<string | null>(
    null
  );

  // Add/Edit brand modal
  const [brandModalVisible, setBrandModalVisible] = useState(false);
  const [brandNameInput, setBrandNameInput] = useState("");
  const [brandAliasesInput, setBrandAliasesInput] = useState("");
  const [activeCategoryKey, setActiveCategoryKey] = useState<string | null>(
    null
  );
  const [editingBrandKey, setEditingBrandKey] = useState<string | null>(null);

  // Subscribe to /categories
  useEffect(() => {
    const db = getDatabase(auth.app);
    const categoriesRef = ref(db, "categories");

    const unsub = onValue(categoriesRef, (snap) => {
      const val = snap.val() || {};
      setCategories(val);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  /** ---------- Category CRUD ---------- */

  const openCreateCategory = () => {
    setEditingCategoryKey(null);
    setCategoryLabelInput("");
    setCategoryModalVisible(true);
  };

  const openEditCategory = (categoryKey: string) => {
    const category = categories[categoryKey];
    setEditingCategoryKey(categoryKey);
    setCategoryLabelInput(category?.label || categoryKey);
    setCategoryModalVisible(true);
  };

  const saveCategory = async () => {
    const label = categoryLabelInput.trim();
    if (!label) {
      Alert.alert("Missing name", "Please enter a category label.");
      return;
    }

    try {
      const db = getDatabase(auth.app);

      // If editing existing category, just update its label (keep key)
      if (editingCategoryKey) {
        const catRef = ref(db, `categories/${editingCategoryKey}`);
        const existing = categories[editingCategoryKey] || {};
        await set(catRef, {
          ...existing,
          label,
        });
      } else {
        // Creating new category
        const newKey = toKey(label);
        const catRef = ref(db, `categories/${newKey}`);
        const existingBrands = categories[newKey]?.brands ?? {};
        await set(catRef, {
          label,
          brands: existingBrands,
        });
      }

      setCategoryModalVisible(false);
      setEditingCategoryKey(null);
      setCategoryLabelInput("");
    } catch (err: any) {
      Alert.alert(
        "Error",
        err?.message || "Failed to save category. Please try again."
      );
    }
  };

  const deleteCategory = (categoryKey: string) => {
    Alert.alert(
      "Delete category",
      `This will remove "${categories[categoryKey]?.label || categoryKey}" and all its brands. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const db = getDatabase(auth.app);
              const catRef = ref(db, `categories/${categoryKey}`);
              await remove(catRef);
            } catch (err: any) {
              Alert.alert(
                "Error",
                err?.message || "Failed to delete category."
              );
            }
          },
        },
      ]
    );
  };

  /** ---------- Brand CRUD ---------- */

  const openCreateBrand = (categoryKey: string) => {
    setActiveCategoryKey(categoryKey);
    setEditingBrandKey(null);
    setBrandNameInput("");
    setBrandAliasesInput("");
    setBrandModalVisible(true);
  };

  const openEditBrand = (categoryKey: string, brandKey: string) => {
    const brand = categories[categoryKey]?.brands?.[brandKey];
    setActiveCategoryKey(categoryKey);
    setEditingBrandKey(brandKey);
    setBrandNameInput(brand?.name || "");
    setBrandAliasesInput((brand?.aliases || []).join(", "));
    setBrandModalVisible(true);
  };

  const saveBrand = async () => {
    const name = brandNameInput.trim();
    if (!name || !activeCategoryKey) {
      Alert.alert(
        "Missing data",
        "Please enter a brand name and select a category."
      );
      return;
    }

    const aliases = brandAliasesInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const db = getDatabase(auth.app);

      if (editingBrandKey) {
        // Update existing brand (keep key, just change name + aliases)
        const brandRef = ref(
          db,
          `categories/${activeCategoryKey}/brands/${editingBrandKey}`
        );
        await set(brandRef, {
          name,
          aliases,
        });
      } else {
        // Create new brand under the category
        const newBrandKey = toKey(name) || `brand_${Date.now()}`;
        const brandRef = ref(
          db,
          `categories/${activeCategoryKey}/brands/${newBrandKey}`
        );
        await set(brandRef, {
          name,
          aliases,
        });
      }

      setBrandModalVisible(false);
      setActiveCategoryKey(null);
      setEditingBrandKey(null);
      setBrandNameInput("");
      setBrandAliasesInput("");
    } catch (err: any) {
      Alert.alert(
        "Error",
        err?.message || "Failed to save brand. Please try again."
      );
    }
  };

  const deleteBrand = (categoryKey: string, brandKey: string) => {
    const brand = categories[categoryKey]?.brands?.[brandKey];
    Alert.alert(
      "Delete brand",
      `Remove "${brand?.name || brandKey}" from ${categories[categoryKey]?.label || categoryKey}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const db = getDatabase(auth.app);
              const brandRef = ref(
                db,
                `categories/${categoryKey}/brands/${brandKey}`
              );
              await remove(brandRef);
            } catch (err: any) {
              Alert.alert(
                "Error",
                err?.message || "Failed to delete brand."
              );
            }
          },
        },
      ]
    );
  };

  const categoryKeys = Object.keys(categories).sort();

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Categories &amp; Brands</Text>
        <Text style={styles.subtitle}>
          Manage category labels, brands, and aliases used for OCR mapping.
        </Text>

        <Pressable style={styles.addCategoryBtn} onPress={openCreateCategory}>
          <Text style={styles.addCategoryText}>＋ Add category</Text>
        </Pressable>
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Loading categories...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {categoryKeys.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No categories found</Text>
              <Text style={styles.emptyText}>
                Tap &quot;+ Add category&quot; to create your first one.
              </Text>
            </View>
          ) : (
            categoryKeys.map((catKey) => {
              const cat = categories[catKey];
              const brands = cat.brands || {};
              const brandKeys = Object.keys(brands).sort();

              return (
                <View key={catKey} style={styles.categoryCard}>
                  <View style={styles.categoryHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.categoryLabel}>
                        {cat.label || catKey}
                      </Text>
                      <Text style={styles.categoryKeyText}>{catKey}</Text>
                      <Text style={styles.categoryCount}>
                        {brandKeys.length} brand
                        {brandKeys.length === 1 ? "" : "s"}
                      </Text>
                    </View>

                    <View style={styles.categoryActions}>
                      <Pressable
                        style={styles.chipButton}
                        onPress={() => openEditCategory(catKey)}
                      >
                        <Text style={styles.chipButtonText}>✏️ Edit</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.chipButton, styles.chipButtonDanger]}
                        onPress={() => deleteCategory(catKey)}
                      >
                        <Text
                          style={[
                            styles.chipButtonText,
                            { color: "#B91C1C" },
                          ]}
                        >
                          🗑 Delete
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.brandHeaderRow}>
                    <Text style={styles.brandHeaderText}>Brands</Text>
                    <Pressable
                      style={styles.smallAddBtn}
                      onPress={() => openCreateBrand(catKey)}
                    >
                      <Text style={styles.smallAddText}>＋ Add brand</Text>
                    </Pressable>
                  </View>

                  {brandKeys.length === 0 ? (
                    <Text style={styles.noBrandsText}>
                      No brands yet. Add one to start mapping merchants.
                    </Text>
                  ) : (
                    brandKeys.map((bKey) => {
                      const brand = brands[bKey];
                      return (
                        <View key={bKey} style={styles.brandRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.brandName}>{brand.name}</Text>
                            <Text style={styles.brandKeyText}>{bKey}</Text>
                            <Text style={styles.brandAliases}>
                              Aliases:{" "}
                              {brand.aliases && brand.aliases.length
                                ? brand.aliases.join(", ")
                                : "—"}
                            </Text>
                          </View>

                          <View style={styles.brandActions}>
                            <Pressable
                              style={styles.brandActionBtn}
                              onPress={() => openEditBrand(catKey, bKey)}
                            >
                              <Text style={styles.brandActionText}>Edit</Text>
                            </Pressable>
                            <Pressable
                              style={[styles.brandActionBtn, styles.brandDelete]}
                              onPress={() => deleteBrand(catKey, bKey)}
                            >
                              <Text
                                style={[
                                  styles.brandActionText,
                                  { color: "#B91C1C" },
                                ]}
                              >
                                Delete
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Category Modal */}
      <Modal
        transparent
        visible={categoryModalVisible}
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingCategoryKey ? "Edit category" : "Add category"}
            </Text>

            <Text style={styles.modalLabel}>Category label</Text>
            <TextInput
              value={categoryLabelInput}
              onChangeText={setCategoryLabelInput}
              placeholder="e.g., Food, Groceries, Transport & Fuel"
              style={styles.modalInput}
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={saveCategory}
              >
                <Text style={styles.modalBtnPrimaryText}>
                  {editingCategoryKey ? "Save changes" : "Create"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => {
                  setCategoryModalVisible(false);
                  setEditingCategoryKey(null);
                  setCategoryLabelInput("");
                }}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Brand Modal */}
      <Modal
        transparent
        visible={brandModalVisible}
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingBrandKey ? "Edit brand" : "Add brand"}
            </Text>

            <Text style={styles.modalLabel}>Brand name</Text>
            <TextInput
              value={brandNameInput}
              onChangeText={setBrandNameInput}
              placeholder="e.g., Jollibee, McDonald's"
              style={styles.modalInput}
              placeholderTextColor="#9CA3AF"
            />

            <Text style={[styles.modalLabel, { marginTop: 10 }]}>
              Aliases (comma separated)
            </Text>
            <TextInput
              value={brandAliasesInput}
              onChangeText={setBrandAliasesInput}
              placeholder="e.g., JOLLIBEE, JOLI, JBE"
              style={styles.modalInput}
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={saveBrand}
              >
                <Text style={styles.modalBtnPrimaryText}>
                  {editingBrandKey ? "Save changes" : "Create"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => {
                  setBrandModalVisible(false);
                  setActiveCategoryKey(null);
                  setEditingBrandKey(null);
                  setBrandNameInput("");
                  setBrandAliasesInput("");
                }}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 32,
    backgroundColor: "#F3F4F6",
  },

  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
  },
  addCategoryBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#4F46E5",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  addCategoryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "#4B5563",
  },

  emptyState: {
    marginTop: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  emptyText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    textAlign: "center",
  },

  categoryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  categoryLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  categoryKeyText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
  },
  categoryCount: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  categoryActions: {
    flexDirection: "row",
    gap: 6,
    marginLeft: 8,
  },
  chipButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  chipButtonDanger: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  chipButtonText: {
    fontSize: 11,
    color: "#111827",
    fontWeight: "600",
  },

  brandHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
    marginBottom: 4,
  },
  brandHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4B5563",
  },
  smallAddBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
  },
  smallAddText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4F46E5",
  },

  noBrandsText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 4,
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  brandName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  brandKeyText: {
    fontSize: 10,
    color: "#9CA3AF",
    marginTop: 2,
  },
  brandAliases: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  brandActions: {
    marginLeft: 8,
    alignItems: "flex-end",
    gap: 4,
  },
  brandActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  brandDelete: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  brandActionText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#111827",
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 12,
    color: "#4B5563",
    marginBottom: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "#FFFFFF",
    fontSize: 13,
    color: "#111827",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 14,
  },
  modalBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  modalBtnPrimary: {
    backgroundColor: "#4F46E5",
  },
  modalBtnPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  modalBtnGhost: {
    backgroundColor: "#E5E7EB",
  },
  modalBtnGhostText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 13,
  },
});
