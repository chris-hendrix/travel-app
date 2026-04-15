import {
  events,
  trips,
  users,
  members,
  type Event,
} from "@/db/schema/index.js";
import { eq, and, isNull, count, getTableColumns } from "drizzle-orm";
import type {
  CreateEventInput,
  UpdateEventInput,
} from "@journiful/shared/schemas";
import type { AppDatabase } from "@/types/index.js";
import type { IPermissionsService } from "./permissions.service.js";
import {
  EventNotFoundError,
  EventLimitExceededError,
  PermissionDeniedError,
  TripNotFoundError,
  InvalidDateRangeError,
  TripLockedError,
} from "../errors.js";

/**
 * Event Service Interface
 * Defines the contract for event management operations
 */
export interface IEventService {
  /**
   * Creates a new event for a trip
   * @param userId - The ID of the user creating the event
   * @param tripId - The ID of the trip
   * @param data - The event creation data
   * @returns Promise that resolves to the created event
   * @throws TripNotFoundError if trip not found
   * @throws PermissionDeniedError if user lacks permission
   * @throws InvalidDateRangeError if endTime is before startTime
   */
  createEvent(
    userId: string,
    tripId: string,
    data: CreateEventInput,
  ): Promise<Event>;

  /**
   * Gets an event by ID
   * @param eventId - The UUID of the event to retrieve
   * @returns Promise that resolves to the event, or null if not found or soft-deleted
   */
  getEvent(eventId: string): Promise<Event | null>;

  /**
   * Gets all events for a trip with creator attendance info
   * @param tripId - The UUID of the trip
   * @param includeDeleted - Whether to include soft-deleted events (default: false)
   * @returns Promise that resolves to array of events with creator info
   */
  getEventsByTrip(
    tripId: string,
    includeDeleted?: boolean,
  ): Promise<
    (Event & {
      creatorAttending: boolean;
      creatorName: string;
      creatorProfilePhotoUrl: string | null;
    })[]
  >;

  /**
   * Updates an event
   * @param userId - The ID of the user updating the event
   * @param eventId - The UUID of the event to update
   * @param data - The event update data
   * @returns Promise that resolves to the updated event
   * @throws EventNotFoundError if event not found
   * @throws PermissionDeniedError if user lacks permission
   * @throws InvalidDateRangeError if endTime is before startTime
   */
  updateEvent(
    userId: string,
    eventId: string,
    data: UpdateEventInput,
  ): Promise<Event>;

  /**
   * Deletes an event (soft delete)
   * @param userId - The ID of the user deleting the event
   * @param eventId - The UUID of the event to delete
   * @returns Promise that resolves when the event is deleted
   * @throws EventNotFoundError if event not found
   * @throws PermissionDeniedError if user lacks permission
   */
  deleteEvent(userId: string, eventId: string): Promise<void>;

  /**
   * Restores a soft-deleted event
   * @param userId - The ID of the user restoring the event
   * @param eventId - The UUID of the event to restore
   * @returns Promise that resolves to the restored event
   * @throws EventNotFoundError if event not found
   * @throws PermissionDeniedError if user lacks permission (organizer only)
   */
  restoreEvent(userId: string, eventId: string): Promise<Event>;
}

/**
 * Event Service Implementation
 * Handles event creation, management, and soft delete operations
 */
export class EventService implements IEventService {
  constructor(
    private db: AppDatabase,
    private permissionsService: IPermissionsService,
  ) {}

  /**
   * Creates a new event for a trip
   * Checks permissions and validates date range before creating
   * @param userId - The ID of the user creating the event
   * @param tripId - The ID of the trip
   * @param data - The event creation data
   * @returns The created event
   * @throws TripNotFoundError if trip not found
   * @throws PermissionDeniedError if user lacks permission
   * @throws InvalidDateRangeError if endTime is before startTime
   */
  async createEvent(
    userId: string,
    tripId: string,
    data: CreateEventInput,
  ): Promise<Event> {
    // Check if trip is locked (past end date)
    const isLocked = await this.permissionsService.isTripLocked(tripId);
    if (isLocked) throw new TripLockedError();

    // Check if user can add events to this trip
    const canAdd = await this.permissionsService.canAddEvent(userId, tripId);
    if (!canAdd) {
      // Check if trip exists for better error message - select only id column
      const tripExists = await this.db
        .select({ id: trips.id })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

      if (tripExists.length === 0) {
        throw new TripNotFoundError();
      }

      throw new PermissionDeniedError(
        "Permission denied: only organizers and members with status='going' can add events",
      );
    }

    // Validate date range if endTime is provided
    if (data.endTime) {
      const startTime = new Date(data.startTime);
      const endTime = new Date(data.endTime);
      if (endTime <= startTime) {
        throw new InvalidDateRangeError("End time must be after start time");
      }
    }

    // Check event count limit
    const [eventCount] = await this.db
      .select({ value: count() })
      .from(events)
      .where(and(eq(events.tripId, tripId), isNull(events.deletedAt)));
    if ((eventCount?.value ?? 0) >= 50) {
      throw new EventLimitExceededError("Maximum 50 events per trip reached.");
    }

    // Create the event
    const [event] = await this.db
      .insert(events)
      .values({
        tripId,
        createdBy: userId,
        name: data.name,
        description: data.description || null,
        eventType: data.eventType,
        location: data.location || null,
        meetupLocation: data.meetupLocation || null,
        meetupTime: data.meetupTime ? new Date(data.meetupTime) : null,
        startTime: new Date(data.startTime),
        endTime: data.endTime ? new Date(data.endTime) : null,
        allDay: data.allDay ?? false,
        isOptional: data.isOptional ?? false,
        links: data.links || null,
      })
      .returning();

    if (!event) {
      throw new Error("Failed to create event");
    }

    return event;
  }

  /**
   * Gets an event by ID
   * Returns null if event is soft-deleted
   * @param eventId - The UUID of the event to retrieve
   * @returns The event, or null if not found or soft-deleted
   */
  async getEvent(eventId: string): Promise<Event | null> {
    const result = await this.db
      .select(getTableColumns(events))
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Gets all events for a trip with creator attendance info
   * Excludes soft-deleted events by default
   * Joins with users and members tables to include creator profile and attendance status
   * @param tripId - The UUID of the trip
   * @param includeDeleted - Whether to include soft-deleted events (default: false)
   * @returns Array of events with creatorAttending, creatorName, creatorProfilePhotoUrl
   */
  async getEventsByTrip(
    tripId: string,
    includeDeleted = false,
  ): Promise<
    (Event & {
      creatorAttending: boolean;
      creatorName: string;
      creatorProfilePhotoUrl: string | null;
    })[]
  > {
    const conditions = [eq(events.tripId, tripId)];

    if (!includeDeleted) {
      conditions.push(isNull(events.deletedAt));
    }

    const results = await this.db
      .select({
        event: events,
        creatorDisplayName: users.displayName,
        creatorProfilePhotoUrl: users.profilePhotoUrl,
        creatorMemberStatus: members.status,
      })
      .from(events)
      .leftJoin(users, eq(events.createdBy, users.id))
      // Left join on members because the event creator may have been removed from the trip,
      // in which case their member record no longer exists. A left join ensures the event
      // is still returned with creatorAttending=false when the member record is null.
      .leftJoin(
        members,
        and(
          eq(members.userId, events.createdBy),
          eq(members.tripId, events.tripId),
        ),
      )
      .where(and(...conditions));

    return results.map((r) => ({
      ...r.event,
      creatorAttending: r.creatorMemberStatus === "going",
      creatorName: r.creatorDisplayName ?? "",
      creatorProfilePhotoUrl: r.creatorProfilePhotoUrl,
    }));
  }

  /**
   * Updates an event
   * Checks permissions and validates date range before updating
   * @param userId - The ID of the user updating the event
   * @param eventId - The UUID of the event to update
   * @param data - The event update data
   * @returns The updated event
   * @throws EventNotFoundError if event not found
   * @throws PermissionDeniedError if user lacks permission
   * @throws InvalidDateRangeError if endTime is before startTime
   */
  async updateEvent(
    userId: string,
    eventId: string,
    data: UpdateEventInput,
  ): Promise<Event> {
    // Load existing event first (need tripId for lock check and data for validation)
    const [existingEvent] = await this.db
      .select({
        id: events.id,
        tripId: events.tripId,
        createdBy: events.createdBy,
        startTime: events.startTime,
        endTime: events.endTime,
      })
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .limit(1);

    if (!existingEvent) {
      throw new EventNotFoundError();
    }

    // Check if trip is locked and permissions in parallel (both need tripId which we already have)
    const [isLocked, canEdit] = await Promise.all([
      this.permissionsService.isTripLocked(existingEvent.tripId),
      this.permissionsService.canEditEventWithData(userId, {
        tripId: existingEvent.tripId,
        createdBy: existingEvent.createdBy,
      }),
    ]);
    if (isLocked) throw new TripLockedError();
    if (!canEdit) {
      throw new PermissionDeniedError(
        "Permission denied: only event creator or trip organizers can edit events",
      );
    }

    // Validate date range if both times will be set after update
    const finalStartTime = data.startTime
      ? new Date(data.startTime)
      : existingEvent.startTime;
    const finalEndTime = data.endTime
      ? new Date(data.endTime)
      : existingEvent.endTime;

    if (finalEndTime && finalEndTime <= finalStartTime) {
      throw new InvalidDateRangeError("End time must be after start time");
    }

    // Build update data (Record<string, unknown> needed due to exactOptionalPropertyTypes)
    const updateData: Record<string, unknown> = {
      ...data,
      updatedAt: new Date(),
    };

    // Convert date strings to Date objects if provided
    if (data.startTime) {
      updateData.startTime = new Date(data.startTime);
    }
    if (data.endTime) {
      updateData.endTime = new Date(data.endTime);
    }
    if (data.meetupTime) {
      updateData.meetupTime = new Date(data.meetupTime);
    }

    // Perform update
    const result = await this.db
      .update(events)
      .set(updateData)
      .where(eq(events.id, eventId))
      .returning();

    const updatedEvent = result[0];
    if (!updatedEvent) {
      throw new EventNotFoundError();
    }

    return updatedEvent;
  }

  /**
   * Deletes an event (soft delete - sets deletedAt and deletedBy)
   * @param userId - The ID of the user deleting the event
   * @param eventId - The UUID of the event to delete
   * @returns Promise that resolves when the event is deleted
   * @throws EventNotFoundError if event not found
   * @throws PermissionDeniedError if user lacks permission
   */
  async deleteEvent(userId: string, eventId: string): Promise<void> {
    // Load event to get tripId and createdBy for lock check and permission check
    const [eventRecord] = await this.db
      .select({
        id: events.id,
        tripId: events.tripId,
        createdBy: events.createdBy,
      })
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .limit(1);

    if (!eventRecord) {
      throw new EventNotFoundError();
    }

    // Check if trip is locked and permissions in parallel
    const [isLocked, canDelete] = await Promise.all([
      this.permissionsService.isTripLocked(eventRecord.tripId),
      this.permissionsService.canDeleteEventWithData(userId, {
        tripId: eventRecord.tripId,
        createdBy: eventRecord.createdBy,
      }),
    ]);
    if (isLocked) throw new TripLockedError();
    if (!canDelete) {
      throw new PermissionDeniedError(
        "Permission denied: only event creator or trip organizers can delete events",
      );
    }

    // Perform soft delete
    const result = await this.db
      .update(events)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId))
      .returning();

    if (!result[0]) {
      throw new EventNotFoundError();
    }
  }

  /**
   * Restores a soft-deleted event
   * Only organizers can restore events
   * @param userId - The ID of the user restoring the event
   * @param eventId - The UUID of the event to restore
   * @returns The restored event
   * @throws EventNotFoundError if event not found
   * @throws PermissionDeniedError if user lacks permission (organizer only)
   */
  async restoreEvent(userId: string, eventId: string): Promise<Event> {
    // Load event to get tripId
    const [event] = await this.db
      .select({ id: events.id, tripId: events.tripId })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      throw new EventNotFoundError();
    }

    // Check if user is organizer of the trip
    const isOrganizer = await this.permissionsService.isOrganizer(
      userId,
      event.tripId,
    );
    if (!isOrganizer) {
      throw new PermissionDeniedError(
        "Permission denied: only organizers can restore events",
      );
    }

    // Check event count limit before restoring
    const [eventCount] = await this.db
      .select({ value: count() })
      .from(events)
      .where(and(eq(events.tripId, event.tripId), isNull(events.deletedAt)));
    if ((eventCount?.value ?? 0) >= 50) {
      throw new EventLimitExceededError("Maximum 50 events per trip reached.");
    }

    // Restore event
    const result = await this.db
      .update(events)
      .set({
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId))
      .returning();

    if (!result[0]) {
      throw new EventNotFoundError();
    }

    return result[0];
  }
}
