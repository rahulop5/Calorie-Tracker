import { z } from 'zod';

// Emails are trimmed, validated, then lowercased so one address cannot register
// twice under different casing.
const emailSchema = z
  .string()
  .trim()
  .pipe(z.email())
  .transform((value) => value.toLowerCase());

export const registerInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(80),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

/** What the API returns for a user. Never includes the password hash. */
export const publicUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const authResponseSchema = z.object({
  user: publicUserSchema,
  accessToken: z.string(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const accessTokenResponseSchema = z.object({
  accessToken: z.string(),
});
export type AccessTokenResponse = z.infer<typeof accessTokenResponseSchema>;
