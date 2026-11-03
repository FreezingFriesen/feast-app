import { FormField } from "@/components/form/FormField";
import { MAX_USERNAME_LENGTH } from "@/validation/authSchema";
import { StyleSheet, Text, View } from "react-native";
import { usernameCheckMessage } from "../accountMessages";
import { useUsernameAvailability } from "../useUsernameAvailability";

type UsernameFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  editable?: boolean;
};

// Username input with a live availability check underneath (N-13).
export function UsernameField({ value, onChangeText, error, editable }: UsernameFieldProps) {
  // The hint under the box, e.g. "Checking availability…", "✓ Available" or "That username is taken".
  const status = usernameCheckMessage(useUsernameAvailability(value));
  return (
    <View>
      <FormField
        label="Username"
        value={value}
        onChangeText={onChangeText}
        error={error}
        editable={editable}
        maxLength={MAX_USERNAME_LENGTH}
        autoCapitalize="none"
        autoCorrect={false}
        // Not "username": login is by email, so password managers should save the email.
        autoComplete="nickname"
        textContentType="nickname"
        returnKeyType="next"
      />
      {/* The hint is hidden while the form shows an error for this box, so only one
          message is under it at a time. */}
      {error ? null : (
        <Text style={[styles.status, toneStyles[status.tone]]} accessibilityLiveRegion="polite">
          {status.text}
        </Text>
      )}
    </View>
  );
}

// The negative margin pulls the hint up under the box, into the field's bottom spacing.
const styles = StyleSheet.create({
  status: {
    fontSize: 13,
    marginTop: -8,
    marginBottom: 12,
  },
});

const toneStyles = StyleSheet.create({
  muted: { color: "#666" },
  success: { color: "#2e7d32" },
  error: { color: "#c62828" },
});
