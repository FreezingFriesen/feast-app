import { borderWidth, colors, CONTROL_HEIGHT, radius, spacing, typography } from "@/theme";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

// Everything a normal TextInput accepts, plus a label above it and an error below it.
type FormFieldProps = TextInputProps & {
  label?: string;
  error?: string;
};

// A labelled text box used by every form. The box gets a thicker red edge and the
// message shows underneath when there is an error.
export function FormField({ label, error, style, multiline, ...inputProps }: FormFieldProps) {
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {/* Passes every other setting (value, onChangeText, keyboardType, ...) straight
          through. Screen readers use the label unless the screen gives its own. */}
      <TextInput
        {...inputProps}
        multiline={multiline}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        style={[styles.input, multiline && styles.multiline, error ? styles.inputError : null, style]}
        placeholderTextColor={colors.textMuted}
      />
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

// A red error message. Also used on its own under things that aren't text boxes,
// like a row of chips.
export function FieldError({ message }: { message: string }) {
  return <Text style={styles.error}>{message}</Text>;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
    flexGrow: 1,
  },
  label: {
    ...typography.label,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    color: colors.text,
    minHeight: CONTROL_HEIGHT,
    borderWidth: borderWidth.thin,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  // Taller boxes for longer text, with the text starting at the top (Android
  // centres it otherwise).
  multiline: {
    minHeight: CONTROL_HEIGHT * 2,
    textAlignVertical: "top",
  },
  inputError: {
    borderColor: colors.error,
    borderWidth: borderWidth.thick,
  },
  error: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
});
