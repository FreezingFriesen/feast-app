import { AppHeader } from "@/components/AppHeader";
import { BrandImage } from "@/components/BrandImage";
import { FormMessage } from "@/components/form/FormMessage";
import { SubmitButton } from "@/components/form/SubmitButton";
import { ServingsStepper } from "@/components/ServingsStepper";
import { useAccountProfile } from "@/features/account/useAccountProfile";
import type { Recipe } from "@/repositories/RecipeRepository";
import { useIngredientCatalog, useIngredientCatalogStatus } from "@/repositories/RepositoryProvider";
import { borderWidth, colors, radius, spacing, tileSize, typography } from "@/theme";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { AccessibilityInfo, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { buildRecipeDetailView, stepServings } from "../detail/recipeDetailView";
import { assessRecipeAllergens } from "../filter/allergenAssessment";
import { toProfileFilterSource } from "../filter/recipeFilter";
import { formatServings } from "../formatServings";
import { RecipeMoreMenu } from "./RecipeMoreMenu";
import { RecipeRowNotes } from "./RecipeRowNotes";

// The placeholder where the mockup has the recipe photo takes this share of the screen
// height. Recipes have no photo field yet.
const HERO_SHARE = 0.4;
const HERO_MARK_HEIGHT = tileSize.lg + spacing.xl;

type RecipeDetailProps = {
  recipe: Recipe;
  onBack: () => void;
};

// One saved recipe, read-only (N-01 view), laid out like the recipe mockup: a header
// floating over the picture area, a white sheet with the title, the stat strip, the
// allergen and diet notes, the ingredients with a − / + serving scaler (#8), then the
// description, steps, diet tags and notes. "Start cooking" is pinned at the bottom.
//
// Differences from the mockup: a branded placeholder instead of a photo (no photo field),
// "Ingredients" instead of "Difficulty" (no difficulty field), no ingredient swap icons,
// and "Start cooking" scrolls to the steps (there's no cooking mode).
export function RecipeDetail({ recipe, onBack }: RecipeDetailProps) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const profile = toProfileFilterSource(useAccountProfile());
  const catalog = useIngredientCatalog();
  const catalogStatus = useIngredientCatalogStatus();

  // The servings shown, starting at the recipe's own. View only: never saved, and back to
  // the recipe's servings when it's edited or the screen closes.
  const [scaler, setScaler] = useState({ base: recipe.servings, value: recipe.servings });
  if (scaler.base !== recipe.servings) setScaler({ base: recipe.servings, value: recipe.servings });

  // Allergens from the ingredient catalog on the phone, worked out when read (never
  // stored), plus the ones the author marked. Nothing until the catalog has been read.
  const assessment = catalogStatus === "loading" ? null : assessRecipeAllergens(recipe, catalog, recipe.allergens);
  const view = buildRecipeDetailView({
    recipe,
    displayedServings: scaler.value,
    assessment,
    profile,
    catalogStatus,
  });

  // "Start cooking" scrolls to the steps and moves the screen reader there.
  const scrollRef = useRef<ScrollView>(null);
  const stepsHeadingRef = useRef<Text>(null);
  const [stepsY, setStepsY] = useState(0);

  function changeServings(delta: -1 | 1) {
    const next = stepServings(scaler.value, delta);
    if (next === scaler.value) return;
    setScaler({ base: recipe.servings, value: next });
    AccessibilityInfo.announceForAccessibility(formatServings(next));
  }

  function startCooking() {
    scrollRef.current?.scrollTo({ y: stepsY, animated: true });
    if (stepsHeadingRef.current) AccessibilityInfo.sendAccessibilityEvent(stepsHeadingRef.current, "focus");
  }

  return (
    <View style={styles.screen}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {/* Where the mockup has the photo: the Feast "F" on cream. Decorative. */}
        <View
          style={[styles.hero, { height: Math.round(height * HERO_SHARE) }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <BrandImage variant="mark" height={HERO_MARK_HEIGHT} />
        </View>

        <View style={styles.sheet}>
          <Text style={styles.title} accessibilityRole="header">
            {view.title}
          </Text>
          {view.subtitle ? <Text style={styles.subtitle}>{view.subtitle}</Text> : null}
        </View>

        <View style={styles.stats}>
          {view.stats.map((stat) => (
            <View key={stat.label} style={styles.stat} accessible accessibilityLabel={stat.spoken}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {view.notes.length > 0 || view.dataNotice ? (
          <View style={styles.section}>
            <RecipeRowNotes notes={view.notes} />
            {view.dataNotice ? <FormMessage tone="info" message={view.dataNotice} /> : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.ingredientsHeader}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Ingredients
            </Text>
            <ServingsStepper
              value={view.servings}
              onDecrease={() => changeServings(-1)}
              onIncrease={() => changeServings(1)}
              canDecrease={view.canDecrease}
              canIncrease={view.canIncrease}
              decreaseLabel="Decrease servings"
              increaseLabel="Increase servings"
              showValue={false}
            />
          </View>
          {view.ingredients.map((row) => (
            <View
              key={row.key}
              style={styles.ingredient}
              accessible
              accessibilityLabel={[row.name, row.spokenAmount, row.note].filter(Boolean).join(", ")}
            >
              <View style={styles.ingredientName}>
                <Text style={styles.body}>{row.name}</Text>
                {row.note ? <Text style={styles.caption}>{row.note}</Text> : null}
              </View>
              <Text style={styles.amount}>{row.amount}</Text>
            </View>
          ))}
        </View>

        {view.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Description
            </Text>
            <Text style={styles.body}>{view.description}</Text>
          </View>
        ) : null}

        <View style={styles.section} onLayout={(event) => setStepsY(event.nativeEvent.layout.y)}>
          <Text ref={stepsHeadingRef} style={styles.sectionTitle} accessibilityRole="header">
            Steps
          </Text>
          {view.steps.map((step, index) => (
            <View key={`${index}:${step}`} style={styles.step}>
              <Text style={styles.stepNumber}>{index + 1}.</Text>
              <Text style={[styles.body, styles.stepText]}>{step}</Text>
            </View>
          ))}
        </View>

        {view.dietTags.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Diet tags
            </Text>
            <View style={styles.tags}>
              {view.dietTags.map((tag) => (
                <Text key={tag} style={styles.tag}>
                  {tag}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        {view.recipeNotes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Notes
            </Text>
            <Text style={styles.body}>{view.recipeNotes}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Pinned under the list (above the tab bar), so it never covers the steps. */}
      <View style={styles.footer}>
        <SubmitButton label="Start cooking" onPress={startCooking} />
      </View>

      {/* The header floats over the top of the picture area, as in the mockup. */}
      <View style={styles.header}>
        <AppHeader
          title="Recipes"
          onBack={onBack}
          right={
            <RecipeMoreMenu
              onEdit={() => router.push({ pathname: "/recipes/edit/[id]", params: { id: recipe.id } })}
            />
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  hero: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.chrome,
  },
  // The white sheet with large rounded top corners, overlapping the bottom of the picture.
  sheet: {
    marginTop: -radius.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: "center",
  },
  title: {
    ...typography.heading,
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  // The cream band with three equal columns.
  stats: {
    flexDirection: "row",
    backgroundColor: colors.chrome,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xxs,
  },
  statValue: {
    ...typography.caption,
    fontStyle: "italic",
    color: colors.action,
    textAlign: "center",
  },
  statLabel: {
    ...typography.label,
    color: colors.text,
    textAlign: "center",
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    ...typography.groupHeading,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  ingredientsHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  // Thin decorative lines between the rows.
  ingredient: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: borderWidth.thin,
    borderBottomColor: colors.border,
  },
  ingredientName: {
    flex: 1,
  },
  body: {
    ...typography.body,
    color: colors.text,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  // Muted grey, which passes 4.5:1 on white (the mockup's light grey doesn't).
  amount: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "right",
    flexShrink: 1,
  },
  step: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  stepNumber: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  stepText: {
    flex: 1,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  // Read-only: a cream pill with ink text, unlike the green selectable chips.
  tag: {
    ...typography.label,
    color: colors.text,
    backgroundColor: colors.chrome,
    borderRadius: radius.pill,
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderTopWidth: borderWidth.thin,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
