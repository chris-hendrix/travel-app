/**
 * API shape -> mobile shape, one pure function per domain.
 *
 * No React, no fetch, no react-native imports: node-importable like
 * `lib/api.ts`, so the mapping stays unit-testable in plain node.
 * Screens keep consuming the mobile shapes (`Trip`, `ItineraryEvent`,
 * `Member`, `Notification`, `Profile`, `Stay`, `MockTravel`); the query
 * options in `lib/queries/` will apply these in `select`/on receipt.
 */

import type { Trip } from "@/components/trip/TripCard";
import type { ItineraryEvent } from "@/lib/itinerary";
import type { Member } from "@/lib/members";
import type { Notification } from "@/lib/notifications";
import type { Profile } from "@/lib/profile";
import type { Stay } from "@/lib/stays";
import type { MockTravel } from "@/mocks/travel";
import type {
  Accommodation,
  Event,
  MemberTravel,
  MemberWithProfile,
  Notification as ApiNotification,
  TripDetail,
  TripSummary,
  User,
} from "@journiful/shared/types";

import { placeholderPhoto } from "@/lib/placeholder";
// Re-exported so existing `placeholderPhoto` call sites keep working;
// new code should import from `@/lib/placeholder` directly.
export { placeholderPhoto };

/** The API hands back `Date`s; the wire hands back ISO strings. */
function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/** Nullable variant of {@link iso} — null stays null. */
function isoOrNull(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

function deletedAtOf(value: Date | string | null): string | null {
  return isoOrNull(value);
}

function handlesOf(
  handles: Record<string, string> | null | undefined,
): { venmo?: string; instagram?: string } | null {
  if (!handles) return null;
  const picked: { venmo?: string; instagram?: string } = {};
  if (typeof handles.venmo === "string" && handles.venmo) {
    picked.venmo = handles.venmo;
  }
  if (typeof handles.instagram === "string" && handles.instagram) {
    picked.instagram = handles.instagram;
  }
  // Absent, not empty: a record with neither platform is no handles.
  return Object.keys(picked).length > 0 ? picked : null;
}

/**
 * A trip's detail onto the mobile `Trip`. `going` is the server's
 * member count, so the header and the roster can never disagree.
 */
export function toTrip(detail: TripDetail): Trip {
  return {
    id: detail.id,
    title: detail.name,
    location: detail.destination,
    image: detail.coverImageUrl ?? placeholderPhoto(detail.id),
    going: detail.memberCount,
    startDate: detail.startDate ?? "",
    endDate: detail.endDate ?? "",
    description: detail.description,
    preferredTimezone: detail.preferredTimezone,
  };
}

/** A list summary onto the mobile `Trip`: `going` is `memberCount`. */
export function toTripSummary(summary: TripSummary): Trip {
  return {
    id: summary.id,
    title: summary.name,
    location: summary.destination,
    image: summary.coverImageUrl ?? placeholderPhoto(summary.id),
    going: summary.memberCount,
    startDate: summary.startDate ?? "",
    endDate: summary.endDate ?? "",
    description: null,
    preferredTimezone: "",
  };
}

/**
 * An API event onto `ItineraryEvent`: `eventType` -> `type`,
 * `location` -> `place`.
 */
export function toEvent(event: Event): ItineraryEvent {
  return {
    id: event.id,
    name: event.name,
    type: event.eventType,
    description: event.description,
    startTime: iso(event.startTime),
    endTime: event.endTime === null ? null : iso(event.endTime),
    allDay: event.allDay,
    place: event.location ?? "",
    // TODO(BE): Events have no photo column or endpoint. Real art needs `events.imageUrl`/`placePhotoRef`, or a persisted `placeId` resolvable via `/api/locations/photos/:photoRef`.
    image: placeholderPhoto(event.id),
    deletedAt: deletedAtOf(event.deletedAt),
  };
}

/**
 * An accommodation onto `Stay`: `address` -> `place`-side fields stay
 * as-is, times pass through (null = the untimed stay).
 */
export function toStay(accommodation: Accommodation): Stay {
  return {
    id: accommodation.id,
    name: accommodation.name,
    address: accommodation.address,
    addressLat: accommodation.addressLat,
    addressLon: accommodation.addressLon,
    description: accommodation.description,
    checkIn: accommodation.checkIn,
    checkOut: accommodation.checkOut,
    // TODO(BE): Accommodations have no photo column or endpoint. Same shape as (1).
    image: placeholderPhoto(accommodation.id),
    links: (accommodation.links ?? []).map((link) => ({
      url: link.url,
      name: link.name ?? link.url,
    })),
    deletedAt: deletedAtOf(accommodation.deletedAt),
  };
}

/** A member-travel row onto `MockTravel`, both ends of the leg. */
export function toTravel(travel: MemberTravel): MockTravel {
  return {
    id: travel.id,
    memberId: travel.memberId,
    memberName: travel.memberName ?? "",
    travelType: travel.travelType,
    departureTime: travel.departureTime === null ? null : iso(travel.departureTime),
    departureLocation: travel.departureLocation,
    arrivalTime: travel.arrivalTime === null ? null : iso(travel.arrivalTime),
    arrivalLocation: travel.arrivalLocation,
    flightNumber: travel.flightNumber,
    details: travel.details,
    deletedAt: deletedAtOf(travel.deletedAt),
  };
}

/**
 * A roster row onto `Member`. Phone visibility is server-side (the
 * column arrives only when the viewer may see it), so an absent number
 * maps to "" rather than a guess.
 */
export function toMember(member: MemberWithProfile): Member {
  return {
    id: member.id,
    userId: member.userId,
    name: member.displayName,
    status: member.status,
    isOrganizer: member.isOrganizer,
    phone: member.phoneNumber ?? member.guestPhone ?? "",
    sharePhone: member.sharePhone ?? false,
    handles: handlesOf(member.handles),
  };
}

/** A notification row onto the mobile `Notification` (1:1 minus userId). */
export function toNotification(notification: ApiNotification): Notification {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    tripId: notification.tripId,
    data: notification.data,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

/** A user onto the flat `Profile` (nested `handles` pass through). */
export function toProfile(user: User): Profile {
  return {
    id: user.id,
    displayName: user.displayName,
    phoneNumber: user.phoneNumber,
    profilePhotoUrl: user.profilePhotoUrl ?? null,
    handles: handlesOf(user.handles),
    timezone: user.timezone,
    temperatureUnit: user.temperatureUnit ?? "fahrenheit",
  };
}
