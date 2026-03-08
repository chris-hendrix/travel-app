# Trip Components

This directory contains components related to trip display and management.

## TripCard

A card component for displaying trip summaries in list views (e.g., trips page).

### Usage

```tsx
import { TripCard } from "@/components/trip";

function TripList({ trips }: { trips: TripSummary[] }) {
  return (
    <div className="space-y-4">
      {trips.map((trip, index) => (
        <TripCard key={trip.id} trip={trip} index={index} />
      ))}
    </div>
  );
}
```

### Props

- `trip`: Trip summary object with the following structure:
  ```typescript
  {
    id: string;
    name: string;
    destination: string;
    startDate: string | null; // ISO date string (YYYY-MM-DD)
    endDate: string | null; // ISO date string (YYYY-MM-DD)
    coverImageUrl: string | null;
    isOrganizer: boolean;
    rsvpStatus: "going" | "not_going" | "maybe" | "no_response";
    organizerInfo: Array<{
      id: string;
      displayName: string;
      profilePhotoUrl: string | null;
    }>;
    memberCount: number;
    eventCount: number;
  }
  ```
- `index` (optional): Zero-based index for staggered animation delay (100ms per index)

### Features

- **Cover Image**: Displays trip cover image with gradient overlay, or gradient placeholder if null
- **Badges**:
  - "Organizing" badge shown for trips where user is organizer
  - RSVP status badge with color coding (going=emerald, maybe=amber, not_going=slate)
- **Date Display**: Formatted date range with special handling:
  - "Dates TBD" when no dates set
  - "Starts [date]" when only start date
  - "Ends [date]" when only end date
  - "Month DD - DD, YYYY" for same-month trips
  - "Month DD - Month DD, YYYY" for cross-month trips
- **Organizer Avatars**: Stacked avatars (max 3) with white ring borders, initials shown for missing photos
- **Event Count**: Shows count or "No events yet"
- **Navigation**: Entire card is clickable, navigates to `/trips/{id}`
- **Animations**: Fade-in and slide-up with staggered delay based on index
- **Accessibility**: Keyboard navigable (Enter/Space), proper ARIA roles

### Styling

The component uses Tailwind CSS with the following key styles:

- Rounded corners (`rounded-lg`)
- Hover shadow effect
- Active scale-down effect (`motion-safe:active:scale-[0.98]`)
- Playfair Display font for trip names (inline style)

### Testing

Comprehensive test suite covers:

- All prop combinations
- Edge cases (missing data, null values)
- RSVP badge variants
- Date formatting scenarios
- Organizer avatar display (with/without photos)
- Navigation interactions
- Keyboard accessibility
- Animation delays

Run tests: `pnpm test trip-card`

## CreateTripDialog

A dialog component for creating new trips with a two-step form.

### Usage

```tsx
import { CreateTripDialog } from "@/components/trip";

function TripsHeader() {
  return (
    <div>
      <CreateTripDialog />
    </div>
  );
}
```

### Features

- **Two-Step Form**:
  - **Step 1**: Basic trip information (name, destination, dates, timezone)
  - **Step 2**: Optional details (description, cover image upload)
- **Image Upload**: Drag-and-drop or click to upload cover images (JPEG, PNG, WebP, max 5MB)
- **Timezone Selection**: Searchable dropdown with IANA timezone identifiers
- **Date Validation**: Ensures end date is not before start date
- **Optimistic Updates**: Uses TanStack Query mutation for immediate UI feedback
- **Form Validation**: Zod schema validation with inline error messages
- **Loading States**: Disabled inputs and loading spinner during submission

### Props

- None (dialog state managed internally with trigger button)

### Form Fields

**Step 1 (Required):**

- `name` - Trip name (3-100 characters)
- `destination` - Destination (3-500 characters)
- `startDate` - Start date (optional)
- `endDate` - End date (optional)
- `timezone` - Preferred timezone (IANA identifier)

**Step 2 (Optional):**

- `description` - Trip description (max 2000 characters)
- `coverImage` - Cover image file (JPEG/PNG/WebP, max 5MB)

### Styling

- Uses shadcn/ui Dialog, Button, Input, Textarea, Select components
- Two-column layout for dates
- Smooth step transitions
- Responsive design

### Testing

Integration tested via E2E tests in `trip-flow.spec.ts`.

## EditTripDialog

A dialog component for editing existing trips with a tabbed interface.

### Usage

```tsx
import { EditTripDialog } from "@/components/trip";

function TripHeader({ trip }: { trip: Trip }) {
  return (
    <div>
      <EditTripDialog trip={trip} />
    </div>
  );
}
```

### Props

- `trip` - Full trip object to edit

### Features

- **Tabbed Interface**:
  - **Details Tab**: Edit basic trip information (name, destination, dates, timezone, description)
  - **Settings Tab**: Manage permissions and co-organizers
  - **Cover Image Tab**: Upload/replace/delete cover image
- **Permission Management**: Toggle "Allow members to add events" setting
- **Co-Organizer Management**:
  - Add co-organizers by phone number
  - Remove existing co-organizers
  - Cannot remove trip creator
- **Image Management**: Upload, replace, or delete cover images
- **Delete Trip**: Destructive action with confirmation dialog
- **Real-time Updates**: Immediate UI updates via TanStack Query
- **Access Control**: Only accessible by trip organizers

### Tab Details

**Details Tab:**

- Edit name, destination, dates, timezone, description
- Same validation as CreateTripDialog

**Settings Tab:**

- Toggle member event permissions
- Add co-organizer by phone number (E.164 format)
- List of current co-organizers with remove buttons
- Creator badge shown for trip creator

**Cover Image Tab:**

- ImageUpload component for file management
- Delete button for existing images
- Image preview

**Delete Tab:**

- Danger zone with trip deletion
- Confirmation dialog before deletion
- Navigates to trips page after deletion

### Styling

- Uses shadcn/ui Tabs, Dialog, Button, Input components
- Danger theme for delete actions
- Responsive tabbed layout

### Testing

Integration tested via E2E tests in `trip-flow.spec.ts`.

## ImageUpload

A reusable component for uploading images with drag-and-drop support.

### Usage

```tsx
import { ImageUpload } from "@/components/trip";

function CoverImageForm() {
  const [file, setFile] = useState<File | null>(null);

  return (
    <ImageUpload
      onFileSelect={setFile}
      maxSize={5 * 1024 * 1024}
      accept="image/jpeg,image/png,image/webp"
    />
  );
}
```

### Props

- `onFileSelect` - Callback when file is selected (receives `File | null`)
- `maxSize` - Maximum file size in bytes (default: 5MB)
- `accept` - Accepted MIME types (default: `image/jpeg,image/png,image/webp`)
- `className` (optional) - Additional CSS classes

### Features

- **Drag-and-Drop**: Drop zone with visual feedback on drag over
- **Click to Upload**: Click anywhere in the zone to open file picker
- **File Validation**:
  - Size validation with user-friendly error messages
  - MIME type validation
  - Preview selected image
- **Image Preview**: Shows thumbnail of selected image with file name and size
- **Clear Selection**: X button to remove selected file
- **Visual States**: Different styles for idle, drag over, and error states
- **Accessibility**: Keyboard navigation, proper ARIA labels

### Error Handling

- File too large: "File size exceeds 5MB"
- Invalid type: "Invalid file type. Accepted: JPEG, PNG, WebP"
- Upload error displayed inline

### Styling

- Dashed border with hover/drag effects
- Upload icon with instructional text
- Preview thumbnail with metadata
- Red border for error state

### Testing

Unit tested as part of dialog component tests.
