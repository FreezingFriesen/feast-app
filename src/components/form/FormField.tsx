import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

type FormFieldProps = TextInputProps & {
  label?: string;
  error?: string;
};

export function FormField({ label, error, style, multiline, ...inputProps }: FormFieldProps) {
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
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
