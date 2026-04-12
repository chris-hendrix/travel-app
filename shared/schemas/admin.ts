import { z } from "zod";

// Query params for listing users
export const adminListUsersQuerySchema = z.object({
  search: z.string().max(100).optional(),
  status: z.enum(["active", "banned"]).optional(),
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
