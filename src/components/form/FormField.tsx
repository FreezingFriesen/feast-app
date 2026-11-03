import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

// Everything a normal TextInput accepts, plus a label above it and an error below it.
type FormFieldProps = TextInputProps & {
  label?: string;
  error?: string;
};

// A labelled text box used by every form. The box turns red and the message shows
// underneath when there is an error.
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
        placeholderTextColor="#999"
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
    marginBottom: 12,
    flexGrow: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  // Taller boxes for longer text, with the text starting at the top (Android
  // centres it otherwise).
  multiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  inputError: {
    borderColor: "#c62828",
  },
  error: {
    color: "#c62828",
    fontSize: 13,
    marginTop: 4,
  },
});
