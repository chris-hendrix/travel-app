// Barrel exports for @journiful/shared package

// Types
export type {
  ApiResponse,
  PaginatedResponse,
  ErrorResponse,
  User,
  AuthResponse,
  Trip,
  TripSummary,
  TripDetail,
  GetTripsResponse,
  GetTripResponse,
  CreateTripResponse,
  UpdateTripResponse,
} from "./types/index";

// Schemas
export {
  phoneNumberSchema,
  PHONE_REGEX,
  emailSchema,
  uuidSchema,
  requestCodeSchema,
  verifyCodeSchema,
  completeProfileSchema,
  createTripSchema,
  updateTripSchema,
  addCoOrganizerSchema,
} from "./schemas/index";

// Schema inferred types
export type {
  RequestCodeInput,
  VerifyCodeInput,
  CompleteProfileInput,
  CreateTripInput,
  UpdateTripInput,
  AddCoOrganizerInput,
} from "./schemas/index";

// Utils
export { convertToUTC, formatInTimeZone } from "./utils/index";
export {
  hexToHsl,
  hslToHex,
  derivePaletteVariants,
  deriveDarkPaletteVariants,
  readableForeground,
} from "./utils/index";

// Config
export { THEME_PRESETS, THEME_IDS } from "./config/index";
export { THEME_FONTS, FONT_DISPLAY_NAMES } from "./config/index";

// Theme types (re-exported for convenience)
export { THEME_FONT_VALUES } from "./types/index";
export type { ThemeFont, ThemeBackground, ThemePreset } from "./types/index";
