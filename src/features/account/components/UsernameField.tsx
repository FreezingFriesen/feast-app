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
      {error ? null : (
        <Text style={[styles.status, toneStyles[status.tone]]} accessibilityLiveRegion="polite">
          {status.text}
        </Text>
      )}
    </View>
  );
}

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
