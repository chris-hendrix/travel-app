import { z } from "zod";

// Query params for listing users
export const adminListUsersQuerySchema = z.object({
  search: z.string().max(100).optional(),
  status: z.enum(["active", "banned"]).optional(),
  role: z.enum(["user", "admin"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;

// User ID param
export const adminUserIdParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid user ID format" }),
});

// Update user body
export const adminUpdateUserSchema = z
  .object({
    displayName: z.string().min(1).max(50).optional(),
    timezone: z.string().max(100).optional(),
  })
  .refine((data) => data.displayName || data.timezone, {
    message: "At least one field must be provided",
  });

export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

// Admin user response (includes role, status, tripCount - NOT in public API)
export const adminUserResponseSchema = z.object({
  id: z.string().uuid(),
  phoneNumber: z.string(),
  displayName: z.string(),
  profilePhotoUrl: z.string().nullable(),
  handles: z.record(z.string(), z.string()).nullable(),
  timezone: z.string().nullable(),
  temperatureUnit: z.string().nullable(),
  role: z.string(),
  status: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Admin user detail response (with trip count)
export const adminUserDetailResponseSchema = z.object({
  success: z.literal(true),
  user: adminUserResponseSchema.extend({
    tripCount: z.number(),
  }),
});

// Admin user list response
export const adminUserListResponseSchema = z.object({
  success: z.literal(true),
  users: z.array(adminUserResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

// Success response for admin actions
export const adminSuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

// Update user response
export const adminUpdateUserResponseSchema = z.object({
  success: z.literal(true),
  user: adminUserResponseSchema,
});

// User ID param (for impersonation routes using :userId)
export const adminImpersonateUserIdParamsSchema = z.object({
  userId: z.string().uuid({ message: "Invalid user ID format" }),
});

// Impersonation request body (re-auth code)
export const adminImpersonateSchema = z.object({
  code: z
    .string()
    .length(6, { message: "Verification code must be exactly 6 characters" })
    .regex(/^\d{6}$/, {
      message: "Verification code must contain only digits",
    }),
});

export type AdminImpersonateInput = z.infer<typeof adminImpersonateSchema>;

// Impersonation success response
export const adminImpersonateResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

// Enhanced /auth/me response that includes admin context
// This extends the base getMeResponse without exposing role/status in the user object
export const adminMeContextSchema = z.object({
  isAdmin: z.boolean().optional(),
  impersonating: z.boolean().optional(),
  impersonatingUser: z
    .object({
      id: z.string().uuid(),
      displayName: z.string(),
    })
    .optional(),
});
