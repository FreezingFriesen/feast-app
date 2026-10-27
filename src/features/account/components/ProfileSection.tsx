import { FormMessage } from "@/components/form/FormMessage";
import type { Profile } from "@/repositories/ProfileRepository";
import type { AuthUser } from "@/services/auth/AuthService";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { accountErrorMessage, formatLongDate } from "../accountMessages";
import { useAccountFlows } from "../useAccountFlows";
import { AccountSection } from "./AccountSection";
import { TextAction } from "./TextAction";

type ProfileSectionProps = {
  user: AuthUser;
  profile: Profile;
};

// Who is signed in. Shown from the copy on this phone, so it works offline.
export function ProfileSection({ user, profile }: ProfileSectionProps) {
  const { security } = useAccountFlows();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

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
      {/* Decision 3: shown and can be resent, but doesn't block using the app. */}
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
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 4,
  },
  detail: {
    fontSize: 16,
    color: "#444",
    marginBottom: 4,
  },
});
