// User-related types for the Journiful platform

import type { TemperatureUnit } from "./weather";

/**
 * User entity representation
 * Note: Dates are serialized as ISO 8601 strings for API responses
 */
export interface User {
  /** Unique user identifier (UUID) */
  id: string;
  /** User's phone number */
  phoneNumber: string;
  /** User's display name */
  displayName: string;
  /** Optional profile photo URL */
  profilePhotoUrl?: string;
  /** User's timezone (IANA timezone string, null for auto-detect) */
  timezone: string | null;
  /** User social media handles (e.g., venmo, instagram) */
  handles: Record<string, string> | null;
  /** Preferred temperature unit for weather display */
  temperatureUnit?: TemperatureUnit;
  /** Account creation timestamp (ISO 8601 string) */
  createdAt: string;
  /** Last update timestamp (ISO 8601 string) */
  updatedAt: string;
}

/**
 * Authentication response returned after successful login
 */
export interface AuthResponse {
  /** JWT authentication token */
  token: string;
  /** Authenticated user data */
  user: User;
  /** Flag indicating if user needs to complete their profile */
  requiresProfile: boolean;
}
