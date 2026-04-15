import {
  trips,
  members,
  events,
  accommodations,
  memberTravel,
  mutedMembers,
} from "@/db/schema/index.js";
import { eq, and, or, isNull } from "drizzle-orm";
import type { AppDatabase } from "@/types/index.js";

/**
 * Permissions Service Interface
 * Defines the contract for authorization and permission checking operations
 */
export interface IPermissionsService {
  /**
   * Checks if a user can edit a trip
   * A user can edit a trip if they are the creator OR a co-organizer (member with isOrganizer=true)
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns Promise that resolves to true if user can edit, false otherwise
   */
  canEditTrip(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a user can delete a trip
   * A user can delete a trip if they are the creator OR a co-organizer (member with isOrganizer=true)
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns Promise that resolves to true if user can delete, false otherwise
   */
  canDeleteTrip(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a user can manage co-organizers for a trip
   * A user can manage co-organizers if they are the creator OR a co-organizer (member with isOrganizer=true)
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns Promise that resolves to true if user can manage co-organizers, false otherwise
   */
  canManageCoOrganizers(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a user is an organizer of a trip
   * A user is an organizer if they have a member record with `isOrganizer=true` for this trip,
   * or if they are the trip creator.
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns Promise that resolves to true if user is an organizer, false otherwise
   */
  isOrganizer(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a user is a member of a trip
   * A user is a member if they have a record in the members table for the trip
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns Promise that resolves to true if user is a member, false otherwise
   */
  isMember(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a user can add an event to a trip
   * A user can add an event if they are:
   * 1. An organizer (isOrganizer=true), who can always add events, OR
   * 2. A regular member with status='going' AND trip.allowMembersToAddEvents=true
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns Promise that resolves to true if user can add event, false otherwise
   */
  canAddEvent(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a user can edit an event
   * A user can edit an event if they are:
   * 1. An organizer of the event's trip, OR
   * 2. The event creator AND their member status is 'going'
   * @param userId - The UUID of the user to check
   * @param eventId - The UUID of the event to check
   * @returns Promise that resolves to true if user can edit event, false otherwise
   */
  canEditEvent(userId: string, eventId: string): Promise<boolean>;

  /**
   * Checks if a user can delete an event
   * Delegates to canEditEvent - same permission rules apply
   * @param userId - The UUID of the user to check
   * @param eventId - The UUID of the event to check
   * @returns Promise that resolves to true if user can delete event, false otherwise
   */
  canDeleteEvent(userId: string, eventId: string): Promise<boolean>;

  /**
   * Checks if a user can add accommodation to a trip
   * Only organizers (creator OR member with isOrganizer=true) can add accommodations
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns Promise that resolves to true if user can add accommodation, false otherwise
   */
  canAddAccommodation(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a user can edit an accommodation
   * Only organizers of the accommodation's trip can edit accommodations
   * @param userId - The UUID of the user to check
   * @param accommodationId - The UUID of the accommodation to check
   * @returns Promise that resolves to true if user can edit accommodation, false otherwise
   */
  canEditAccommodation(
    userId: string,
    accommodationId: string,
  ): Promise<boolean>;

  /**
   * Checks if a user can delete an accommodation
   * Only organizers of the accommodation's trip can delete accommodations
   * @param userId - The UUID of the user to check
   * @param accommodationId - The UUID of the accommodation to check
   * @returns Promise that resolves to true if user can delete accommodation, false otherwise
   */
  canDeleteAccommodation(
    userId: string,
    accommodationId: string,
  ): Promise<boolean>;

  /**
   * Checks if a user can add member travel to a trip
   * Any member (with any status) can add member travel
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns Promise that resolves to true if user can add member travel, false otherwise
   */
  canAddMemberTravel(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a user can edit member travel
   * A user can edit member travel if they are:
   * 1. The owner (memberId.userId = userId), OR
   * 2. An organizer of the trip
   * @param userId - The UUID of the user to check
   * @param memberTravelId - The UUID of the member travel to check
   * @returns Promise that resolves to true if user can edit member travel, false otherwise
   */
  canEditMemberTravel(userId: string, memberTravelId: string): Promise<boolean>;

  /**
   * Checks if a user can delete member travel
   * A user can delete member travel if they are:
   * 1. The owner (memberId.userId = userId), OR
   * 2. An organizer of the trip
   * @param userId - The UUID of the user to check
   * @param memberTravelId - The UUID of the member travel to check
   * @returns Promise that resolves to true if user can delete member travel, false otherwise
   */
  canDeleteMemberTravel(
    userId: string,
    memberTravelId: string,
  ): Promise<boolean>;

  /**
   * Checks if a user can invite members to a trip
   * Only organizers can invite members
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns Promise that resolves to true if user can invite members, false otherwise
   */
  canInviteMembers(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a user can update their RSVP for a trip
   * Any member can update their RSVP
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns Promise that resolves to true if user can update RSVP, false otherwise
   */
  canUpdateRsvp(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a user can view the full trip details
   * Only members with status='going' can view full trip details
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns Promise that resolves to true if user can view full trip, false otherwise
   */
  canViewFullTrip(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a trip is locked (past its end date)
   * A trip is locked when its endDate has fully passed (end of day UTC)
   * @param tripId - The UUID of the trip to check
   * @returns Promise that resolves to true if trip is locked, false otherwise
   */
  isTripLocked(tripId: string): Promise<boolean>;

  /**
   * Checks if a user can edit an event using pre-loaded event data
   * Avoids re-loading the event from the database
   * @param userId - The UUID of the user to check
   * @param eventData - Pre-loaded event data with tripId and createdBy
   * @returns Promise that resolves to true if user can edit event, false otherwise
   */
  canEditEventWithData(
    userId: string,
    eventData: { tripId: string; createdBy: string },
  ): Promise<boolean>;

  /**
   * Checks if a user can delete an event using pre-loaded event data
   * Delegates to canEditEventWithData
   * @param userId - The UUID of the user to check
   * @param eventData - Pre-loaded event data with tripId and createdBy
   * @returns Promise that resolves to true if user can delete event, false otherwise
   */
  canDeleteEventWithData(
    userId: string,
    eventData: { tripId: string; createdBy: string },
  ): Promise<boolean>;

  /**
   * Checks if a user can edit an accommodation using pre-loaded tripId
   * Avoids re-loading the accommodation from the database
   * @param userId - The UUID of the user to check
   * @param tripId - The trip ID from the pre-loaded accommodation
   * @returns Promise that resolves to true if user can edit accommodation, false otherwise
   */
  canEditAccommodationWithData(
    userId: string,
    tripId: string,
  ): Promise<boolean>;

  /**
   * Checks if a user can delete an accommodation using pre-loaded tripId
   * Delegates to canEditAccommodationWithData
   * @param userId - The UUID of the user to check
   * @param tripId - The trip ID from the pre-loaded accommodation
   * @returns Promise that resolves to true if user can delete accommodation, false otherwise
   */
  canDeleteAccommodationWithData(
    userId: string,
    tripId: string,
  ): Promise<boolean>;

  /**
   * Checks if a user can edit member travel using pre-loaded data
   * Avoids re-loading the member travel from the database
   * @param userId - The UUID of the user to check
   * @param memberTravelData - Pre-loaded member travel data with tripId and memberId
   * @returns Promise that resolves to true if user can edit member travel, false otherwise
   */
  canEditMemberTravelWithData(
    userId: string,
    memberTravelData: { tripId: string; memberId: string },
  ): Promise<boolean>;

  /**
   * Checks if a user can delete member travel using pre-loaded data
   * Delegates to canEditMemberTravelWithData
   * @param userId - The UUID of the user to check
   * @param memberTravelData - Pre-loaded member travel data with tripId and memberId
   * @returns Promise that resolves to true if user can delete member travel, false otherwise
   */
  canDeleteMemberTravelWithData(
    userId: string,
    memberTravelData: { tripId: string; memberId: string },
  ): Promise<boolean>;

  /**
   * Gets membership info for a user in a trip in a single query
   * Returns both isMember and isOrganizer status
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns Promise that resolves to { isMember, isOrganizer }
   */
  getMembershipInfo(
    userId: string,
    tripId: string,
  ): Promise<{ isMember: boolean; isOrganizer: boolean }>;

  /**
   * Checks if a user can view messages in a trip
   * Only going members can view messages
   */
  canViewMessages(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a user can post a message in a trip
   * Must be going member, not muted, and trip not locked
   */
  canPostMessage(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a user can moderate messages (pin, delete others' messages)
   * Only organizers can moderate
   */
  canModerateMessages(userId: string, tripId: string): Promise<boolean>;

  /**
   * Checks if a user can mute a member in a trip
   * Organizer only, and cannot mute other organizers
   */
  canMuteMember(
    userId: string,
    tripId: string,
    targetId: string,
  ): Promise<boolean>;

  /**
   * Checks if a member is muted in a trip
   */
  isMemberMuted(tripId: string, userId: string): Promise<boolean>;
}

/**
 * Permissions Service Implementation
 * Handles authorization and permission checking for trip-related operations
 */
export class PermissionsService implements IPermissionsService {
  constructor(private db: AppDatabase) {}

  /**
   * Checks if a user is an organizer of a trip
   * A user is an organizer if:
   * 1. They are the trip creator (trips.createdBy matches userId), OR
   * 2. They have a member record with isOrganizer=true
   *
   * Uses a LEFT JOIN to check both conditions in a single query
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns true if user is an organizer, false otherwise
   */
  async isOrganizer(userId: string, tripId: string): Promise<boolean> {
    const result = await this.db
      .select({
        tripId: trips.id,
        createdBy: trips.createdBy,
        memberUserId: members.userId,
        memberIsOrganizer: members.isOrganizer,
      })
      .from(trips)
      .leftJoin(
        members,
        and(
          eq(members.tripId, trips.id),
          eq(members.userId, userId),
          eq(members.isOrganizer, true),
        ),
      )
      .where(
        and(
          eq(trips.id, tripId),
          or(
            eq(trips.createdBy, userId), // User is the creator
            eq(members.userId, userId), // User is a co-organizer (isOrganizer=true from JOIN)
          ),
        ),
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Checks if a user is a member of a trip
   * A user is a member if they have any record in the members table for the trip
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns true if user is a member, false otherwise
   */
  async isMember(userId: string, tripId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Checks if a user can edit a trip
   * Delegates to isOrganizer - only organizers can edit trips
   */
  async canEditTrip(userId: string, tripId: string): Promise<boolean> {
    return this.isOrganizer(userId, tripId);
  }

  /**
   * Checks if a user can delete a trip
   * Delegates to isOrganizer - only organizers can delete trips
   */
  async canDeleteTrip(userId: string, tripId: string): Promise<boolean> {
    return this.isOrganizer(userId, tripId);
  }

  /**
   * Checks if a user can manage co-organizers for a trip
   * Delegates to isOrganizer - only organizers can manage co-organizers
   */
  async canManageCoOrganizers(
    userId: string,
    tripId: string,
  ): Promise<boolean> {
    return this.isOrganizer(userId, tripId);
  }

  /**
   * Helper method to get the tripId for an accommodation
   * @param accommodationId - The UUID of the accommodation
   * @returns tripId if accommodation exists, null otherwise
   */
  private async getAccommodationTripId(
    accommodationId: string,
  ): Promise<string | null> {
    const result = await this.db
      .select({ tripId: accommodations.tripId })
      .from(accommodations)
      .where(eq(accommodations.id, accommodationId))
      .limit(1);

    return result.length > 0 ? result[0]!.tripId : null;
  }

  /**
   * Helper method to check if a user is the owner of member travel
   * Member travel is owned by the user if memberTravel.memberId references a member record
   * where members.userId = userId
   * @param userId - The UUID of the user to check
   * @param memberTravelId - The UUID of the member travel to check
   * @returns true if user owns the member travel, false otherwise
   */
  private async isMemberTravelOwner(
    userId: string,
    memberTravelId: string,
  ): Promise<boolean> {
    const result = await this.db
      .select({ userId: members.userId })
      .from(memberTravel)
      .innerJoin(members, eq(memberTravel.memberId, members.id))
      .where(eq(memberTravel.id, memberTravelId))
      .limit(1);

    return result.length > 0 && result[0]!.userId === userId;
  }

  /**
   * Helper method to get the tripId for member travel
   * @param memberTravelId - The UUID of the member travel
   * @returns tripId if member travel exists, null otherwise
   */
  private async getMemberTravelTripId(
    memberTravelId: string,
  ): Promise<string | null> {
    const result = await this.db
      .select({ tripId: memberTravel.tripId })
      .from(memberTravel)
      .where(eq(memberTravel.id, memberTravelId))
      .limit(1);

    return result.length > 0 ? result[0]!.tripId : null;
  }

  /**
   * Checks if a user can add an event to a trip
   * A user can add an event if they are:
   * 1. An organizer (isOrganizer=true), who can always add events, OR
   * 2. A regular member with status='going' AND trip.allowMembersToAddEvents=true
   */
  async canAddEvent(userId: string, tripId: string): Promise<boolean> {
    // First check if user is an organizer (covers both creator and co-organizers)
    // Organizers always have permission to add events
    if (await this.isOrganizer(userId, tripId)) {
      return true;
    }

    // Check if user is a regular member with status='going' AND allowMembersToAddEvents is enabled
    const result = await this.db
      .select({
        allowMembersToAddEvents: trips.allowMembersToAddEvents,
        memberStatus: members.status,
      })
      .from(trips)
      .innerJoin(
        members,
        and(
          eq(members.tripId, trips.id),
          eq(members.userId, userId),
          eq(members.status, "going"),
        ),
      )
      .where(eq(trips.id, tripId))
      .limit(1);

    if (result.length === 0) {
      return false;
    }

    return result[0]!.allowMembersToAddEvents;
  }

  /**
   * Checks if a user can edit an event
   * A user can edit an event if they are:
   * 1. An organizer of the event's trip, OR
   * 2. The event creator AND their member status is 'going'
   */
  async canEditEvent(userId: string, eventId: string): Promise<boolean> {
    // Get the event and its trip
    const eventResult = await this.db
      .select({
        eventId: events.id,
        tripId: events.tripId,
        createdBy: events.createdBy,
      })
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .limit(1);

    if (eventResult.length === 0) return false;
    const event = eventResult[0]!;

    // Organizers can always edit any event
    const isOrganizerResult = await this.isOrganizer(userId, event.tripId);
    if (isOrganizerResult) return true;

    // Event creator can edit only if they are the creator AND their status is 'going'
    if (event.createdBy === userId) {
      const memberResult = await this.db
        .select({ status: members.status })
        .from(members)
        .where(
          and(
            eq(members.tripId, event.tripId),
            eq(members.userId, userId),
            eq(members.status, "going"),
          ),
        )
        .limit(1);
      return memberResult.length > 0;
    }

    return false;
  }

  /**
   * Checks if a user can delete an event
   * Uses same logic as canEditEvent
   */
  async canDeleteEvent(userId: string, eventId: string): Promise<boolean> {
    return this.canEditEvent(userId, eventId);
  }

  /**
   * Checks if a user can add accommodation to a trip
   * Only organizers can add accommodations
   */
  async canAddAccommodation(userId: string, tripId: string): Promise<boolean> {
    return this.isOrganizer(userId, tripId);
  }

  /**
   * Checks if a user can edit an accommodation
   * Only organizers of the accommodation's trip can edit
   */
  async canEditAccommodation(
    userId: string,
    accommodationId: string,
  ): Promise<boolean> {
    const tripId = await this.getAccommodationTripId(accommodationId);
    if (!tripId) {
      return false;
    }

    return this.isOrganizer(userId, tripId);
  }

  /**
   * Checks if a user can delete an accommodation
   * Uses same logic as canEditAccommodation
   */
  async canDeleteAccommodation(
    userId: string,
    accommodationId: string,
  ): Promise<boolean> {
    return this.canEditAccommodation(userId, accommodationId);
  }

  /**
   * Checks if a user can add member travel to a trip
   * Any member (with any status) can add member travel
   */
  async canAddMemberTravel(userId: string, tripId: string): Promise<boolean> {
    return this.isMember(userId, tripId);
  }

  /**
   * Checks if a user can edit member travel
   * A user can edit if they are the owner OR an organizer of the trip
   */
  async canEditMemberTravel(
    userId: string,
    memberTravelId: string,
  ): Promise<boolean> {
    // Check if user is the owner
    if (await this.isMemberTravelOwner(userId, memberTravelId)) {
      return true;
    }

    // Check if user is an organizer of the trip
    const tripId = await this.getMemberTravelTripId(memberTravelId);
    if (!tripId) {
      return false;
    }

    return this.isOrganizer(userId, tripId);
  }

  /**
   * Checks if a user can delete member travel
   * Uses same logic as canEditMemberTravel
   */
  async canDeleteMemberTravel(
    userId: string,
    memberTravelId: string,
  ): Promise<boolean> {
    return this.canEditMemberTravel(userId, memberTravelId);
  }

  /**
   * Checks if a user can invite members to a trip
   * Only organizers can invite members
   */
  async canInviteMembers(userId: string, tripId: string): Promise<boolean> {
    return this.isOrganizer(userId, tripId);
  }

  /**
   * Checks if a user can update their RSVP for a trip
   * Any member can update their RSVP
   */
  async canUpdateRsvp(userId: string, tripId: string): Promise<boolean> {
    return this.isMember(userId, tripId);
  }

  /**
   * Checks if a user can view the full trip details
   * Only members with status='going' can view full trip details
   */
  async canViewFullTrip(userId: string, tripId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.tripId, tripId),
          eq(members.userId, userId),
          eq(members.status, "going"),
        ),
      )
      .limit(1);
    return result.length > 0;
  }

  /**
   * Checks if a trip is locked (past its end date)
   * A trip is locked when its endDate has fully passed (end of day UTC)
   * @param tripId - The UUID of the trip to check
   * @returns true if trip is locked, false otherwise
   */
  async isTripLocked(tripId: string): Promise<boolean> {
    const [trip] = await this.db
      .select({ endDate: trips.endDate })
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!trip || !trip.endDate) return false;

    const endOfTripDay = new Date(trip.endDate);
    endOfTripDay.setUTCHours(23, 59, 59, 999);
    return new Date() > endOfTripDay;
  }

  /**
   * Checks if a user can edit an event using pre-loaded event data
   * Avoids re-loading the event from the database
   * @param userId - The UUID of the user to check
   * @param eventData - Pre-loaded event data with tripId and createdBy
   * @returns true if user can edit event, false otherwise
   */
  async canEditEventWithData(
    userId: string,
    eventData: { tripId: string; createdBy: string },
  ): Promise<boolean> {
    // Organizers can always edit any event
    const isOrganizerResult = await this.isOrganizer(userId, eventData.tripId);
    if (isOrganizerResult) return true;

    // Event creator can edit only if they are the creator AND their status is 'going'
    if (eventData.createdBy === userId) {
      const memberResult = await this.db
        .select({ status: members.status })
        .from(members)
        .where(
          and(
            eq(members.tripId, eventData.tripId),
            eq(members.userId, userId),
            eq(members.status, "going"),
          ),
        )
        .limit(1);
      return memberResult.length > 0;
    }

    return false;
  }

  /**
   * Checks if a user can delete an event using pre-loaded event data
   * Delegates to canEditEventWithData
   */
  async canDeleteEventWithData(
    userId: string,
    eventData: { tripId: string; createdBy: string },
  ): Promise<boolean> {
    return this.canEditEventWithData(userId, eventData);
  }

  /**
   * Checks if a user can edit an accommodation using pre-loaded tripId
   * Avoids re-loading the accommodation from the database
   * @param userId - The UUID of the user to check
   * @param tripId - The trip ID from the pre-loaded accommodation
   * @returns true if user can edit accommodation, false otherwise
   */
  async canEditAccommodationWithData(
    userId: string,
    tripId: string,
  ): Promise<boolean> {
    return this.isOrganizer(userId, tripId);
  }

  /**
   * Checks if a user can delete an accommodation using pre-loaded tripId
   * Delegates to canEditAccommodationWithData
   */
  async canDeleteAccommodationWithData(
    userId: string,
    tripId: string,
  ): Promise<boolean> {
    return this.canEditAccommodationWithData(userId, tripId);
  }

  /**
   * Checks if a user can edit member travel using pre-loaded data
   * Avoids re-loading the member travel from the database
   * @param userId - The UUID of the user to check
   * @param memberTravelData - Pre-loaded member travel data with tripId and memberId
   * @returns true if user can edit member travel, false otherwise
   */
  async canEditMemberTravelWithData(
    userId: string,
    memberTravelData: { tripId: string; memberId: string },
  ): Promise<boolean> {
    // Check if user is the owner by looking up the member record
    const memberResult = await this.db
      .select({ userId: members.userId })
      .from(members)
      .where(eq(members.id, memberTravelData.memberId))
      .limit(1);

    if (memberResult.length > 0 && memberResult[0]!.userId === userId) {
      return true;
    }

    // Check if user is an organizer of the trip
    return this.isOrganizer(userId, memberTravelData.tripId);
  }

  /**
   * Checks if a user can delete member travel using pre-loaded data
   * Delegates to canEditMemberTravelWithData
   */
  async canDeleteMemberTravelWithData(
    userId: string,
    memberTravelData: { tripId: string; memberId: string },
  ): Promise<boolean> {
    return this.canEditMemberTravelWithData(userId, memberTravelData);
  }

  /**
   * Gets membership info for a user in a trip in a single query
   * Returns both isMember and isOrganizer status
   * Checks both the members table (for isOrganizer flag) and trips table (for creator)
   * @param userId - The UUID of the user to check
   * @param tripId - The UUID of the trip to check
   * @returns { isMember, isOrganizer }
   */
  async getMembershipInfo(
    userId: string,
    tripId: string,
  ): Promise<{ isMember: boolean; isOrganizer: boolean }> {
    // Single query: get member record and trip creator info
    const result = await this.db
      .select({
        memberId: members.id,
        memberIsOrganizer: members.isOrganizer,
        tripCreatedBy: trips.createdBy,
      })
      .from(members)
      .innerJoin(trips, eq(trips.id, members.tripId))
      .where(and(eq(members.tripId, tripId), eq(members.userId, userId)))
      .limit(1);

    if (result.length === 0) {
      return { isMember: false, isOrganizer: false };
    }

    const row = result[0]!;
    return {
      isMember: true,
      isOrganizer: row.memberIsOrganizer || row.tripCreatedBy === userId,
    };
  }

  /**
   * Checks if a user can view messages in a trip
   * Only going members can view messages
   */
  async canViewMessages(userId: string, tripId: string): Promise<boolean> {
    return this.canViewFullTrip(userId, tripId);
  }

  /**
   * Checks if a user can post a message in a trip
   * Must be going member, not muted, and trip not locked
   */
  async canPostMessage(userId: string, tripId: string): Promise<boolean> {
    const [canView, isLocked, isMuted] = await Promise.all([
      this.canViewFullTrip(userId, tripId),
      this.isTripLocked(tripId),
      this.isMemberMuted(tripId, userId),
    ]);
    return canView && !isLocked && !isMuted;
  }

  /**
   * Checks if a user can moderate messages (pin, delete others' messages)
   * Only organizers can moderate
   */
  async canModerateMessages(userId: string, tripId: string): Promise<boolean> {
    return this.isOrganizer(userId, tripId);
  }

  /**
   * Checks if a user can mute a member in a trip
   * Organizer only, and cannot mute other organizers
   */
  async canMuteMember(
    userId: string,
    tripId: string,
    targetId: string,
  ): Promise<boolean> {
    const [isOrg, targetIsOrg] = await Promise.all([
      this.isOrganizer(userId, tripId),
      this.isOrganizer(targetId, tripId),
    ]);
    return isOrg && !targetIsOrg;
  }

  /**
   * Checks if a member is muted in a trip
   */
  async isMemberMuted(tripId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .select({ id: mutedMembers.id })
      .from(mutedMembers)
      .where(
        and(eq(mutedMembers.tripId, tripId), eq(mutedMembers.userId, userId)),
      )
      .limit(1);
    return result.length > 0;
  }
}
