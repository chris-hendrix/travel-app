---
date: 2026-02-01
topic: Journiful - Collaborative Trip Itinerary Platform PRD (v2)
---

# Journiful - Collaborative Trip Itinerary Platform

## Overview

A collaborative trip planning platform that makes group travel itineraries simple. Organizers create trips, invite members via phone, and accepted members collaboratively build the itinerary together. Perfect for bachelor parties, ski trips, weddings, and any group travel.

## Goals

1. Make group trip planning as simple as possible - collaborative by default
2. Enable accepted members to contribute to the itinerary (travel, meals, activities)
3. Provide a shared source of truth for group trip plans
4. Leverage phone numbers for seamless invitations (SMS-native like Partiful)
5. Focus on itinerary clarity with day-by-day and type-based views
6. Support multi-city trips where location changes during the trip

## Target Users

- **Primary**: Group trip organizers (bachelor/bachelorette parties, destination weddings, ski trips, friend vacations)
- **Secondary**: Event coordinators needing shared itineraries (corporate retreats, family reunions)

## Terminology

| Term              | Definition                                                                  |
| ----------------- | --------------------------------------------------------------------------- |
| **Trip**          | The overall group travel plan (equivalent to "Event" in Partiful)           |
| **Event**         | Individual items in the trip itinerary (flights, dinners, activities, etc.) |
| **Organizer**     | Trip creator and co-organizers (equivalent to "Host" in Partiful)           |
| **Member**        | People invited to/attending the trip (equivalent to "Guest" in Partiful)    |
| **Member Travel** | Individual member arrivals and departures to/from the trip location         |

## Design Considerations

### Multi-City Trips & Location Changes

Trips often involve multiple destinations (e.g., "Paris → Amsterdam → London" or "Miami → Key West → Miami"). Journiful handles this through **Travel events**:

- **Travel events** (flights, trains, drives, ferries, etc.) represent transitions between locations
- The `location` field on Travel events uses arrow notation to show the transition: "Miami → Key West"
- In the day-by-day view, Travel events naturally show when the group is moving to a new location
- The trip's `destination` field represents the primary or overall destination (e.g., "Florida Keys" or "Europe")
- Each event's individual `location` field shows where that specific activity takes place

**Example**: A bachelor party road trip

- Trip destination: "Florida Keys"
- Day 1: Flight to Miami (location: "JFK → MIA")
- Day 1: Dinner in Miami (location: "Miami Beach")
- Day 2: Drive to Key West (location: "Miami → Key West")
- Day 2: Sunset cruise (location: "Key West Marina")
- Day 4: Drive back (location: "Key West → Miami")
- Day 4: Flight home (location: "MIA → JFK")

This approach:

- Works for any trip type (multi-city, road trips, cruises)
- Doesn't require complex trip segmentation
- Leverages existing event types and fields
- Shows location changes naturally in the timeline

## Core User Flows

### 1. User Registration & Authentication

- User selects country code from dropdown (defaults to US +1)
- User enters phone number
- Receives SMS verification code
- Enters code to authenticate
- Sets display name and optional profile photo
- Account created and authenticated

### 2. Trip Creation

- User clicks "Create Trip"
- Enters trip details:
  - Trip name (required)
  - Destination/Location (required)
  - Date range (optional - start and end dates)
  - Preferred timezone (required - defaults to user's local timezone, can be changed to match trip destination)
  - Description (optional - supports line breaks)
  - Cover image (optional)
- User adds co-organizers by phone number (optional)
- Trip is created with unique shareable link
- Creator can send invites via SMS to phone numbers

### 3. Trip Invitation

- Organizer enters phone numbers of invitees
- System sends SMS with trip link and preview
- Invitees receive text: "[Organizer] invited you to [Trip]! [Link]"
- Recipients can also receive link via share functionality

### 4. Member RSVP & Preview

- Invited member clicks trip link (format: `/trips/{uuid}`)
- System verifies user's phone number is in Invitation table
- If not invited, shows "Trip not found" or "You haven't been invited to this trip"
- If invited but not logged in, prompted to authenticate with phone number
- After authentication, member sees **partial preview**:
  - Trip name
  - Destination
  - Date range (if set)
  - Description
  - Organizer names
  - Cover image
  - **Does NOT see**: Itinerary events until they RSVP
- Member selects response:
  - "Going" (accept)
  - "Not Going" (decline)
  - "Maybe" (tentative)
- RSVP is recorded and organizer is notified
- **Only "Going" members can add events to itinerary**

### 5. Viewing Trip Itinerary

- Accepted members (Going status) view full trip itinerary
- When selecting times for events, user chooses timezone display:
  - **Trip's preferred timezone** (default): All dates/times shown in the trip's preferred timezone
  - **Local timezone**: All dates/times converted to user's local timezone
- User can toggle between these timezone views when viewing the itinerary
- Default view: **Day-by-day grouping** organized by date
- Alternative view: **Group by event type** (all Travel together, all Meals together, etc.)
- Each day displays in compact sections:
  - **Accommodation** (if applicable) - where the group is staying
  - **Arrivals** (if any) - members arriving that day
  - **Departures** (if any) - members leaving that day
  - **Events** - activities, meals, and group travel for the day
- Each event displays:
  - Type badge (Travel/Meal/Activity)
  - Event title
  - Date and time (or "All day")
  - Location (if specified)
  - Description
  - Links (if attached)
  - Created by (member name + profile pic)
  - "Optional" badge (if marked as optional)
  - "Member no longer attending" indicator (if creator has changed RSVP to Not Going/Maybe)

### 6. Adding Accommodation

- **Only organizers** can add accommodations
- Organizer clicks "Add Accommodation"
- Enters accommodation details:
  - Name (required) - e.g., "Fontainebleau Miami Beach"
  - Address (optional) - full address, copyable in UI
  - Check-in date (required)
  - Check-out date (optional)
  - Description (optional) - check-in time, room details, confirmation number
  - Links (optional) - booking confirmation, hotel website
- Accommodation is added to the trip
- All accepted members see the accommodation in the day-by-day view
- Accommodations appear in a compact, expandable section at the top of each day

### 7. Adding Member Travel (Individual Arrivals & Departures)

- **Members** can add their own arrival/departure times
- **Organizers** can add member travel for any member
- Member clicks "Add Member Travel" or "Add My Travel Dates"
- **Selection behavior**:
  - Form defaults to current logged-in member
  - Regular members can only add their own travel (member selector disabled)
  - Organizers can select any member when adding member travel
  - Helper text indicates organizer privilege: "As organizer, you can add member travel for any member"
- Enters member travel details:
  - Type: Arrival or Departure
  - Who is traveling (defaults to current user; organizer can select any member)
  - Date (required)
  - **For Arrivals**:
    - Departing from (location, optional) - e.g., "JFK", "New York"
    - Departure time (optional)
    - Arriving at (location, optional) - e.g., "MIA", "Miami"
    - Arrival time (required for arrivals)
  - **For Departures**:
    - Departing from (location, optional) - e.g., "MIA", "Miami"
    - Departure time (required for departures)
    - Arriving at (location, optional) - e.g., "JFK", "New York"
    - Arrival time (optional)
  - Travel method (optional) - flight number, bus line, "driving", etc.
  - Details (optional) - gate, confirmation number, additional notes
  - Links (optional) - check-in links, booking confirmations
- Member travel is added to the trip
- All accepted members see arrivals/departures in compact sections on each day
- Members can have multiple arrivals/departures if joining/leaving at different points

**Note**: The member travel form accommodates various modes (flights, buses, trains, driving). Not all fields need to be filled - e.g., for driving, only departure/arrival locations may be relevant.

### 8. Adding Events to Itinerary

- **Permission required**: Must have "Going" status AND trip setting "Allow members to add events" must be enabled
- If setting is disabled, only organizers can add events
- Members click "Add Event"
- Enters event details:
  - Type (required): Travel / Meal / Activity
    - **Travel events** represent group transportation during the trip (e.g., "Drive to Key West", "Ferry to island")
    - **Meal events** are dining reservations, group meals
    - **Activity events** are tours, excursions, and other itinerary activities
  - Title/Name (required)
  - Date (required - can be start date only or start + end date for multi-day)
  - Time (optional - or check "All day")
    - Start time (required if not all day)
    - End time (optional - for time ranges like "7:30 PM - 9:30 PM")
  - Location (optional)
    - For Travel events, use arrow notation to show transitions (e.g., "Miami → Key West")
  - Description (optional - supports line breaks)
  - Links (optional - URLs for bookings, restaurants, etc.)
  - Mark as "Optional" (checkbox - indicates this activity is skippable)
- Event is added to itinerary
- All accepted members see the new event
- Event creator is displayed on the event

### 9. Editing & Deleting

- **Accommodations**: Only organizers can edit or delete
- **Member Travel**: Members can edit/delete their own; organizers can edit/delete any
- **Events**: Event creator can edit or delete their own events; organizers can edit, delete, or restore any event (including events from members who left)
- **Auto-lock**: Once a trip's end date has passed, no one (including organizers) can add new events
- Editing updates the item for all members
- Deleting removes the item from the itinerary (soft delete - can be restored by organizers)
- Deleted items are not visible to members (only organizers see them in a "Deleted Items" section)
- Deleted items are retained forever (no automatic purging)
- Organizers can restore deleted items from "Deleted Items" section at any time

### 10. Trip Management

- Organizers view member list with RSVP statuses
- Organizers can edit trip details (including timezone)
- Organizers can toggle "Allow members to add events" setting (default: enabled)
  - When enabled: Any "Going" member can add events
  - When disabled: Only organizers can add events
- Organizers can add/remove co-organizers
- Co-organizers have same permissions as creator
- Organizers can remove members from the trip
- Organizers can cancel trip (notifies all members)

### 11. Member Experience

- Members view upcoming trips they're invited to
- Members see trips they've RSVP'd "Going" to with full itinerary
- Members can update their RSVP status
- Members can add their own arrival/departure times
- Members can add events to the itinerary
- Members receive notifications for trip invites and cancellations
- Members can choose to view all dates/times in trip's preferred timezone or their local timezone

### 12. Member Status Changes

- When a member changes from "Going" to "Maybe" or "Not Going":
  - Their events remain in the itinerary
  - Events show "Member no longer attending" indicator next to creator name
  - Member can no longer add new events
  - Member can no longer edit their existing events
  - Organizers can still edit/delete these events
- When a member changes from "Maybe/Not Going" back to "Going":
  - "Member no longer attending" indicator is removed
  - Member can add new events again
  - Member can edit their existing events again

## Acceptance Criteria

### AC1: User Authentication

**Given** a new user wants to create an account
**When** they enter their phone number and verify via SMS code
**Then** they should be authenticated and able to create trips

**Given** an existing user returns to the platform
**When** they enter their phone number and verify via SMS code
**Then** they should be logged into their existing account

**Given** a user enters an invalid phone number
**When** they attempt to send verification code
**Then** they should see an error message "Please enter a valid phone number"

**Given** a user enters an incorrect verification code
**When** they attempt to authenticate
**Then** they should see an error message "Invalid code. Please try again" and be able to request a new code

### AC2: Trip Creation

**Given** an authenticated user wants to create a trip
**When** they complete the trip form with:

- Trip name (3-100 characters)
- Destination (required)
- Optional date range (start and end dates)
- Preferred timezone (defaults to user's local timezone, can be changed)
- Optional description (max 2000 characters, with line breaks preserved)
- Optional cover image (max 5MB, JPG/PNG/WEBP)
  **Then** the trip should be created with a unique shareable link
  **And** the user should be set as the trip organizer
  **And** all dates and times for this trip should be stored in UTC

**Given** an organizer is creating a trip
**When** they add co-organizer phone numbers
**Then** those users should be added as co-organizers with full management permissions

**Given** a user tries to create a trip with a name shorter than 3 characters
**When** they submit the form
**Then** they should see validation error "Trip name must be at least 3 characters"

**Given** a user tries to upload a cover image larger than 5MB
**When** they select the file
**Then** they should see an error "Image must be under 5MB. Please choose a smaller file."

### AC3: Trip Invitation

**Given** an organizer has created a trip
**When** they enter member phone numbers and send invitations
**Then** each invitee should receive an SMS with trip details and link
**And** the link should direct to the trip page

**Given** a user receives a trip invitation link
**When** they click the link without being authenticated
**Then** they should be prompted to log in via phone verification
**And** after authentication, see the trip preview

**Given** an organizer tries to invite more than 25 members to a trip
**When** they attempt to add the 26th member
**Then** they should see an error "Maximum 25 members per trip. Please create a separate trip for additional members."

**Given** SMS delivery fails for an invitation
**When** the system attempts to send
**Then** the organizer should see "Could not send invitation to [phone number]. Please verify the number and try again."
**And** the invitation should be marked as failed (can be resent)

### AC4: Partial Preview for Invited Members

**Given** an invited member views a trip they haven't RSVP'd to
**When** they access the trip page
**Then** they should see:

- Trip name
- Destination
- Date range (if set, displayed in trip's preferred timezone)
- Description
- Organizer names and profile pictures
- Cover image
- RSVP buttons

**And** they should NOT see:

- The itinerary events list
- Event details
- Member list

### AC5: Member RSVP Management

**Given** an authenticated user views a trip they're invited to
**When** they select "Going", "Not Going", or "Maybe"
**Then** their RSVP status should be saved and visible to the organizer
**And** the member count should update accordingly

**Given** a member has already RSVP'd to a trip
**When** they change their RSVP status
**Then** their new status should be saved and the organizer should be notified

**Given** a member RSVPs "Going" for the first time
**When** their RSVP is saved
**Then** they should now see the full trip itinerary
**And** they should be able to add events to the itinerary

**Given** a member with RSVP status "Going" who has created events changes to "Maybe" or "Not Going"
**When** their RSVP is updated
**Then** their events should remain in the itinerary
**And** each of their events should display "Member no longer attending" indicator
**And** they should no longer be able to add new events
**And** they should no longer be able to edit their existing events

**Given** a member changes from "Maybe" or "Not Going" back to "Going"
**When** their RSVP is updated
**Then** the "Member no longer attending" indicator should be removed from their events
**And** they should be able to add new events again
**And** they should be able to edit their existing events again

### AC6: Adding Accommodations

**Given** an organizer wants to add accommodation
**When** they add an accommodation with:

- Name (3-200 characters)
- Address (optional, max 500 characters)
- Check-in date (required)
- Check-out date (optional)
- Description (optional, max 2000 characters)
- Links (optional, max 10 URLs)
  **Then** the accommodation should be added to the trip
  **And** all accepted members should see it in the day-by-day view
  **And** the accommodation should appear in a compact section on relevant days

**Given** a non-organizer tries to add accommodation
**When** they attempt to access the add accommodation form
**Then** they should be prevented with message "Only organizers can add accommodations"

**Given** an accommodation is displayed in collapsed view
**When** a member views it
**Then** it should show name and multi-day indicator (if applicable)
**And** the address should NOT be visible in collapsed view

**Given** an accommodation is expanded
**When** a member clicks on it
**Then** it should show full details including address as a Google Maps link
**And** clicking the address should open Google Maps in a new tab

**Given** a trip has 10 accommodations
**When** an organizer tries to add the 11th accommodation
**Then** they should see an error "Maximum 10 accommodations per trip reached."

### AC7: Adding Member Travel (Individual Arrivals & Departures)

**Given** a member has RSVP'd "Going" to a trip
**When** they access the add member travel form
**Then** the "Who is traveling" field should default to themselves
**And** only organizers should be able to select other members
**And** regular members should see their own avatar selected and disabled

**Given** an organizer accesses the add member travel form
**When** they view the member selection
**Then** they should be able to select any trip member
**And** see helper text "As organizer, you can add member travel for any member"

**Given** a member adds their member travel with:

- Type (Arrival or Departure)
- Who is traveling (defaults to self)
- Date (required)
- For Arrivals: Departing from (optional), Departure time (optional), Arriving at (optional), Arrival time (required)
- For Departures: Departing from (optional), Departure time (required), Arriving at (optional), Arrival time (optional)
- Travel method (optional, max 200 characters) - e.g., "AA 2451", "Greyhound", "Driving"
- Details (optional, max 500 characters) - gate, confirmation, notes
- Links (optional, max 5 URLs)
  **Then** the member travel should be added to the trip
  **And** all accepted members should see it in the arrivals/departures section
  **And** it should appear in a compact, expandable format

**Given** an organizer adds member travel for another member
**When** they select the member and add member travel details
**Then** the member travel should be associated with that member
**And** show who added it ("Added by [organizer name]")

**Given** a member has multiple arrivals and departures
**When** viewing the itinerary
**Then** all their member travel should be displayed on the appropriate days
**And** show in chronological order within each day

**Given** member travel is displayed in collapsed view
**When** a member views it
**Then** it should show icon, member name, time, and basic details in a single line

**Given** member travel is expanded
**When** a member clicks on it
**Then** it should show full member travel details, links, and who added it

**Given** a member tries to add arrival/departure with a date outside the trip date range
**When** they submit the form
**Then** they should see a warning "This date is outside the trip dates. Are you sure?"

**Given** a member adds an arrival without specifying arrival time
**When** they submit the form
**Then** they should see validation error "Arrival time is required for arrivals"

**Given** a member adds a departure without specifying departure time
**When** they submit the form
**Then** they should see validation error "Departure time is required for departures"

### AC8: Adding Events to Itinerary

**Given** a member has RSVP'd "Going" to a trip
**And** the trip setting "Allow members to add events" is enabled
**When** they add an event to the itinerary with:

- Type (Travel/Meal/Activity)
  - Travel = group transportation during trip (e.g., "Drive to Key West")
  - Meal = dining reservations, group meals
  - Activity = tours, excursions, other activities
- Title (3-200 characters)
- Date (with optional end date for multi-day events)
- Optional time or "All day" flag
- Optional location (max 500 characters)
- Optional meetup location (max 200 characters) - where the group meets before the event
- Optional meetup time - when to meet (can be before the event start time)
- Optional description (max 2000 characters)
- Optional links (max 10 URLs)
- Optional "Optional" flag to mark as skippable
  **Then** the event should be added to the trip itinerary
  **And** all accepted members should see the new event
  **And** the event should show who created it

**Given** a member has RSVP'd "Maybe" or "Not Going"
**When** they try to add an event
**Then** they should be prevented from adding events
**And** shown a message "Only members who are attending can add events to the itinerary"

**Given** a member has RSVP'd "Going" but the trip setting "Allow members to add events" is disabled
**When** they try to add an event
**Then** they should be prevented from adding events
**And** shown a message "Only organizers can add events to this trip"

**Given** a trip's end date has passed
**When** anyone (including organizers) tries to add an event
**Then** they should be prevented from adding events
**And** shown a message "Cannot add events to past trips"

**Given** an event is marked as "All day"
**When** displayed in the itinerary
**Then** it should not show a specific time

**Given** an event has both start time and end time
**When** displayed in the itinerary
**Then** it should show the time range (e.g., "7:30 PM - 9:30 PM")

**Given** an event has only a start time (no end time)
**When** displayed in the itinerary
**Then** it should show only the start time (e.g., "7:30 PM")

**Given** an event spans multiple days (multi-day activity)
**When** the event is created with start and end dates
**Then** it should appear once on the start date with a "Multi-day" badge showing the date range
**And** it should NOT be duplicated across each day

**Given** a member adds a Travel event for group transportation
**When** they set the location field with arrow notation (e.g., "Miami → Key West")
**Then** the event should display the full transition in the itinerary
**And** clearly indicate the group is moving to a new location

**Given** a member marks an event as "Optional"
**When** the event is displayed
**Then** it should show an "Optional" badge

**Given** a member tries to add an event with a title shorter than 3 characters
**When** they submit the form
**Then** they should see validation error "Event title must be at least 3 characters"

**Given** a trip has 50 events
**When** a member tries to add the 51st event
**Then** they should see an error "Maximum 50 events per trip reached. Please consolidate or remove old events."

### AC9: Permissions

**Given** an organizer views any accommodation
**When** they access the accommodation options
**Then** they should be able to edit or delete it

**Given** a non-organizer views an accommodation
**When** they access the accommodation
**Then** they should NOT see edit or delete options (view only)

**Given** a member views their own travel (arrival/departure)
**When** they access the travel options
**Then** they should be able to edit or delete it

**Given** an organizer views any member's travel
**When** they access the travel options
**Then** they should be able to edit or delete it

**Given** a member views an event they created (and has "Going" status)
**When** they access the event options
**Then** they should be able to edit or delete the event

**Given** a member views an event they created (but has changed to "Maybe" or "Not Going")
**When** they access the event
**Then** they should NOT see edit or delete options (view only)
**And** the event should display "Member no longer attending" indicator

**Given** a member views an event created by another member
**When** they access the event
**Then** they should NOT see edit or delete options (view only)

**Given** an organizer views any event in the itinerary
**When** they access the event options
**Then** they should be able to edit, delete, or restore the event (regardless of creator or creator's current RSVP status)

**Given** an organizer deletes an accommodation, travel, or event
**When** the deletion is confirmed
**Then** the item should be removed from the itinerary for all members
**And** the item should appear in the organizer's "Deleted Items" section (soft delete)

**Given** an organizer views a deleted item
**When** they access the deleted item
**Then** they should see a "Restore" option to bring it back to the itinerary

### AC10: Itinerary View Modes

**Given** an accepted member views a trip itinerary
**When** the page loads (default view)
**Then** the itinerary should be displayed in **day-by-day grouping**:

- Each day shows compact sections at the top:
  - Accommodation (if applicable for that day)
  - Arrivals (if any members arriving)
  - Departures (if any members leaving)
- Followed by regular events (meals, activities, group travel)
- Events within each day sorted by time
- "All day" events appear first within regular events
- All dates/times displayed in trip's preferred timezone by default
- Event count and location chips only reflect regular events (not accommodations, arrivals, departures)

**Given** a member views an accommodation in the day-by-day view
**When** it is displayed in collapsed state
**Then** it should show name and multi-day indicator only
**And** address should be hidden until expanded

**Given** a member views arrivals or departures in the day-by-day view
**When** they are displayed in collapsed state
**Then** each should show as a single line: icon, member name, time, and basic details

**Given** a member is viewing the day-by-day itinerary
**When** they toggle to "Group by type" view
**Then** items should be reorganized by type:

- All Accommodations together
- All Travel events together (group transportation only)
- All Meal events together
- All Activity events together
- Member Travel (arrivals/departures) remain in day-by-day context (not grouped by type)
- Within each type, sorted by date/time
- All dates/times displayed in selected timezone (trip or local)

**Given** a member is viewing events in trip's preferred timezone
**When** they toggle to "Show in my timezone"
**Then** all dates and times should be converted to and displayed in the member's local timezone
**And** timezone indicator should show "Showing times in your timezone (PST)" or similar

**Given** a member is viewing events in their local timezone
**When** they toggle back to "Show in trip's preferred timezone"
**Then** all dates and times should be displayed in the trip's timezone
**And** timezone indicator should show "Showing times in trip's preferred timezone (EST)" or similar

### AC11: Trip Dashboard

**Given** an authenticated user accesses their dashboard
**When** the page loads
**Then** they should see two sections:

- **Upcoming Trips**: All future trips (organizing or Going status) sorted by date
- **Past Trips**: All trips that have ended, sorted by date (most recent first)

**And** each trip card should display:

- Cover image (if uploaded)
- Trip name
- Destination
- Date range (if set, in trip's preferred timezone)
- Organizer name(s) with profile picture(s)
- "Organizing" badge if user is organizer/co-organizer
- RSVP status (Going/Maybe/Not Going) if user is a member
- Event count (e.g., "12 events planned")
- Click to view trip details

### AC12: Trip Management

**Given** an organizer views their trip
**When** they access the trip management page
**Then** they should see:

- Full member list with RSVP statuses (Going/Not Going/Maybe/No Response)
- Total counts for each RSVP type
- Options to edit trip details (name, destination, dates, timezone, description)
- Options to add/remove co-organizers
- Options to remove members
- Option to cancel trip
- "Deleted Events" section showing soft-deleted events

**Given** a co-organizer accesses a trip they co-organize
**When** they view the trip management page
**Then** they should have the same permissions as the original organizer

**Given** an organizer removes a member from a trip
**When** the removal is confirmed
**Then** the member should be removed from the member list
**And** the removed member should no longer see the trip in their dashboard
**And** events created by that member should remain in the itinerary
**And** those events should display "Member no longer attending" indicator

**Given** an organizer tries to remove the last organizer (themselves) without assigning a new organizer
**When** they attempt the removal
**Then** they should see an error "Cannot remove the last organizer. Please add a co-organizer first or cancel the trip."

### AC13: Trip Updates & Cancellation

**Given** an organizer updates trip details (dates, destination, description, timezone)
**When** they save the changes
**Then** all invited members should receive a notification of the update

**Given** an organizer changes the trip's preferred timezone
**When** they save the change
**Then** all event dates/times should continue to represent the same moment in time (UTC unchanged)
**And** display to all members in the new trip's preferred timezone

**Given** an organizer wants to cancel a trip
**When** they select "Cancel Trip" and confirm
**Then** the trip should be marked as cancelled
**And** all invited members should receive a cancellation notification
**And** the trip should no longer appear in upcoming trips

**Given** a network error occurs while saving trip updates
**When** the save fails
**Then** the user should see "Unable to save changes. Please check your connection and try again."
**And** changes should not be lost (remain in the form)

### AC14: Display Details

**Given** a member views an accommodation in collapsed state
**When** displayed in the itinerary
**Then** they should see:

- Hotel/accommodation name
- Multi-day indicator (if check-out date is set)
- Expand icon

**Given** a member expands an accommodation
**When** the accommodation details are shown
**Then** they should see:

- Description with line breaks preserved
- Address as a clickable Google Maps link with location icon (if provided)
- Links as clickable URLs (if provided)
- Creator name and profile picture ("Added by [name]")
- Edit button (if permitted - organizers only)

**Given** a member views arrivals or departures in collapsed state
**When** displayed in the itinerary
**Then** they should see in a single line:

- Icon (🛬 for arrival, 🛫 for departure)
- Member name
- Time
- Basic details (flight number, location)
- Expand icon

**Given** a member expands arrival/departure
**When** the travel details are shown
**Then** they should see:

- Full flight/travel details with line breaks preserved
- Links as clickable URLs (if provided)
- Creator name and profile picture ("Added by [name]")
- Edit button (if permitted - member themselves or organizers)

**Given** a member views an event in the itinerary
**When** the event is displayed (collapsed view)
**Then** they should see:

- Type badge with color coding (Travel/Meal/Activity)
- Event title
- Date and time in selected timezone (or "All day")
- Location (if provided)
- "Optional" badge if marked as optional
- Expand icon to view full details

**Given** a member expands an event in the itinerary
**When** the event details are shown
**Then** they should additionally see:

- Duration display for multi-day events (e.g., "Oct 10-12")
- Description with line breaks preserved
- Links as clickable URLs (if provided, max 10 displayed)
- Creator name and profile picture ("Added by [name]")
- "Member no longer attending" indicator if creator has changed RSVP status
- Edit button (if permitted)

### AC15: Trip Privacy & Access

**Given** an organizer has created a trip
**When** they access the trip details
**Then** they should see the trip URL in format `/trips/{uuid}`

**Given** a user accesses a trip URL
**And** their phone number is NOT in the Invitation table for this trip
**When** they try to view the trip
**Then** they should see "Trip not found" or "You haven't been invited to this trip"

**Given** an invited user accesses a trip URL
**And** they are authenticated
**When** they view the trip
**Then** they should see the trip preview
**And** after RSVP'ing "Going", see the full itinerary

## Data Validation Requirements

### Trip Constraints

- Trip name: 3-100 characters
- Destination: Required, max 500 characters
- Description: Max 2000 characters
- Cover image: Max 5MB, formats: JPG, PNG, WEBP
- Maximum members per trip: 25
- Maximum accommodations per trip: 10
- Maximum member travel entries per member: 20
- Maximum events per trip: 50
- Trip preferred timezone: Must be a valid IANA timezone identifier

### Accommodation Constraints

- Name: 3-200 characters
- Address: Max 500 characters
- Description: Max 2000 characters
- Links: Max 10 URLs per accommodation, each must be valid HTTP/HTTPS URL
- Check-in date: Required
- Check-out date: Optional, must be >= check-in date if provided

### Member Travel Constraints

- Date: Required
- Departing from: Max 200 characters
- Departure time: Optional for arrivals; required for departures
- Arriving at: Max 200 characters
- Arrival time: Required for arrivals; optional for departures
- Travel method: Max 200 characters
- Details: Max 500 characters
- Links: Max 5 URLs per member travel entry, each must be valid HTTP/HTTPS URL
- Must belong to a valid trip member

### Event Constraints

- Event title: 3-200 characters
- Event description: Max 2000 characters
- Event location: Max 500 characters
- Meetup location: Max 200 characters
- Meetup time: Optional
- Links: Max 10 URLs per event, each must be valid HTTP/HTTPS URL
- Start date: Required
- End date: Optional, must be >= start date if provided
- Start time: Required if not "all day"
- End time: Optional, must be > start time if provided
- Event type: Must be one of: travel, meal, activity

### User Constraints

- Display name: 3-50 characters
- Phone number: Must be valid E.164 format

## Technical Requirements

### Platform

- Web application (responsive, mobile-first design)
- Accessible from any modern browser
- Progressive Web App (PWA) capabilities for mobile

### Authentication

- Phone number as primary identifier
- SMS verification via Twilio or similar
- JWT-based session management
- Secure token storage

### Core Entities

#### User

- id (UUID)
- phone_number (unique, indexed)
- display_name
- profile_photo_url (optional)
- timezone (IANA timezone identifier)
- created_at
- updated_at

#### Trip

- id (UUID)
- name
- destination (text)
- start_date (date, optional)
- end_date (date, optional)
- preferred_timezone (IANA timezone identifier, required)
- description (text, optional - preserves line breaks)
- cover_image_url (optional)
- created_by (user_id)
- allow_members_to_add_events (boolean, default true) - when false, only organizers can add events
- created_at
- updated_at
- cancelled (boolean)

**Note**: Trip URL format is `/trips/{uuid}` where uuid is the trip ID. All trips are private - users must be invited to view.

#### Organizer

- trip_id
- user_id
- added_at

#### Invitation

- id (UUID)
- trip_id
- inviter_id (user_id)
- invitee_phone_number
- status (pending, accepted, declined, failed)
- sent_at
- responded_at (optional)

#### Rsvp

- trip_id
- user_id
- status (going, not_going, maybe)
- updated_at

#### Accommodation

- id (UUID)
- trip_id
- name (text) - e.g., "Fontainebleau Miami Beach"
- address (text, optional) - full address for copying/navigation
- check_in_date (date)
- check_out_date (date, optional)
- description (text, optional - preserves line breaks) - check-in time, room details, confirmation number, etc.
- links (JSON array of URLs, optional, max 10) - booking links, hotel website, etc.
- created_by (user_id)
- deleted_at (timestamp, optional - soft delete)
- deleted_by (user_id, optional)
- created_at
- updated_at

**Note**: Accommodations are separate entities from Events - they represent where the group is staying. Accommodations are trip-level (not per-member) and only organizers can create/edit them.

#### Travel (Individual Arrivals & Departures)

- id (UUID)
- trip_id
- member_id (user_id) - the person arriving/departing
- travel_type (enum: arrival, departure)
- date (date)
- departing_from (text, optional) - departure location, e.g., "JFK", "New York"
- departure_time (time, optional for arrivals; required for departures)
- arriving_at (text, optional) - arrival location, e.g., "MIA", "Miami"
- arrival_time (time, required for arrivals; optional for departures)
- travel_method (text, optional, max 200 characters) - e.g., "AA 2451", "Greyhound Bus", "Driving"
- details (text, optional, max 500 characters) - gate, confirmation number, additional notes
- links (JSON array of URLs, optional, max 5) - check-in links, booking confirmations
- created_by (user_id) - usually same as member_id, but organizers can add for others
- deleted_at (timestamp, optional - soft delete)
- deleted_by (user_id, optional)
- created_at
- updated_at

**Note**: Travel represents individual participation boundaries. A member can have multiple arrivals and departures if joining/leaving the trip at different points. The form accommodates various travel modes (flights, buses, trains, driving) - not all fields need to be filled.

#### Event (Itinerary Activities)

- id (UUID)
- trip_id
- created_by (user_id)
- event_type (enum: travel, meal, activity)
  - **travel**: Group transportation during the trip (e.g., "Drive to Key West", "Ferry to island")
  - **meal**: Dining reservations, group meals
  - **activity**: Activities, tours, excursions, or other itinerary items
- title (text)
- start_date (date)
- end_date (date, optional - for multi-day events)
- start_time (time, optional)
- end_time (time, optional)
- all_day (boolean, default false)
- location (text, optional)
- meetup_location (text, optional, max 200 characters) - where the group meets before the event
- meetup_time (time, optional) - when to meet (can be before event start time)
- description (text, optional - preserves line breaks)
- links (JSON array of URLs, optional, max 10)
- is_optional (boolean, default false - indicates event is optional/skippable)
- deleted_at (timestamp, optional - soft delete)
- deleted_by (user_id, optional)
- created_at
- updated_at

**Note**: Events are visible to all trip members. Use the `is_optional` flag to indicate activities that members can choose to skip.

**Note**: All dates and times are stored in UTC and converted to trip's preferred timezone or user's local timezone for display.

### Key Features

#### SMS Integration

- Send invitation messages with trip details
- Send trip update notifications
- Send cancellation notifications
- Handle opt-out/unsubscribe

#### Trip Management

- CRUD operations for trips
- Co-organizer management
- Member list management
- RSVP tracking
- Timezone management

#### Itinerary Management

- CRUD operations for accommodations (organizer-only)
- CRUD operations for transportation (self or organizer)
- CRUD operations for events (with creator permissions)
- Day-by-day grouping view with compact sections for accommodations, arrivals, departures
- Group by type view
- Multi-day accommodation and event support
- Event type categorization (travel, meal, activity)
- Soft delete with restore capability for all itinerary items

#### Timezone Handling

- Store all dates/times in UTC
- Display in trip's preferred timezone by default
- Allow users to toggle to their local timezone
- Handle timezone conversions for all date/time displays

#### Notifications (MVP Scope)

- SMS notifications for:
  - Trip invitations
  - Trip cancellations
  - RSVP changes (for organizers)
  - Trip updates (date/time/location changes)
- Future: Event additions, event changes

### Security & Privacy

- Phone numbers stored securely (hashed)
- Rate limiting on SMS sends
- All trips are private (not publicly discoverable)
- Trip URL format: `/trips/{uuid}` - must be invited to view
- Access verification: Check user's phone number in Invitation table
- Invited members can only view trip preview until RSVP "Going"
- Permission model:
  - **Accommodations**: Only organizers can add/edit/delete
  - **Transportation**: Members can manage their own; organizers can manage any
  - **Events**: Requires "Going" status AND trip setting "Allow members to add events" enabled; organizers can always add/edit/delete
  - **Past trips**: No one can add new events once trip end date has passed
- Co-organizers have same permissions as creators
- Soft delete allows recovery of accidentally deleted items (retained forever)

### Performance

- Trip page loads in <2 seconds
- RSVP actions complete in <1 second
- Itinerary view renders efficiently with 50+ events
- Support for trips with up to 25 members
- Support for trips with up to 50 events

### Error Handling

Users should see clear, actionable error messages for:

- Invalid phone numbers
- Incorrect verification codes
- SMS delivery failures
- Network connectivity issues
- File upload errors (size, format)
- Validation errors (character limits, required fields)
- Concurrent edit conflicts
- Permission errors

## Out of Scope (Future Enhancements)

### MVP Phase 2 Features

- Search functionality for trips
- Advanced trip filtering tabs (Organizing, Attending, Past)
- Notification center UI
- Rich text formatting in descriptions (bold, bullets, links)
- Social sharing buttons
- Map integration for locations
- Copy address to clipboard
- File uploads for events (PDFs, images, confirmations)
- Per-event RSVP tracking (who's attending which event)
- Event comments/discussion threads
- Configurable notification preferences
- Event reminders
- Link preview metadata (title, image)

### Future Features

- Cost/budget tracking per event
- Split payment calculations
- Comments/chat functionality
- Photo sharing per event or trip
- Calendar integration (export to Google Calendar, iCal)
- Email invitations (in addition to SMS)
- Trip templates (ski trip template, wedding template, etc.)
- Recurring trips
- Polls or voting on event options
- Packing list feature
- Weather integration
- Travel time calculations
- Public trip discovery
- Trip duplication/copying

## Success Metrics

1. **User Engagement**
   - % of invited members who create accounts
   - % of members who RSVP within 24 hours
   - Average time to create a trip
   - Average number of events per trip

2. **Collaboration Metrics**
   - % of trips with multiple event creators (not just organizer)
   - Average number of event contributors per trip
   - % of members who add at least one event

3. **Platform Health**
   - SMS delivery success rate (>95%)
   - Trip creation success rate
   - User retention (return users within 30 days)
   - Error rate (target <1% of user actions)

## Technical Stack Recommendations

### Frontend

- React or Next.js
- Tailwind CSS for styling
- Mobile-first responsive design
- Date picker component for date ranges
- Timezone picker component

### Backend

- Node.js + Express or Python + FastAPI
- PostgreSQL database
- Redis for caching and sessions

### Infrastructure

- Cloud hosting (Vercel, Railway, or AWS)
- Twilio for SMS
- CloudFlare for CDN and DDoS protection
- S3 or similar for image storage

### Third-party Services

- Twilio (SMS)
- SendGrid (email notifications - secondary)
- Sentry (error tracking)
- Analytics (PostHog or Mixpanel)

## Timeline Estimate

This is an MVP scoped for 6-8 week development cycle with a single full-stack engineer.

**Phase 1 (Week 1-2)**: Core auth and trip creation (reuse Partiful base)
**Phase 2 (Week 2-4)**: Invitations, RSVP, and partial preview system
**Phase 3 (Week 4-6)**: Event creation and itinerary management with timezone support
**Phase 4 (Week 6-7)**: View modes (day-by-day, group by type), permissions, and member status handling
**Phase 5 (Week 7-8)**: Testing, error handling, and deployment

## Appendix: User Stories

### Organizer Stories

- As an organizer, I want to create a trip quickly so I can start inviting friends
- As an organizer, I want to add co-organizers so I can share planning responsibilities
- As an organizer, I want to see who's coming so I can plan accordingly
- As an organizer, I want everyone attending to collaborate on the itinerary
- As an organizer, I want to update trip details and notify members of changes
- As an organizer, I want to cancel a trip if plans change
- As an organizer, I want to set the trip's preferred timezone so everyone sees times correctly
- As an organizer, I want to restore accidentally deleted events
- As an organizer, I want to remove members who are no longer coming

### Member Stories

- As a member, I want to see basic trip info before deciding to RSVP
- As a member, I want to RSVP quickly without a complex profile
- As a member, I want to add events to the itinerary once I'm attending
- As a member, I want to see what everyone has planned day-by-day
- As a member, I want to edit events I created if details change
- As a member, I want to see who created each event
- As a member, I want to add links to bookings so everyone has access
- As a member, I want to mark events as optional so people know they can skip
- As a member, I want to view times in my local timezone when traveling
- As a member, I want my events to remain visible even if I change my RSVP to Maybe

### Platform Stories

- As the system, I need to prevent spam by rate-limiting SMS sends
- As the system, I need to ensure only accepted members can add events
- As the system, I need to maintain trip data integrity with co-organizers
- As the system, I need to show partial previews to un-RSVP'd invitees
- As the system, I need to handle timezone conversions accurately
- As the system, I need to show clear error messages when things go wrong

## Key Differences from Partiful

| Feature               | Partiful           | Journiful                                              |
| --------------------- | ------------------ | ---------------------------------------------------- |
| Main entity           | Event (party)      | Trip (group travel)                                  |
| Sub-items             | N/A                | Events (itinerary items)                             |
| Terminology           | Hosts & Guests     | Organizers & Members                                 |
| Collaboration         | Host-only content  | Accepted members add events                          |
| Date structure        | Single date/time   | Optional date range + event dates                    |
| Timezone              | Single timezone    | Trip's preferred timezone + user can toggle to local |
| Content types         | Event details      | Categorized events (Travel/Meal/Activity)            |
| Views                 | Single event view  | Day-by-day + Group by type                           |
| Preview               | Full event details | Partial preview until RSVP                           |
| Member status changes | N/A                | Events persist with indicator when member leaves     |
