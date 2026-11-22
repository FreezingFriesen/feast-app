import { FormMessage } from "@/components/form/FormMessage";
import { TextAction } from "@/components/TextAction";
import type { RecipeListState } from "@/features/recipes/filter/recipeListState";
import { colors, spacing, typography } from "@/theme";
import { StyleSheet, Text, View } from "react-native";
import { ProfileFilterRow, type ProfileFilterLinks } from "./ProfileFilterRow";

export type ReadyRecipeListState = Extract<RecipeListState, { kind: "ready" }>;

type ProfileFilterBannersProps = {
  state: ReadyRecipeListState;
  onProfileFilterChange: (on: boolean) => void;
  onRetryProfile: (() => void) | null;
  // See ProfileFilterRow: left out inside a modal.
  links?: ProfileFilterLinks;
};

// Everything about the user's own allergy & diet filter (N-04), in this order: the user's
// restrictions and the switch, the "filter is off" indicator, a profile that couldn't load,
// how many recipes the filter hides, and the allergen data notice. Shared by the Recipes
// tab and the meal planner's recipe picker. The messages are polite live regions, so screen
// readers hear them change.
export function ProfileFilterBanners({ state, onProfileFilterChange, onRetryProfile, links }: ProfileFilterBannersProps) {
  return (
    <View>
      <ProfileFilterRow row={state.profileRow} onChange={onProfileFilterChange} links={links} />

      {state.offIndicator ? (
        <View>
          <FormMessage tone="info" message={state.offIndicator} />
          <TextAction
            label="Turn on"
            align="start"
            onPress={() => onProfileFilterChange(true)}
            accessibilityLabel="Turn on my allergy and diet filter"
          />
        </View>
      ) : null}

      {state.profileError ? (
        <View>
          <FormMessage tone="error" message={state.profileError} />
          {onRetryProfile ? <TextAction label="Retry" align="start" onPress={onRetryProfile} /> : null}
        </View>
      ) : null}

      {state.hiddenMessage ? (
        <View style={styles.hidden}>
          <Text style={styles.hiddenText} accessibilityLiveRegion="polite">
            {state.hiddenMessage}
          </Text>
          <TextAction
            label="Show them"
            align="start"
            onPress={() => onProfileFilterChange(false)}
            accessibilityLabel="Show them: turns off my allergy and diet filter"
          />
        </View>
      ) : null}

      {state.dataNotice ? <FormMessage tone="info" message={state.dataNotice} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.md,
  },
  hiddenText: {
    ...typography.body,
    color: colors.text,
  },
});
