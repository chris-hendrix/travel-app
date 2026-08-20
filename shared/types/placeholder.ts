/**
 * Placeholder member types
 */

/**
 * Input for creating a placeholder member
 */
export interface CreatePlaceholderInput {
  name: string;
  phoneNumber?: string;
}

/**
 * Input for updating a placeholder member
 */
export interface UpdatePlaceholderInput {
  name?: string;
  phoneNumber?: string;
}
