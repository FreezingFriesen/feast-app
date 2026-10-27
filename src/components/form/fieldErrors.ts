import type { z } from "zod";

// Field path ("ingredients.0.quantity") -> message to show under that field.
export type FieldErrors = Record<string, string>;

export type IssueMessage = (issue: z.core.$ZodIssue) => string;

// Default wording for schema issues. Forms can pass their own for specific fields.
export function friendlyMessage(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      if (issue.expected === "int") return "Enter a whole number";
      if (issue.expected === "number") return "Enter a number";
      return "Required";
    case "too_small":
      if (issue.origin === "array") return `Add at least ${issue.minimum}`;
      if (issue.origin === "string") return "Required";
      return `Must be at least ${issue.minimum}`;
    case "too_big":
      if (issue.origin === "array") return `No more than ${issue.maximum} allowed`;
      if (issue.origin === "string") return `Must be ${issue.maximum} characters or fewer`;
      return `Must be ${issue.maximum} or less`;
    case "invalid_format":
      return "Contains characters that are not allowed";
    case "invalid_value":
      return "Choose an option";
    default:
      return issue.message;
  }
}

// Maps schema issues to field errors. First issue per field wins.
export function issuesToFieldErrors(error: z.ZodError, messageFor: IssueMessage = friendlyMessage): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (!(key in errors)) {
      errors[key] = messageFor(issue);
    }
  }
  return errors;
}
