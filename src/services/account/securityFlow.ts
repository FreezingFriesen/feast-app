import { AUTH_ERROR_CODES, type AuthErrorCode, type AuthResult, type AuthService } from "@/services/auth/AuthService";
import { errorCodeIn } from "@/services/domainErrors";
import { changePasswordFormSchema } from "@/validation/authSchema";

export type ChangePasswordResult =
  | { ok: true }
  // field: which input the error belongs to (a wrong current password), if any.
  | { ok: false; error: AuthErrorCode; field?: "currentPassword" };

export type VerifyPasswordResult = { ok: true } | { ok: false; error: AuthErrorCode; field?: "password" };

export type SecurityFlow = {
  // Re-authenticates with the current password (reauthSchema), e.g. the first step of
  // deleting the account. Needs a connection.
  verifyPassword(input: unknown): Promise<VerifyPasswordResult>;
  // Re-authenticates with the current password, then sets the new one (changePasswordFormSchema).
  // Needs a connection.
  changePassword(input: unknown): Promise<ChangePasswordResult>;
  // Decision 3: verification is shown and can be resent, but doesn't block using the app.
  resendVerificationEmail(): Promise<AuthResult>;
};

const fail = (error: unknown) => ({ ok: false, error: errorCodeIn(error, AUTH_ERROR_CODES) }) as const;

export function createSecurityFlow({ auth }: { auth: AuthService }): SecurityFlow {
  return {
    async verifyPassword(input) {
      try {
        const result = await auth.reauthenticate(input);
        if (result.ok) return result;
        return result.error === "invalid_credentials"
          ? { ok: false, error: result.error, field: "password" }
          : { ok: false, error: result.error };
      } catch (error) {
        return fail(error);
      }
    },

    async changePassword(input) {
      try {
        const parsed = changePasswordFormSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: "invalid_input" };
        const { currentPassword, newPassword } = parsed.data;

        // A sensitive change always proves who the user is first, however recent the login.
        const reauth = await auth.reauthenticate({ password: currentPassword });
        if (!reauth.ok) {
          return reauth.error === "invalid_credentials"
            ? { ok: false, error: reauth.error, field: "currentPassword" }
            : { ok: false, error: reauth.error };
        }
        return await auth.changePassword({ newPassword });
      } catch (error) {
        return fail(error);
      }
    },

    async resendVerificationEmail() {
      try {
        return await auth.sendVerificationEmail();
      } catch (error) {
        return fail(error);
      }
    },
  };
}
