import type { Profile } from "@/repositories/ProfileRepository";
import type { AuthUser } from "@/services/auth/AuthService";
import { StyleSheet, View } from "react-native";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { DietaryRestrictionsSection } from "./DietaryRestrictionsSection";
import { LogOutButton } from "./LogOutButton";
import { ProfileSection } from "./ProfileSection";
import { SecuritySection } from "./SecuritySection";
import { SyncSection } from "./SyncSection";

type SignedInAccountProps = {
  user: AuthUser;
  profile: Profile;
};

// The Account page for a signed-in user, built from one component per section.
export function SignedInAccount({ user, profile }: SignedInAccountProps) {
  return (
    <View style={styles.container}>
      <ProfileSection user={user} profile={profile} />
      <DietaryRestrictionsSection profile={profile} />
      <SyncSection />
      <SecuritySection />
      <LogOutButton />
      <View style={styles.spacer} />
      <DeleteAccountSection />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  // Keeps the destructive section apart from the everyday actions.
  spacer: {
    height: 32,
  },
});
