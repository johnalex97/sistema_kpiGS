import { z } from "zod";
import { validatePassword } from "./password.js";

function passwordSchema() {
  return z.string().superRefine((password, context) => {
    const result = validatePassword(password);
    if (!result.valid) {
      context.addIssue({
        code: "custom",
        message: result.code,
      });
    }
  });
}

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema(),
  })
  .refine(
    ({ currentPassword, newPassword }) => currentPassword !== newPassword,
    {
      path: ["newPassword"],
      message: "PASSWORD_MUST_BE_DIFFERENT",
    },
  );
