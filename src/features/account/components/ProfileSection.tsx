import { FormMessage } from "@/components/form/FormMessage";
import type { Profile } from "@/repositories/ProfileRepository";
import type { AuthUser } from "@/services/auth/AuthService";
import { colors, spacing, typography } from "@/theme";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { accountErrorMessage, formatLongDate } from "../accountMessages";
import { useAccountFlows } from "../useAccountFlows";
import { AccountSection } from "./AccountSection";
import { TextAction } from "@/components/TextAction";

type ProfileSectionProps = {
  user: AuthUser;
  profile: Profile;
};

// Who is signed in. Shown from the copy on this phone, so it works offline.
export function ProfileSection({ user, profile }: ProfileSectionProps) {
  const { security } = useAccountFlows();
  // True while the verification email is being sent.
  const [sending, setSending] = useState(false);
  // The result of the last "Resend" press, shown under the section.
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  // Sends the "verify your email" email again.
  async function resendVerification() {
    setSending(true);
    setMessage(null);
    try {
      const result = await security.resendVerificationEmail();
      setMessage(
        result.ok
          ? { tone: "success", text: "Verification email sent. Check your inbox." }
          : { tone: "error", text: accountErrorMessage(result.error, "verify_email") },
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <AccountSection title="Profile">
      <Text style={styles.username}>{profile.username}</Text>
      <Text style={styles.detail}>{user.email}</Text>
      <Text style={styles.detail}>Member since {formatLongDate(profile.createdAt)}</Text>
      {/* Decision 3: shown and can be resent, but doesn't block using the app.
          (The decisions are listed in src/services/account/accountDecisions.ts.) */}
      <Text style={styles.detail}>{user.emailVerified ? "Email verified ✓" : "Email not verified yet"}</Text>
      {user.emailVerified ? null : (
        <TextAction
          label={sending ? "Sending…" : "Resend verification email"}
          disabled={sending}
          onPress={() => void resendVerification()}
        />
      )}
      {message ? <FormMessage tone={message.tone} message={message.text} /> : null}
    </AccountSection>
  );
}

const styles = StyleSheet.create({
  username: {
    ...typography.heading,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  detail: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
});
