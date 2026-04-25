/**
 * Event types and response interfaces
 */

import type { LinkItem } from "./link";

/**
 * Event entity
 */
export interface Event {
  id: string;
  tripId: string;
  createdBy: string;
  name: string;
  description: string | null;
  eventType: "travel" | "meal" | "activity";
  location: string | null;
  meetupLocation: string | null;
  meetupTime: Date | null;
  startTime: Date;
  endTime: Date | null;
  allDay: boolean;
  isOptional: boolean;
  links: LinkItem[] | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Whether the event creator is currently attending (RSVP status = 'going') */
  creatorAttending?: boolean;
  /** Display name of the event creator */
  creatorName?: string;
  /** Profile photo URL of the event creator */
  creatorProfilePhotoUrl?: string | null;
}

/**
 * API response for fetching multiple events
 */
export interface GetEventsResponse {
  success: true;
  events: Event[];
}

/**
 * API response for fetching a single event
 */
export interface GetEventResponse {
  success: true;
  event: Event;
}

/**
 * API response for creating an event
 */
export interface CreateEventResponse {
  success: true;
  event: Event;
}

/**
 * API response for updating an event
 */
export interface UpdateEventResponse {
  success: true;
  event: Event;
}

/**
 * API response for restoring an event
 */
export interface RestoreEventResponse {
  success: true;
  event: Event;
}
