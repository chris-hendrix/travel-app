/**
 * The profile dialog is still a mockup, so it lives under /design. This
 * route is the address the app chrome points at, so the header keeps
 * working while the screen is under construction; both render the same
 * component, and nothing is duplicated.
 */
export { default } from "./design/profile";
