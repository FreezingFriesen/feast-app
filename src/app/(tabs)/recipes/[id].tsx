// One saved recipe, read-only (N-01 view), with an on-screen serving scaler (#8).
// Opened by tapping a recipe in the Recipes list.
import { AppHeader } from "@/components/AppHeader";
import { EmptyState } from "@/components/EmptyState";
import { SubmitButton } from "@/components/form/SubmitButton";
import { RecipeDetail } from "@/features/recipes/components/RecipeDetail";
import { useRecipe } from "@/features/recipes/useRecipe";
import { colors, spacing } from "@/theme";
import { recipeIdSchema } from "@/validation/recipeSchema";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

// This screen is split into two parts:
// 1. RecipeDetailScreen checks the recipe's ID from the link that opened the screen.
// 2. RecipeLoader reads the recipe (and again after every change) and shows it.
export default function RecipeDetailScreen() {
  const router = useRouter();
  // Back to the list. After a deep link the list sits underneath (the stack's anchor),
  // so there's always somewhere to go back to; replace() covers anything else.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/recipes"));
  // Route params are user-controllable (deep links), so validate before use. An invalid
  // ID never reaches the repository.
  const { id } = useLocalSearchParams();
  const parsed = recipeIdSchema.safeParse(id);
  if (!parsed.success) return <NotFound onBack={goBack} />;
  return <RecipeLoader id={parsed.data} onBack={goBack} />;
}

function RecipeLoader({ id, onBack }: { id: string; onBack: () => void }) {
  const state = useRecipe(id);
  switch (state.status) {
    case "loading":
      return (
        <WithHeader onBack={onBack}>
          <View style={styles.center}>
            <ActivityIndicator color={colors.action} accessibilityLabel="Loading the recipe" />
          </View>
        </WithHeader>
      );
    case "missing":
      return <NotFound onBack={onBack} />;
    case "failed":
      return (
        <WithHeader onBack={onBack}>
          <EmptyState
            icon="alert-circle-outline"
            title="Couldn't open this recipe"
            description="Please go back and try again."
          >
            <BackButton onBack={onBack} />
          </EmptyState>
        </WithHeader>
      );
    case "ready":
      return <RecipeDetail recipe={state.recipe} onBack={onBack} />;
  }
}

// Missing, deleted, or a link with an invalid ID.
function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <WithHeader onBack={onBack}>
      <EmptyState icon="book-outline" title="Recipe not found" description="This recipe is no longer available.">
        <BackButton onBack={onBack} />
      </EmptyState>
    </WithHeader>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.action}>
      <SubmitButton label="Back to recipes" variant="secondary" onPress={onBack} />
    </View>
  );
}

// The stack's header is hidden on this route (the recipe draws its own over the picture
// area), so the other states draw the usual one.
function WithHeader({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <View style={styles.screen}>
      <AppHeader title="Recipes" onBack={onBack} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  action: {
    alignSelf: "stretch",
    paddingHorizontal: spacing.lg,
  },
});
