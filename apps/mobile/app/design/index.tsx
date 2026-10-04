/* global __DEV__ */
import { useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Link, Redirect } from "expo-router";
import { AppHeader } from "@/components/ui/AppHeader";
import { ActionBar } from "@/components/ui/ActionBar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TextField } from "@/components/ui/TextField";
import { ChipToggle } from "@/components/ui/ChipToggle";import { RsvpControl } from "@/components/trip/RsvpControl";
import { Segmented } from "@/components/ui/Segmented";
import { Dropdown } from "@/components/ui/Dropdown";
import { SuggestionList } from "@/components/ui/SuggestionList";
import { MapsAttribution } from "@/components/ui/MapsAttribution";
import { DisclosureButton } from "@/components/ui/DisclosureButton";
import { Checkbox, CheckboxLabel } from "@/components/ui/Checkbox";
import { ActionRow } from "@/components/ui/ActionRow";
import { QuietAction } from "@/components/ui/QuietAction";
import { PhoneField } from "@/components/ui/PhoneField";
import { toE164 } from "@/lib/phone";
import { Screen } from "@/components/ui/Screen";
import { Band } from "@/components/ui/Band";
import type { BandTone } from "@/components/ui/bandClasses";
import { BAND_TONES, TOKENS } from "@/lib/palette";
import {
  EVENT_HUES,
  POP_FILL,
  initialsHue,
  type PopHue,
} from "@/lib/eventColors";
import { EVENT_TYPE_LABEL, type EventType } from "@/lib/itinerary";
import { initials } from "@/lib/profile";
import { RuledBlock } from "@/components/ui/RuledBlock";
import { RuledRows } from "@/components/ui/RuledRows";
import { Fact } from "@/components/ui/Fact";
// Aliased: this file's own `Section` is the lab's documentation frame, and
// the product's is the ruled block the frame documents.
import { Section as RuledSection } from "@/components/ui/Section";
import { FieldError } from "@/components/ui/FieldError";
import { InlineAction } from "@/components/ui/InlineAction";
import { ImpersonationBand } from "@/components/ui/ImpersonationBand";
import { InlineError } from "@/components/ui/InlineError";
import { LoadingBlock } from "@/components/ui/LoadingBlock";
import { OfflineBlock } from "@/components/ui/OfflineBlock";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimeField } from "@/components/ui/TimeField";
import type { Selection } from "@/lib/calendar";
import { RSVP_LABEL, type RsvpStatus } from "@/lib/rsvp";
import { formatDateRange } from "@/lib/dateRange";
import { TripCard } from "@/components/trip/TripCard";
import { TripActions } from "@/components/trip/TripActions";
import { RunLocked } from "@/components/trip/RunLocked";
import { InviteCard } from "@/components/trip/InviteCard";
import { EventCard } from "@/components/trip/EventCard";
import { EventRow } from "@/components/trip/EventRow";
import { StayRow } from "@/components/trip/StayRow";
import { Grid } from "@/components/ui/Grid";
import { PhotoCard } from "@/components/ui/PhotoCard";
import { PhotoCredit } from "@/components/ui/PhotoCredit";
import { PlaceholderImage } from "@/components/ui/PlaceholderImage";
import { KINDS, type PlaceholderKind } from "@/lib/placeholder";
import { NotificationRow } from "@/components/notification/NotificationRow";
import { TRIPS } from "@/mocks/trips";
import { eventsFor } from "@/mocks/events";
import { membersFor } from "@/mocks/members";
import { staysFor } from "@/mocks/stays";
import { travelFor } from "@/mocks/travel";
import { NOTIFICATIONS } from "@/mocks/notifications";
import { INVITATIONS } from "@/mocks/invitations";
import { tripFor } from "@/lib/notifications";
import { emailSchema } from "@journiful/shared/schemas";
import { legalDocument } from "@journiful/shared/legal";
import type { LegalDocument } from "@journiful/shared/legal";
import { Prose } from "@/components/ui/Prose";
import { chroma, contrast, dE } from "@/lib/color";
import { GROUNDS } from "@/lib/palette";
import { Column } from "@/components/ui/Column";
// The lab's own documentation frame, and the one section that outgrew the
// page. `Section` here is this file's heading and `Specimen` its exhibit;
// the product's `Section` is aliased below as `RuledSection`, which is why
// this one keeps the plain name on this side of the import.
import { MotionSection } from "./motion";
import { BootCoverSpecimen } from "./bootCover";
import { Section, Specimen, TokenRow, TypeRow } from "./frame";

/** Metro resolving a bare package import and a font actually being the
 *  font are the two things a bundle can fail at silently, and neither
 *  shows up in a test: this is the proof a person can see. */
const SHARED_IMPORT = emailSchema.safeParse("test@example.com").success
  ? "resolved"
  : "failed";

const PRIVACY = legalDocument("privacy");

/**
 * The real document, cut to its opening: preamble, first heading, the
 * list under it. The specimen is here to show the component, not to make
 * anyone scroll a policy inside a page about components — the whole
 * document is one link away, and the copy is never invented for a demo.
 */
/**
 * The sample trip's first event and first stay, for the links below.
 *
 * Derived rather than written down. The mocks lay their dates out
 * relative to today, so an id like `picos-2026-09-19-2` is right on the
 * day it is written and wrong the next one, and a lab link that lands on
 * "that event is not on this trip any more" teaches nobody anything.
 */
const SAMPLE_TRIP = TRIPS[0]!;
const SAMPLE_EVENT = eventsFor(SAMPLE_TRIP)[0]!;
const SAMPLE_STAY = staysFor(SAMPLE_TRIP)[0]!;
const SAMPLE_TRAVEL = travelFor(SAMPLE_TRIP)[0]!;
/**
 * The sample trip's first two roster rows, for the person links below.
 *
 * Derived rather than written down, the same way the event and the
 * stay above are: the mocks build row ids as `${trip.id}-${index}`,
 * so the organizer's own row is `picos-0`. The roster sorts
 * organizer-first, so the first row is the organizer and the second
 * is a guest — which is the distinction Guest detail and Member
 * detail draw. (Every mock row carries `userId: null`, because the
 * lab has no signed-in identity, so both links land on the dialog's
 * guest branch; the pre-existing `?id=picos` wart applies here too.)
 */
const SAMPLE_MEMBER = membersFor(SAMPLE_TRIP)[0]!;
const SAMPLE_GUEST = membersFor(SAMPLE_TRIP)[1]!;

const PROSE_SAMPLE: LegalDocument = {
  ...PRIVACY,
  body: (() => {
    const sections = PRIVACY.body.split(/^\s*## /m);
    return `${sections[0] ?? ""}\n## ${sections[1] ?? ""}`;
  })(),
};

/**
 * The palette, grouped by the role that decides what each token may do.
 *
 * The figures beside each row are **measured, not written down**: they
 * come from `lib/color.ts`, the same module the palette test asserts
 * against, so a row here cannot quote a number that is no longer true.
 * That is the point of this section — gate A approves the *role
 * assignment*, and a role is only defensible beside its chroma and its
 * ratio. `lib/palette.ts` holds the rule and the floors; this is the
 * same list, rendered so a person can disagree with it.
 *
 * Reading a row:
 *   `C` is OKLCh chroma — how loud the colour is. Under 0.09 is a ground.
 *   `ink` is contrast of ink *on* the tone, the audit's own column.
 *   a text tone shows its ratio on gravel instead, the binding ground.
 *   a band shows its dE from sand — under 6 and it reads as one ground.
 */
const inkOn = (hex: string) => `ink ${contrast("#000000", hex).toFixed(2)}:1`;
const loudness = (hex: string) => `C ${chroma(hex).toFixed(3)}`;
const onGravel = (hex: string) =>
  `${contrast(hex, GROUNDS.gravel).toFixed(2)}:1 on gravel`;
const seam = (hex: string) => `dE ${dE(hex, GROUNDS.sand).toFixed(1)} from sand`;
const said = (hex: string, ...parts: string[]) => `${hex} \u00b7 ${parts.join(" \u00b7 ")}`;

const COLORS: Array<[name: string, token: string, detail: string, swatch: string]> = [
  /* Grounds */
  ["Ground \u00b7 sand", "sand", said("#f5eacc", loudness("#f5eacc"), inkOn("#f5eacc")), "bg-sand"],
  ["Ground \u00b7 gravel", "gravel", said("#e2ded5", loudness("#e2ded5"), `${dE("#e2ded5", "#f5eacc").toFixed(1)} dE from sand`), "bg-gravel"],
  ["Ground \u00b7 paper", "paper", said("#ffffff", loudness("#ffffff"), inkOn("#ffffff")), "bg-paper"],
  ["Ground \u00b7 ink", "ink", "#000000 \u00b7 chrome band, text, borders", "bg-ink"],
  /* Marks: chroma >= 0.10, never a ground */
  ["Mark \u00b7 seafoam", "seafoam", said("#42d177", loudness("#42d177"), inkOn("#42d177")), "bg-seafoam"],
  ["Mark \u00b7 watermelon", "watermelon", said("#ef8ad4", loudness("#ef8ad4"), inkOn("#ef8ad4")), "bg-watermelon"],
  ["Mark \u00b7 strawberry", "strawberry", said("#ff6352", loudness("#ff6352"), inkOn("#ff6352")), "bg-strawberry"],
  ["Mark \u00b7 ocean", "ocean", said("#4281ff", loudness("#4281ff"), "fill only, 3.01:1 on sand"), "bg-ocean"],
  ["Mark \u00b7 acid", "acid", said("#cbfb6a", loudness("#cbfb6a"), inkOn("#cbfb6a"), "loudest token"), "bg-acid"],
  /* Text: the deep tier. Ratios are against gravel, the binding ground. */
  ["Text \u00b7 seafoam-deep", "seafoam-deep", said("#1c713b", loudness("#1c713b"), onGravel("#1c713b")), "bg-seafoam-deep"],
  ["Text \u00b7 watermelon-deep", "watermelon-deep", said("#b4198b", loudness("#b4198b"), onGravel("#b4198b")), "bg-watermelon-deep"],
  ["Text \u00b7 strawberry-deep", "strawberry-deep", said("#b8271a", loudness("#b8271a"), onGravel("#b8271a")), "bg-strawberry-deep"],
  ["Text \u00b7 ocean-deep", "ocean-deep", said("#0051f3", loudness("#0051f3"), onGravel("#0051f3")), "bg-ocean-deep"],
  ["Text \u00b7 amethyst-deep", "amethyst-deep", said("#5e5e8b", loudness("#5e5e8b"), onGravel("#5e5e8b")), "bg-amethyst-deep"],
  ["Text \u00b7 baltic-deep", "baltic-deep", said("#1f6c73", loudness("#1f6c73"), onGravel("#1f6c73")), "bg-baltic-deep"],
  ["Text \u00b7 bpink-deep", "bpink-deep", said("#bf0074", loudness("#bf0074"), onGravel("#bf0074")), "bg-bpink-deep"],
  ["Text \u00b7 grey-quiet", "grey-quiet", said("#5f5f5f", loudness("#5f5f5f"), onGravel("#5f5f5f")), "bg-grey-quiet"],
  /* Bands: one at a time, chroma < 0.09, a seam from every ground */
  ["Band \u00b7 lilac", "lilac", said("#E2BFE3", loudness("#E2BFE3"), inkOn("#E2BFE3"), seam("#E2BFE3")), "bg-lilac"],
  ["Band \u00b7 baltic", "baltic", said("#9adee4", loudness("#9adee4"), inkOn("#9adee4"), seam("#9adee4")), "bg-baltic"],
  /* Muted fills: desaturated on purpose */
  ["Muted \u00b7 concrete", "concrete", said("#b0ad9b", loudness("#b0ad9b")), "bg-concrete"],
  ["Muted \u00b7 silver", "silver", said("#b3b3b3", loudness("#b3b3b3")), "bg-silver"],
];

/**
 * The scale, as seven steps.
 *
 * This is the only place the scale exists as a scale. Everywhere else it
 * is 42 call sites carrying one of five `leading` values and seventeen
 * `font-display` sites under the floor, which is why the rollout is
 * invisible in a diff and the scale has to be judged here first.
 *
 * Two faces, split at 28px, and the split is the thing worth arguing
 * about rather than the sizes: `heading-md` is 20px in the **body** face,
 * so the display face never sets anything below `heading-lg` at 28px. If
 * `heading-lg` and `heading-md` look like the same heading on this page,
 * the floor is wrong and the fix is here rather than across 42 sites.
 *
 * Every size is in `px`, never `rem`, and there is no `clamp()`: NativeWind
 * v5 supports `var()`, `calc()`, `env()` and `color-mix()` and nothing
 * else, and its `rem` is 14 on native against 16 on web, so a `rem`+`vw`
 * ramp paints one size in the browser and another on Android — the
 * measure-vs-paint split this repo has already been bitten by (A18).
 * `display-lg` is the one step with a breakpoint jump, the `md:` one it
 * already had.
 */
const TYPE: Array<{
  step: string;
  size: string;
  leading: string;
  tracking: string;
  weight: string;
  face: "display" | "body";
  family: string;
  className: string;
  sample: string;
  use: string;
}> = [
  {
    step: "display-lg",
    size: "60px, 72px at md",
    leading: "0.9",
    tracking: "-0.02em",
    weight: "900",
    face: "display",
    family: "Big Shoulders Display Black",
    className:
      "font-display-black text-[60px] leading-[0.9] tracking-[-0.02em] uppercase md:text-[72px]",
    sample: "Group trips",
    use: "The landing hero, and nothing else. Two words.",
  },
  {
    step: "display-md",
    size: "42px, 48px at md",
    leading: "0.95",
    tracking: "-0.015em",
    weight: "800",
    face: "display",
    family: "Big Shoulders Display ExtraBold",
    className:
      "font-display-extrabold text-[42px] leading-[0.95] tracking-[-0.015em] uppercase md:text-[48px]",
    sample: "Sunset drinks",
    use: "A screen's own title, a trip's name.",
  },
  {
    step: "display-sm",
    size: "32px, 36px at md",
    leading: "1.0",
    tracking: "-0.01em",
    weight: "700",
    face: "display",
    family: "Big Shoulders Display Bold",
    className:
      "font-display-bold text-[32px] leading-[1] tracking-[-0.01em] uppercase md:text-[36px]",
    sample: "Packing list",
    use: "An empty state's headline, a dialog's title.",
  },
  {
    step: "heading-lg",
    size: "28px",
    leading: "1.1",
    tracking: "0",
    weight: "600",
    face: "display",
    family: "Big Shoulders Display SemiBold",
    className:
      "font-display-semibold text-[28px] leading-[1.1] uppercase",
    sample: "Overview",
    use: "A block heading. The display floor, at 28px.",
  },
  {
    step: "heading-md",
    size: "20px",
    leading: "1.15",
    tracking: "0",
    weight: "500",
    face: "body",
    family: "Space Mono Bold",
    className: "font-body-bold text-[20px] leading-[1.15]",
    sample: "What goes in the trip",
    use: "A subheading — the body face, not the display one.",
  },
  {
    step: "body",
    size: "16px",
    leading: "1.5",
    tracking: "0",
    weight: "400",
    face: "body",
    family: "Space Mono",
    className: "font-body text-[16px] leading-[1.5]",
    sample: "Default text, dates and labels.",
    use: "Everything read as prose.",
  },
  {
    step: "label",
    size: "14px",
    leading: "1.4",
    tracking: "+0.02em",
    weight: "700",
    face: "body",
    family: "Space Mono Bold",
    className: "font-body-bold text-[14px] leading-[1.4] tracking-[0.02em]",
    sample: "ROOM SHARE",
    use: "A control's own label, a badge, an eyebrow.",
  },
];

/** The API's nine, as the specimen walks them. */
const EVENT_TYPES = Object.keys(EVENT_TYPE_LABEL) as EventType[];

/** The hex behind a hue, so the specimen prints a measured chroma and not a
 *  claim. Throws rather than returning a default: a hue with no token is a
 *  bug the specimen should not be able to hide. */
function hexOf(hue: PopHue): string {
  const token = TOKENS.find((t) => t.name === hue);
  if (!token) throw new Error(`no token named ${hue}`);
  return token.hex;
}

const VENUES = ["The Hall", "Zone One", "The Rooftop", "The Loft", "Full Venue"];

/**
 * A place picker's rows as the app builds them (lib/queries/places.ts
 * `placePickerRows`): the looked-up answers in the provider's order, then
 * the typed text pinned last. The third row is the typed one, quoted so
 * it reads as your words rather than a result.
 */
const PLACE_ROWS = [
  {
    value: "ChIJKeens123",
    label: "La Bodega",
    secondary: "Carrer de la Mar 14, Sóller",
  },
  {
    value: "ChIJPrunera456",
    label: "Ca'n Prunera",
    secondary: "Carrer de la Lluna 7, Sóller",
  },
  { value: "La Bod", label: '"La Bod"', secondary: "Use what you typed" },
];

/** The credit a place photo carries, as `placePhotoCredit` returns it. */
const PLACE_CREDIT = {
  name: "Marta Riera",
  uri: "https://maps.google.com/maps/contrib/110234567890",
};

const PLACE_PHOTO_SOURCE = "https://maps.google.com/?cid=12345678901234567890";


/**
 * The lab, which exists only in development. In a release build or in the
 * exported web app it answers with the same nothing a mistyped address
 * gets, which is why this is a wrapper rather than a check inside the
 * screen: the screen's hooks must run unconditionally, and the guard
 * needs nothing else. `__DEV__` is compile-time on both targets, so
 * there is no runtime config to forget and no conditional in the layout.
 */
export default function DesignSystem() {
  if (!__DEV__) return <Redirect href="/+not-found" />;
  return <DesignSystemScreen />;
}

function DesignSystemScreen() {
  const [formName, setFormName] = useState("");
  const [code, setCode] = useState("");
  const [venue, setVenue] = useState<string | null>(null);
  const [rsvp, setRsvp] = useState<RsvpStatus | null>(null);
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [units, setUnits] = useState<"c" | "f">("c");
  const [pastEvents, setPastEvents] = useState(false);
  const [range, setRange] = useState<Selection>({
    start: null,
    end: null,
  });
  const [singleDay, setSingleDay] = useState<Selection>({
    start: null,
    end: null,
  });
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [log, setLog] = useState("No interaction yet.");
  const [consent, setConsent] = useState(false);
  const [labPhone, setLabPhone] = useState("");
  const { width } = useWindowDimensions();

  return (
    <Screen>
      <Column>
      <View className="gap-8">
        <View className="gap-1">
          <Text className="font-display-extrabold text-display-md text-ink">
            Design System
          </Text>
          <Text className="font-body text-base text-ink">
            v2 — tokens, primitives, and patterns. Everything below is the
            real component, rendered live.
          </Text>
        </View>

        <Section title="Color">
          <View>
            {COLORS.map(([name, token, detail, swatch]) => (
              <TokenRow
                key={token}
                name={name}
                token={token}
                detail={detail}
                right={<View className={`h-8 w-8 ${swatch}`} />}
              />
            ))}
          </View>
        </Section>

        <Section title="Type">
          <View>
            {TYPE.map((step) => (
              <TypeRow key={step.step} {...step} />
            ))}
          </View>
          <Text className="font-body text-sm text-ink">
            All three families are open licensed (SIL OFL) through Google
            Fonts.
          </Text>
        </Section>


        <Section title="Primitives">
          <View className="gap-4">
            <Specimen
              name="AppHeader"
              contract="title? · onClose? · action? · variant?"
              note="Title mode, shown here. Wordmark mode is the same component with no title, rendered globally above this page. Landing mode is the wordmark alone — no bell, no avatar, no clock, because nobody has signed in yet — and the wordmark stops being a link, because on the landing you are already where it points. The clock beside the title is the ZoneToken, and it is the one control in the band that is sometimes not a control: underlined and pressable while the two clocks read differently, a plain readout the moment they agree, because its only effect is to change the reading and a tap that changes nothing is worse than no tap. It registers itself with the surface that shows the times (lib/displayZone.tsx), which stacks registrations, so covering a screen and coming back restores its zone rather than losing it."
            >
              <AppHeader
                title="Notification settings"
                onClose={() => setLog("AppHeader onClose fired")}
              />
            </Specimen>

            <Specimen
              name="FullscreenDialog"
              contract="title · primaryTitle? · onPrimary? · dangerTitle? · onDanger? · children"
              note="Composes AppHeader and ActionBar into a route. Omit primaryTitle on a read-only dialog — a bar with nothing worth pressing is chrome for its own sake. The destructive action belongs to the scaffold rather than to the form, because its position is the point: the foot of the body, under a rule, as far from the primary button as the dialog allows. It fills the screen by definition, so it cannot be previewed in a frame: open one."
            >
              <Link
                href="/notifications"
                className="font-body-bold text-base text-ink underline"
              >
                Open the notifications dialog
              </Link>
            </Specimen>

            <Specimen
              name="DatePicker"
              contract="selection · onChange · single? · min? · max?"
              note="Range by default: two taps make a trip, endpoints invert to ink, the days between fill seafoam. single picks one day, which is what an event needs and what a leg of travel needs. min/max bound the days that make sense — a trip's own dates for an event inside it, a day past the end for the flight home, since a stay is booked through its last night. Days outside them go gravel and stop responding. Never a nested dialog. The line a caller draws under it is a readout of what is chosen, never an instruction to choose: the calendar already inverts the days that are picked, so `Tap the first day, then the last.` under it was the control repeating itself — and, set in the same black as the error that appears when you submit without one, the reason an empty form read as though it had said nothing at all."
            >
              <DatePicker selection={range} onChange={setRange} />
              {range.start ? (
                <Text className="font-body text-sm text-ink">
                  {formatDateRange(range.start, range.end ?? range.start)}
                </Text>
              ) : null}
              <DatePicker
                selection={singleDay}
                onChange={setSingleDay}
                single
                min={TRIPS[0]!.startDate}
                max={TRIPS[0]!.endDate}
              />
              {singleDay.start ? (
                <Text className="font-body text-sm text-ink">
                  {`Single: ${singleDay.start}`}
                </Text>
              ) : null}
            </Specimen>

            <Specimen
              name="TimeField"
              contract="label · value · onChange · optional? · noneLabel? · anchor? · min? · disabled? · error?"
              note="One row shut — the time and a disclosure — opening the column of slots it has always been, already scrolled to where you are, and closing on the choice. A form with two times is two rows instead of two columns of ninety-six slots. Fifteen-minute steps across the whole day, because a red-eye is as much an event as a dinner. optional puts a No end row at the top, so an event that simply starts is a choice rather than an empty field. anchor is where it opens when nothing is chosen yet and min is the floor — slots before it are shown but set aside — which is what makes an ordered pair read as a pair; both are the caller's, because only the form knows whether its two times are one. An event's are: the schema refuses an end at or before its start, so Ends opens on Starts and cannot go behind it. A stay's and a leg's are not — checking out at 11 is the morning after checking in at 3, and an arrival earlier than its departure is the red-eye — so bounding those would be a bug. With neither prop a field opens on nine rather than on midnight, which is the slot nobody means. Rows read twelve-hour, exactly as the itinerary prints them. The label names the zone the slots are read in, because a field whose meaning depends on a setting says which setting is on."
            >
              <View className="gap-4 md:flex-row">
                <View className="md:flex-1">
                  <TimeField
                    label="Starts"
                    value={startsAt}
                    onChange={setStartsAt}
                  />
                </View>
                <View className="md:flex-1">
                  <TimeField
                    label="Ends"
                    value={endsAt}
                    onChange={setEndsAt}
                    optional
                    anchor={startsAt}
                    min={startsAt}
                  />
                </View>
              </View>
            </Specimen>

            <Specimen
              name="Screen"
              contract="children (and `Column` carries `lead?`)"
              note="The ground for every screen, and nothing else. Navigation containers paint their own background, so a screen must paint its own sand or it renders grey. It used to wrap its children in the constrained column as well; that is `Column`'s job now, and the split is forced by `Band` — a full-bleed tone cannot exist inside a constrained column and the negative-margin workaround is forbidden. Children therefore own their own width, and every screen wraps its content in a `Column`. The vertical rhythm moved with the width rather than staying here: `Column` carries `py-6 md:py-10` and the `lead` variant, and a Column that kept the width and dropped the rhythm would have changed all sixteen call sites — the six `lead` screens would have lost their spacing outright."
            >
              <Screen>
                <Column>
                  <Text className="font-body text-base text-ink">
                    Screen content sits on the sand ground.
                  </Text>
                </Column>
              </Screen>
            </Specimen>

            <Specimen
              name="Section"
              contract="title · rule? · children?"
              note="A titled block, ruled off from the one above it. The rule sits on top of the block rather than under it, so a stack of them shares its rules instead of doubling them at every boundary. It replaced four local copies that had already drifted apart on gap and heading size. The landing's sections are deliberately not this: they are tables of rows closed by a rule underneath, at the hero's own scale. `rule={false}` is for a block whose boundary is already drawn — the first block inside a `Band`, where the band's own edge is the seam — and it drops the rule *and* its padding, because the air above a banded block belongs to the band. Two marks for one boundary is what the rule book forbids \u2014 one rule per boundary, a stack of blocks shares rules rather than doubling them at every seam. A screen that never needs it is the honest case for leaving this specimen behind."
            >
              <RuledSection title="What goes in the trip">
                <Text className="font-body text-base text-ink">
                  Ruled off from whatever sits above it.
                </Text>
              </RuledSection>
            </Specimen>

            <Specimen
              name="RuledBlock"
              contract="title? · rule? · children?"
              note="One rule per boundary. A black rule taken from above is a block boundary: it opens a block, it carries the block's padding and the block's inner gap, and its title is optional because eighteen of the thirty-nine call sites have no title and a rule over one paragraph reads as an accident until something names it. A fourth form was withdrawn from this book and this specimen with it: the page's own hairline, a full-width `h-px` with no title and no padding, for a boundary that closes a multi-column block and opens what is under it. It had exactly one call site, on the trip page, and the hero band's lower seam closed both of that page's columns and changed the ground, so the rule on top of it was a second mark saying one thing. A form the app does not draw is a token with no caller, and the rule book is a list of what the app draws — so it went, and with it the `h-px` guard that was checking it. A `border-gravel` between rows was never a rank at all: it is a row separator inside a block, drawn in the subordinate colour, and that is the fault this book exists to remove. A row read across is a table and takes the soft rule instead; a row read down is a list and takes no mark at all. Below: the real stay screen, where three blocks sat at three different gaps under three hand-written copies of the same rule. `Where` and `Arrival` are the new titles; the check-in block keeps the Fact labels it already had. `rule={false}` is the third form: a block whose boundary is already drawn, so it carries no rule and no padding — the first block inside a `Band`, where the band's edge *is* the seam. Below it is the shape a band uses."
            >
              <RuledBlock title="Where">
                <Text selectable className="font-body text-base text-ink/70">
                  <Text className="font-body-bold text-ink">
                    The Hoxton Shoreditch
                  </Text>{" "}
                  1 Willow St, London
                </Text>
                <QuietAction label="Open in Maps" onPress={() => setLog("RuledBlock: Open in Maps")} />
              </RuledBlock>
              <RuledBlock title="Arrival">
                <Text
                  selectable
                  className="font-body text-base leading-relaxed text-ink"
                >
                  Ring the bell for flat 4. Wifi: hoxton-guest / 4471.
                </Text>
              </RuledBlock>
              {/* Untitled: the form eighteen of the thirty-nine call sites wanted all along. */}
              <RuledBlock>
                <Fact label="Check in">
                  <Text className="font-body text-base text-ink">
                    Fri, Jun 14, 3:00 PM
                  </Text>
                </Fact>
                <Fact label="Check out">
                  <Text className="font-body text-base text-ink">
                    Sun, Jun 16, 11:00 AM
                  </Text>
                </Fact>
              </RuledBlock>
              {/* Unruled: no boundary above it, so no mark and no padding.
                  This is the form the first block inside a band wears. */}
              <RuledBlock title="Already bounded" rule={false}>
                <Text className="font-body text-base text-ink">
                  Nothing above me to be ruled off from.
                </Text>
              </RuledBlock>
            </Specimen>

            <Specimen
              name="RuledRows"
              contract="children — one row per child"
              note="The table rank. The test is the direction the row is read: a row read ACROSS — a name, some accounts, a role — is a table and its rows need to know where one ends, so each keeps a soft rule above it. A row read DOWN is a list, and a list keeps no mark at all; that is why this specimen and the run above do not look alike, and why a list that reads as ungrouped gets more padding rather than a rule. The rule is `border-rule-soft`, the block rule's ink flattened to 40% and pre-flattened into a 6-digit hex so the palette test can measure it against its floor of 2.4 — 2.79:1 on sand, 2.49 on gravel, 3.35 on paper. It cannot be `border-ink/40`, because an eight-digit hex is a value `lib/color.ts` cannot parse, so an alpha rule could not be held to a floor at all. This owns the mark and nothing else: the row body stays with the caller, because a wrapper that owned the row would have to own its columns and its press state too, and would then hide the table-versus-list decision that is the whole reason it exists. It does wrap the rows in a `View`, and that wrapper carries no class at all: it is what stops the container's gap — `gap-5` on the landing's `Section`, `gap-4` on the admin screen, `gap-5` in the roster's dialog body — from falling between rows that already carry their own padding. A wrapper with no padding, no margin and no width cannot inset the measure either."
            >
              <RuledRows>
                <View className="flex-row items-center gap-3 py-3">
                  <Text className="font-body-bold text-base text-ink">
                    Ana Silva
                  </Text>
                  <Text className="font-body text-sm text-grey-quiet">
                    +1 555 0101 · Organizer
                  </Text>
                </View>
                <View className="flex-row items-center gap-3 py-3">
                  <Text className="font-body-bold text-base text-ink">
                    Ben Ortiz
                  </Text>
                  <Text className="font-body text-sm text-grey-quiet">
                    +1 555 0102 · Member
                  </Text>
                </View>
                <View className="flex-row items-center gap-3 py-3">
                  <Text className="font-body-bold text-base text-ink">
                    Cy Nakamura
                  </Text>
                  <Text className="font-body text-sm text-grey-quiet">
                    Member
                  </Text>
                </View>
              </RuledRows>
              <Text className="font-body text-sm text-grey-quiet">
                Three rows, one soft rule each. No rule above the first: a
                table's own opening is the block above it’s boundary.
              </Text>
            </Specimen>

            <Specimen
              name="FieldError"
              contract="message?"
              note="What a field says about what it is missing: under its field, where the field's own helper line sits, and the one line down there that is not ink. That is the whole component. A complaint set in the same black, at the same size, in the same face as the helper sentence above it does not read as a complaint — it reads as a second sentence of the help, which is how a form came to look like it had said nothing. The colour is `strawberry-deep` rather than `strawberry`: the alert at the weight text can be read in. On the dialog's own ground the accent measures 2.19:1, under half of what 14px needs, and this is 4.7:1 in the same hue. Nothing else marks an error, no icon and no border on the field, because a field is wrong in one place and this is it. It also registers itself with the dialog, which scrolls to the first one to appear: the primary button is pinned to the foot and the fields are in the body above it, so a form submitted from a scrolled position put two of its three errors above the viewport with nothing moving to them. No message means no line and no registration, so a caller hands it a validator's `string | undefined` straight through. A field's own complaint, not a request's: a save that failed is a sentence about the request and stays ink, in InlineError below."
            >
              <View className="gap-1">
                <Text className="font-body text-sm text-ink">
                  A field's own helper line, still ink.
                </Text>
                <FieldError message="And its complaint under it, in the alert." />
              </View>
              {/* No message, no line — and no registration either. */}
              <FieldError message={undefined} />
            </Specimen>

            <Specimen
              name="InlineError"
              contract="message · retryTitle? · onRetry?"
              note="A request that failed, where its content would have been. The message is the caller's sentence about what is missing, not the error's: what the fetch threw is for the console. With a way to ask again, because a failure with nowhere to go is a dead end."
            >
              <InlineError
                message="The itinerary could not be loaded."
                onRetry={() => setLog("InlineError asked again")}
              />
            </Specimen>

            <Specimen
              name="LoadingBlock"
              contract="label"
              note="A screen that is getting there says so where its content will be. The line is the point: not a spinner, not a skeleton — a skeleton is a promise about the shape of content the request has not returned yet — and the label is what is arriving, in the product's own voice, the person's verb and the actual thing. Never a bare Loading on its own (a screen that will not say what is late), and never a category noun: Trip details reads as a broken heading while it loads, where Getting your trip reads as waiting. The system has a motion language now — see the Motion section — and this deliberately does not spend it. A load is a state rather than a transition, it happens dozens of times a session, and a line that says what is late is doing the whole job; the motion that a waiting screen does get is the content's own arrival, which is the Motion section's Enters specimen and lives on the gate rather than in here."
            >
              <LoadingBlock label="Getting the run." />
            </Specimen>

            <Specimen
              name="OfflineBlock"
              contract="message? · retryTitle? · onRetry?"
              note="No connection, where the connection's content would have been. Not a banner at the top of the screen, which would be a second header: it sits inside the block that asked, like the error does."
            >
              <OfflineBlock onRetry={() => setLog("OfflineBlock asked again")} />
            </Specimen>

            <Specimen
              name="ActionBar"
              contract="primaryTitle · onPrimary · variant?"
              note="One primary action, no Back: dismissal is the header close control and the platform gesture. Fills the width on a phone, hugs right on wide. `variant` is where the bar lives, and the two differ by one question — does content scroll under it? A `dialog` is yes: the rule marks where the bar begins and the ground is gravel because the dialog is. A `screen` is no, and it keeps the rule for the opposite reason: its ground is sand, which is the page, so without a rule there is nothing marking it as a bar at all rather than the page's last block. Below: a dialog's foot, then a screen's."
            >
              <ActionBar
                primaryTitle="Save changes"
                onPrimary={() => setLog("ActionBar onPrimary fired")}
              />
              <ActionBar
                variant="screen"
                primaryTitle="Create trip"
                onPrimary={() => setLog("ActionBar (screen) fired")}
              />
            </Specimen>

            <Specimen
              name="Button"
              contract="title · variant? · onPress? · fullWidth? · align? · disabled? · trailing? · expanded?"
              note="No two content buttons side by side, at any width: one per row, stacked. A button is a single choice, and putting two in a row makes a choice out of a list — then, at 390, wraps the pair into a ragged 2+1 that reads as a layout accident rather than a decision. Stacked, a button takes the whole row on a phone, where a thumb target beats a tidy box, and from md up drops to its content width on the start edge. Fills the width on a phone; from md up it hugs the edge it is aligned to. disabled keeps it in place rather than hiding it: a control that vanishes leaves nothing to aim at. Inside a row, align='end' is what lines a button up with the field beside it — the default hugs the start of the cross axis and sits high. trailing parks an affordance at the far edge rather than laying it out, so the label stays centred the way every other button's does — DisclosureButton's triangle is its only caller, and the label has to stay short enough not to reach it. expanded announces that the button discloses what is under it, and is left off every button that does not. danger is the alert fill, `strawberry`, shared with the live badge and the unread edge: it is spent only where the press takes something away that cannot be taken back — Delete event, Delete stay, Delete travel, the remove-guest arm, the calendar-link stops, and the trip's own delete on Edit trip."
            >
              <Button
                title="Create trip"
                variant="primary"
                onPress={() => setLog("Button primary fired")}
              />
              <Button
                title="Skip for now"
                variant="secondary"
                onPress={() => setLog("Button secondary fired")}
              />
              <Button
                title="Add to club night"
                variant="accent"
                onPress={() => setLog("Button accent fired")}
              />
              <Button
                title="Autofill"
                variant="secondary"
                disabled
                onPress={() => setLog("unreachable")}
              />
              <Button
                title="Delete trip"
                variant="danger"
                onPress={() => setLog("Button danger fired")}
              />
            </Specimen>

            <Specimen
              name="Badge"
              contract="label · variant · size? · hue?"
              note="Event type and status. Venue renders as plain text beside the pills. `hue` is a pop fill and the label stays ink on it; absent means ink, which is what a state badge always wears. The nine event types below are the whole pop tier as it is actually spent — nine types, four hues, grouped in pairs — each with its measured chroma. The reasoning, and the one decision this set makes, are in `lib/eventColors.ts`."
            >
              <View className="flex-row flex-wrap items-center gap-2">
                <Badge label="club" variant="club" />
                <Badge label="live" variant="live" />
                <Badge label="sold out" variant="soldOut" />
                <Badge label="The Rooftop" variant="venue" />
              </View>
              <View className="gap-2">
                {EVENT_TYPES.map((type) => {
                  const hue = EVENT_HUES[type];
                  return (
                    <View key={type} className="flex-row items-center gap-3">
                      <Badge
                        label={EVENT_TYPE_LABEL[type]}
                        variant="category"
                        hue={hue ?? undefined}
                      />
                      <Text className="font-body text-sm text-ink">
                        {hue
                          ? `${hue} · chroma ${chroma(hexOf(hue)).toFixed(3)}`
                          : "ink — the neutral classifier"}
                      </Text>
                    </View>
                  );
                })}
              </View>
              <View className="flex-row flex-wrap items-center gap-2">
                <Badge label="Outdoors" variant="category" size="sm" />
                <Badge label="Food" variant="category" size="sm" hue="watermelon" />
              </View>
            </Specimen>

            <Specimen
              name="Initials"
              contract="name → hue, and the initials themselves"
              note="A person's block, at the size the three call sites use. The hue is a pure function of the name — stable across sessions and devices, nothing stored — and total, so an empty name or a non-Latin one still lands on a colour rather than on nothing. The four hues are the event table's four: the pop tier is a tier."
            >
              <View className="flex-row flex-wrap gap-3">
                {["Ada Lovelace", "Grace Hopper", "Alan Turing", "李雷", ""].map(
                  (name) => (
                    <View key={name} className="items-center gap-1">
                      <View
                        className={`h-16 w-16 items-center justify-center ${POP_FILL[initialsHue(name)]}`}
                      >
                        <Text className="font-display-bold text-display-sm text-ink">
                          {initials(name) || "??"}
                        </Text>
                      </View>
                      <Text className="font-body text-xs text-ink">
                        {name === "" ? "(empty)" : name} · {initialsHue(name)}
                      </Text>
                    </View>
                  ),
                )}
              </View>
            </Specimen>

            <Specimen
              name="PhotoCard"
              contract="image · overlay? · meta · title · footnote? · onPress?"
              note="The floating tile every card is built from: a 2:1 photo with an optional overlay, then a bold line, a display title, and a bold line. No fill, no border, no shadow, and no reserved height — which is why a card can drop its last line without the grid going wonky. It fills the column it is in and only caps at 420px where the column is wide enough for two tiles and their gap, because a card that stopped short inside a column would disagree with every full-width control beside it."
            >
              <Grid>
                <PhotoCard
                  image={TRIPS[0]!.image}
                  placeholder={<PlaceholderImage kind="trip" />}
                  meta="Sep 24 – Oct 1, 2026"
                  title={TRIPS[0]!.title}
                  footnote={TRIPS[0]!.location}
                  onPress={() => setLog("PhotoCard fired")}
                />
                <PhotoCard
                  image={eventsFor(TRIPS[0]!)[0]!.image}
                  placeholder={
                    <PlaceholderImage kind={eventsFor(TRIPS[0]!)[0]!.type} />
                  }
                  meta="8:30 AM – 9:45 AM"
                  title={eventsFor(TRIPS[0]!)[0]!.name}
                  footnote={eventsFor(TRIPS[0]!)[0]!.place}
                />
              </Grid>
            </Specimen>

            <Specimen
              name="PhotoCredit"
              contract="credit · sourceUri"
              note="What a place photo owes, under the photo: the author's name linked to their profile, and the source link the Places policy requires. 12sp and quiet — this line is owed, not read. Both halves are the point, and the component takes both rather than refusing a pair: a credit with no link fails the policy the same way a link with no credit does, so either may stand alone and neither is invented. Tiles render nothing here on purpose, because every tile taps through to a detail view that carries this line — the policy's thumbnail exemption. That is the one condition the exemption rests on, so if a tile ever becomes the only place its photo appears, the credit has to move onto the tile and the exemption is gone."
            >
              <PhotoCredit
                credit={PLACE_CREDIT}
                sourceUri={PLACE_PHOTO_SOURCE}
              />
              <PhotoCredit credit={PLACE_CREDIT} sourceUri={null} />
              <PhotoCredit credit={null} sourceUri={PLACE_PHOTO_SOURCE} />
            </Specimen>

            <Specimen
              name="PlaceholderImage"
              contract="kind · fills its parent box"
              note="What a place looks like when nobody has a photo of it. The fallback says which kind of thing it is, not which place: the nine event types and a trip cover. Stock, not drawn, and no source link, because there is no source."
            >
              <View className="flex-row flex-wrap gap-3">
                {(Object.keys(KINDS) as PlaceholderKind[]).map((kind) => (
                  <View key={kind} className="w-36 gap-1">
                    <Text className="font-body text-sm text-ink">{kind}</Text>
                    <View className="aspect-[2/1] w-36">
                      <PlaceholderImage kind={kind} />
                    </View>
                  </View>
                ))}
              </View>
            </Specimen>

            <Specimen
              name="ChipToggle"
              contract="label · selected? · onPress"
              note="A filter you can press: a box, filled ink when on and outlined when off. For switches you turn on and off (All day in the event dialog, On/Off in Trip settings), never for a choice among options — that is `Segmented`, whose cells are joined and which holds one value out of a few. A row holding a filter and a choice puts them at the two edges rather than shoulder to shoulder, so they never read as one set. This specimen used to describe a Past events chip on the itinerary's head, which was the one place the two met; that control is gone, so the pair below is the illustration rather than a screen anyone can reach."
            >
              <View className="flex-row items-center gap-3">
                <ChipToggle
                  label="Unread only"
                  selected={pastEvents}
                  onPress={() => {
                    setPastEvents(!pastEvents);
                    setLog(`ChipToggle "Unread only" ${!pastEvents ? "on" : "off"}`);
                  }}
                />
                <ChipToggle
                  label="Nearby"
                  onPress={() => setLog("ChipToggle \"Nearby\" pressed")}
                />
              </View>
            </Specimen>

            <Specimen
              name="Segmented"
              contract="options (value · label · tone? · mark?) · value (nullable) · onChange · size? · width?"
              note="One choice out of a few, all of them visible. Bordered cells in a row rather than bare words: a word with no box and no underline is a label, not something a thumb can be asked to press, and every control in this system is a box. The cells are button-sized — the same p-4 and text-sm as a button, so a row of these sits in a stack of buttons without a step — and ink rather than a colour, because choosing a direction is not an action: the calendar and the time column already invert what is chosen, and two coloured toggles left the form's one real button looking like one of them. tone is for answers that carry a meaning of their own, which the RSVP has; mark is a short mark after the label, drawn in the label's own colour, for a choice with something to say about itself (travel puts a tick against a direction already filed). value is nullable because having chosen nothing yet is a real state rather than an error — and an always-set value wears the same cells (the profile's temperature), because a control that looks different depending on whether a value has been chosen yet would be two controls for one idea. width says how far the row reaches on a wide screen: fill, the default, splits the block between its cells, which is what makes three RSVP cells read as one control; content keeps the cells at their labels' width from md up for a short pair like the units toggle, on a phone being the same thing. size='sm' is a chrome row's switch, the same box as a chip, and always hugs."
            >
              <RsvpControl
                value={rsvp ?? "no_response"}
                onChange={(status) => {
                  setRsvp(status);
                  setLog(`RSVP "${RSVP_LABEL[status]}"`);
                }}
              />
              {/* width="content": the short pair. Judge it at 1280, where
                  the fill default above is wrong and this is not. */}
              <Segmented
                width="content"
                options={[
                  { value: "c", label: "°C" },
                  { value: "f", label: "°F" },
                ]}
                value={units}
                onChange={(next) => {
                  setUnits(next);
                  setLog(`Segmented units "${next}"`);
                }}
              />
              {/* size="sm": a chrome row's switch, the same box as a chip. */}
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Segmented
                    size="sm"
                    options={[
                      { value: "list", label: "List" },
                      { value: "grid", label: "Grid" },
                    ]}
                    value={layout}
                    onChange={(next) => {
                      setLayout(next);
                      setLog(`Segmented "${next}"`);
                    }}
                  />
                </View>
                <ChipToggle
                  label="Unread only"
                  selected={pastEvents}
                  onPress={() => {
                    setPastEvents(!pastEvents);
                    setLog(`ChipToggle "Unread only" ${!pastEvents ? "on" : "off"}`);
                  }}
                />
              </View>
            </Specimen>

            <Specimen
              name="TextField"
              contract="label · value · onChangeText · placeholder? · error? · multiline? · numberOfLines? · suffix? · keyboardType? · centered? · autoFocus? · maxLength? · autoComplete? · textContentType?"
              note="Every dialog that collects input uses this. Errors sit under the field, never in a toast, and they are FieldError's — the alert, not ink. suffix draws a control that acts on the field inside the field's own box — the Autofill button on a flight number is one — because two separately padded controls only line up until a font metric moves; stretching them inside one box cannot drift. centered is the one-short-value shape: six digits of a code, centred and tracked, which is not a size but a shape. autoComplete and textContentType are the platform's own fill, a phone number or a code that just arrived by text, and they are worth more than any styling here because typing six digits correctly is the one thing a thumb is bad at. autoFocus is for the one field the reader came to fill in. A centred field hides the caret Android parks against the box's right edge and blinks its own in the middle instead, at Android's own 500ms, so an empty field reads as focused rather than full; the platform's caret takes over with the first digit."
            >
              <TextField
                label="Display name"
                value={formName}
                onChangeText={setFormName}
                placeholder="Ada Lovelace"
              />
              <TextField
                label="Phone"
                value="+1 555"
                onChangeText={() => setLog("TextField onChangeText fired")}
                error="Enter the full 10-digit number."
              />
              <TextField
                label="Flight number"
                value={formName}
                onChangeText={setFormName}
                placeholder="UA 1842"
                suffix={
                  <Pressable
                    className="justify-center border-l border-ink px-4"
                    onPress={() => setLog("suffix pressed")}
                  >
                    <Text className="font-body-bold text-sm text-ink">
                      Autofill
                    </Text>
                  </Pressable>
                }
              />
              {/* The shape `centered` names, which the contract promised and
                  this page never showed: empty, so the caret behaviour is the
                  one the code screen has. */}
              <TextField
                label="Code"
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                centered
                maxLength={6}
                keyboardType="number-pad"
              />
            </Specimen>

            <Specimen
              name="PhoneField"
              contract="value · onChangeText · error? · autoFocus?"
              note="A number, parsed properly: the metadata is every country, so a leading + overrides the home country and the app takes the same numbers the web does. Type anything here and watch the E.164 underneath. One field for the whole app now: the invite dialog and the sign-in screen both use it, which they did not before, and a number that can sign up can therefore also be invited."
            >
              <PhoneField value={labPhone} onChangeText={setLabPhone} />
              <Text className="font-body text-sm text-ink">
                {toE164(labPhone) ?? "Not a number yet"}
              </Text>
            </Specimen>

            <Specimen
              name="Checkbox"
              contract="checked · onToggle · disabled? · children"
              note="Consent, which is not a filter: ChipToggle says show me these ones, this says I have read this. The whole row is the target rather than the box, since a twenty-pixel square is not something a thumb can be asked to hit, and the tick is drawn rather than implied by the fill, because an inked square on its own reads as a badge. It gates the sign-in button: a control rather than a sentence, because the carriers ask for one, and Twilio rejects a campaign whose form has no separate consent control (30925)."
            >
              <Checkbox
                checked={consent}
                onToggle={() => {
                  setConsent(!consent);
                  setLog(`Consent ${!consent ? "given" : "withdrawn"}`);
                }}
              >
                <CheckboxLabel>
                  I agree to receive text messages from Journiful, including
                  trip updates and verification codes. Message and data rates
                  may apply. Reply STOP to opt out.
                </CheckboxLabel>
              </Checkbox>
            </Specimen>

            <Specimen
              name="ActionRow"
              contract="children"
              note="The foot of a form: its one button, and the quiet words that go with it. Stacked on a phone, one row from md up. The button comes first, which is the opposite of the desktop habit of putting the secondary action on the left, because a content button hugs the start edge to line up with the fields above it and anything sharing its row has to come after it. Not ActionBar, which is a dialog's pinned bar and holds one action only."
            >
              <ActionRow>
                <Button
                  title="Save changes"
                  onPress={() => setLog("ActionRow button fired")}
                />
                <QuietAction
                  label="Back"
                  align="center"
                  onPress={() => setLog("ActionRow quiet action fired")}
                />
              </ActionRow>
            </Specimen>

            <Specimen
              name="QuietAction"
              contract="label · onPress · align?"
              note="A secondary action: an underlined word, no box. The system carries one loud button per screen and everything else steps back, so the quieter things — the roll-call doors, Read more, the calendar's Unsubscribe and Reset, the way out of a dialog — are words rather than controls. Underlined, because a word with no affordance is a word. Its target is a 44pt box grown by padding, the way every other target here reaches the floor: it used to be the word's own ~20pt line, which was the one place the rule was not kept. align='center' is for a word sharing a row with a button, where it wants the button's centre line rather than the row's start edge. Not InlineAction, which is boxless on purpose: that one sits inside a sentence, where a box would break the paragraph, and a word in a row of its own is not in a sentence."
            >
              <QuietAction
                label="Unsubscribe"
                onPress={() => setLog("QuietAction fired")}
              />
              <QuietAction
                label="Reset calendar link"
                onPress={() => setLog("QuietAction fired")}
              />
              <ActionRow>
                <Button
                  title="Save changes"
                  onPress={() => setLog("QuietAction row button fired")}
                />
                <QuietAction
                  label="Back"
                  align="center"
                  onPress={() => setLog("QuietAction fired")}
                />
              </ActionRow>
            </Specimen>

            <Specimen
              name="Dropdown"
              contract="label · options · value · onChange · placeholder? · error? · freeText? · onSearchText? · liveOptions? · attribution?"
              note="Single-select with autocomplete. The list expands inline — never a nested dialog. Stands in for Google Places. An option is a string when its value reads well and a value-and-label pair when it does not, so a day can say Today · Fri Sep 19 while committing an ISO date. With freeText, typing is itself an answer: a suggestion machine rather than a menu, which is how a place gets entered when Places has never heard of it. A live picker hands the field its own rows instead of a static list: liveOptions skips the local substring filter, which would otherwise hide an answer whose label does not contain the raw keystrokes — the provider renames the row as you type, so the row you are looking at can stop matching the string that found it — and onSearchText takes every keystroke for the query while committing nothing. attribution renders MapsAttribution under the rows, which is not optional on a Places-backed field."
            >
              <Dropdown
                label="Venue"
                options={VENUES}
                value={venue}
                onChange={(v) => {
                  setVenue(v);
                  setLog(`Dropdown committed "${v}"`);
                }}
                placeholder="Type to filter venues…"
              />
            </Specimen>

            <Specimen
              name="SuggestionList"
              contract="suggestions · empty · onPick · footer?"
              note="The rows under a field that autocompletes — a place, or a person to invite. Those two callers had drifted into two nearly identical lists, each with its own idea of what a row looks like; what they share is the whole of the look, so it lives here, and each caller keeps only what is truly its own: whether a pick is a value or an addition. It takes its place in the flow rather than floating over what follows. Floating would need a relative z-10 on whichever section happens to hold the field — a rule that was missed twice, and that fails silently, because the list is simply crossed by the prose below it — and an absolutely positioned child is also clipped inside a scroll view on Android. The cost is that the form moves down when the list opens, so the height is capped at five rows: a jump that is always the same size is one the eye can follow, and one that grows with the number of matches is not. Each row is a button named by its primary line alone, never name-and-address together, because the second line is visible detail rather than identity."
            >
              <SuggestionList
                suggestions={PLACE_ROWS}
                empty="No matches. Use what you typed."
                onPick={(v) => setLog(`SuggestionList committed "${v}"`)}
                footer={<MapsAttribution />}
              />
            </Specimen>

            <Specimen
              name="MapsAttribution"
              contract="—"
              note="The Google Maps mark under a picker's rows, and the reason a Places-backed field is not finished without it: the terms require the attribution wherever the content appears. Never localized — it is a mark, not a phrase, so it stays in English whatever the device is set to. On the web export it also carries translate=&quot;no&quot;, so browser translation cannot alter it; React Native's Text has no such prop, so it is set on the web branch only, because passing it unconditionally would be silently dropped on native and would read as though native were covered too."
            >
              <MapsAttribution />
            </Specimen>

            <Specimen
              name="DisclosureButton"
              contract="title · actions · defaultOpen?"
              note="A button that opens onto a list of actions, in the flow. One trigger — label at the near edge, filled triangle at the far one — and the rows it opens sit directly under it at the same width: nothing floating, no panel, no card drawn around the group. The actions are rows rather than boxes, and that is the second pass at this. As a stack of full-width buttons it was six equal weights with no hierarchy, and a box drawn inside a box is a panel, which is exactly what this app's own dropdown looks like. The + is why a row is not just a word: the system has twice concluded that a bare label on this screen reads as prose rather than as something to press (profile.tsx on the temperature cells, TripActions on the itinerary head), and the mark is what makes it an action. The rule under each row is the app's own list language: a rule, not a card. The trigger is the only box and its rows are ruled lines, and that is what keeps the trigger from dissolving into what it opened; it is deliberately not filled, because a trigger reveals rather than finishes a job and every other disclosure in this app is unfilled. The rule this component sits under is the disclosure rule, and it is the whole of what this specimen is: a route for content, this component for verbs, a value picker for a value, and truncation for long copy. Disclosure is a route or a verb list, never content. Content gets a route because content opened in place pushes the page under it and is gone the moment the row is pressed again; a value gets a picker because a value is chosen rather than read, and it is short enough to say on the row; long copy gets truncated, because otherwise somebody opens a disclosure to find out whether there is anything in it. What is left is verbs, and the form that stood here before — ruled, nested, and opening onto content — had no caller for as long as it existed, because the content it was built to hide is a route. Not a dropdown either: nothing floats, and the page below moves down when it opens, which is the trade Dropdown and SuggestionList already made."
            >
              <DisclosureButton
                title="Trip actions"
                defaultOpen
                actions={[
                  {
                    title: "Invite people",
                    onPress: () => setLog("DisclosureButton row fired"),
                  },
                  {
                    title: "Add event",
                    onPress: () => setLog("DisclosureButton row fired"),
                  },
                  {
                    title: "Add stay",
                    onPress: () => setLog("DisclosureButton row fired"),
                  },
                  {
                    title: "Edit trip",
                    onPress: () => setLog("DisclosureButton row fired"),
                  },
                  {
                    title: "Trip settings",
                    onPress: () => setLog("DisclosureButton row fired"),
                  },
                ]}
              />
              <DisclosureButton
                title="Trip actions"
                actions={[
                  {
                    title: "Add event",
                    onPress: () => setLog("DisclosureButton row fired"),
                  },
                ]}
              />
            </Specimen>

            <View className="border border-ink bg-paper p-4">
              <Text className="font-body-bold text-base text-ink">Events</Text>
              <Text className="font-body text-sm text-ink">{log}</Text>
            </View>

            <Specimen
              name="InlineAction"
              contract="label · onPress"
              note="One action as a word inside a sentence: pressed, not followed. Inline by necessity — an empty state says what is missing in a sentence, and the way out of that state belongs in the same sentence; lifted into a row of controls it becomes the toolbar the sentence replaced, and a row of underlined words is a toolbar. Bold and underlined, `QuietAction`'s two marks, because both are words the system asks a thumb to press and neither has a box to say so; no colour, because a colour in this palette is a role and a word mid-sentence is doing neither job. The target is the line it sits in rather than a 44pt box — inside a 16pt paragraph padding would push the line apart — which is a deliberate deviation from the target-size rule, and the reason labels want to stay to two words. `Prose`'s links are this component; the weight had drifted between the two callers and nothing had said they should."
            >
              <Text className="font-body text-base text-ink">
                Nothing planned yet. Add{" "}
                <InlineAction
                  label="a stay"
                  onPress={() => setLog("InlineAction a stay pressed")}
                />{" "}
                or{" "}
                <InlineAction
                  label="an event"
                  onPress={() => setLog("InlineAction an event pressed")}
                />{" "}
                to get started.
              </Text>
            </Specimen>

            <Specimen
              name="ImpersonationBand"
              contract="displayName · onStop · pending — a band that names whose session you are in; renders nothing when you are yourself"
              note="The way out is a separate word with its own 44pt box, not a bare word in the sentence. InlineAction is the boxless one — its target is the line rather than 44pt — which is fine inside a sentence and not fine here, where this is the only control; QuietAction has a 44pt box of its own since the floor was applied to it. While the swap is in flight the word reads Stopping… and the control is disabled, so a second tap cannot stack two swaps."
            >
              <ImpersonationBand
                displayName="Ada Lovelace"
                onStop={() => setLog("ImpersonationBand stop pressed")}
                pending={false}
              />
              <ImpersonationBand
                displayName="Ada Lovelace"
                onStop={() => setLog("unreachable")}
                pending
              />
            </Specimen>

            <Specimen
              name="Prose"
              contract="document: LegalDocument · onLink?"
              note="Long-form copy. The documents are stored as Markdown — the thing a person reads, edits and proofs against the published page — and this is the only component in the system that turns it into type. Headings take the display face, because a heading is a short string; the body takes the body face at a size that survives a screenful of it; links are `InlineAction`, so they carry the same two marks as every other pressable word with no box to say so, and stay in ink because colour here is a role. The excerpt below is the real Privacy Policy, cut to its opening."
            >
              <Prose
                document={PROSE_SAMPLE}
                onLink={(href) => setLog(`Prose link "${href}" pressed`)}
              />
              <Link
                href="/privacy"
                className="font-body-bold text-base text-ink underline"
              >
                Open the Privacy Policy
              </Link>
            </Specimen>
          </View>
        </Section>

        <Section title="Patterns">
          <Text className="font-body text-base text-ink">
            Product-level compositions built from primitives. One folder per
            domain.
          </Text>
          <View className="gap-4">
            <Specimen
              name="Button stack"
              contract="no new props: a stack of Buttons, never a row of them"
              note="The rule the Button's own note states, shown rather than described. Two Buttons, one under the other, with no wrapper: on a phone each fills the width, and from md up each drops to its content width and sits on the start edge, leaving the rest of the column empty on purpose — a short label in a half-column box is a bigger target than it needs to be, and a button stretched to half the column reads as a panel rather than a control. These are the /profile calendar pair with the third, the state a write in flight puts a button in. Two of the three that phase touched are here; the third is the field-and-submit row, which is a field and its own button and is deliberately not a stack."
            >
              <View className="gap-3">
                <Button
                  title="Subscribe in Google Calendar"
                  variant="secondary"
                  onPress={() => setLog("Button stack: Google fired")}
                />
                <Button
                  title="Subscribe in Apple Calendar"
                  variant="secondary"
                  onPress={() => setLog("Button stack: Apple fired")}
                />
                <Button
                  title="Opening Google Calendar"
                  variant="secondary"
                  disabled
                  onPress={() => setLog("unreachable")}
                />
              </View>
            </Specimen>

            <Specimen
              name="Underline"
              contract="no primitive: a mark, and the rule that says where it goes"
              note="The system's only affordance for a word that does something, and there is one rule behind all of them: **an underline means this navigates or presses and has no box.** If it is a place you can go, underline it; if it is a claim, a fact or a debt, leave it plain. Nothing else in the palette means 'pressable' — no colour marks a word, deliberately, because a colour is a role and a word inside a sentence is doing neither. Below are the three kinds side by side at the sizes they are actually set at, because the mark's weight is judged against the type rather than on its own. The credit line and the quiet action each pin their own size and cannot be set at another — the credit is text-xs because it is owed rather than read, the quiet action is text-sm because every control in this system is one size — so the three-step column is the body link alone. Note the exception, which is the debatable one: the photographer's name is a link with its own press, and under this rule it would be underlined. It is a credit first, so it is the one underline this system takes back; `View on Google Maps` beside it is explicit navigation with its own label, so it keeps its mark. One gate, one question: does a name you can tap deserve the same mark as a link you were told to follow? The metric half of this — how thick, how far below — is a web-export-only change and will show on no Android build (A10)."
            >
              <View className="gap-1">
                <Text className="font-body-bold text-sm text-ink">
                  A credit. Owed, not read — text-xs.
                </Text>
                <PhotoCredit
                  credit={{ name: "Ana Ruiz", uri: "https://www.instagram.com/anaruiz/" }}
                  sourceUri="https://maps.google.com/?cid=52,0"
                />
              </View>
              <View className="gap-1">
                <Text className="font-body-bold text-sm text-ink">
                  A link. Named as navigation — the three sizes.
                </Text>
                <Link
                  href="/privacy"
                  className="font-body text-xs text-ink underline"
                >
                  Read the privacy policy (text-xs)
                </Link>
                <Link
                  href="/privacy"
                  className="font-body text-sm text-ink underline"
                >
                  Read the privacy policy (text-sm)
                </Link>
                <Link href="/privacy" className="font-body text-base text-ink underline">
                  Read the privacy policy (text-base)
                </Link>
              </View>
              <View className="gap-1">
                <Text className="font-body-bold text-sm text-ink">
                  A quiet action. Pressed, not followed — text-sm.
                </Text>
                <QuietAction label="Read more" onPress={() => setLog("Underline: Read more")} />
              </View>
            </Specimen>

            <Specimen
              name="TripCard"
              contract="trip: { title, startDate, endDate, location, image } · onPress? · today?"
              note="Upcoming trips carry a countdown on the photo; finished trips say nothing. Locations hug the title. Press one: the tile is the target and the press is its whole affordance, on both surfaces. It used to zoom under a pointer instead, on the web export and only from md up — which meant the tile did nothing at all on the platform the app is for, and a pointer fires a press like a thumb does, so the same scale reaches a mouse and there is one behaviour to keep right rather than two."
            >
              <Grid>
                {TRIPS.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    onPress={() => setLog(`TripCard "${trip.title}" fired`)}
                  />
                ))}
              </Grid>
            </Specimen>

            <Specimen
              name="TripActions"
              contract="tripId · organizer · travelOwed · memberId? · ask?"
              note="The trip page's verbs in one block: the ask, and one trigger onto everything else. One loud control and only one, and it is an action rather than a container — the organizer is asked to bring people in, everyone else answers their own RSVP, which is why ask arrives as a node. The trigger sits under it in the same place for both roles and only its rows are keyed by role: the organizer gets Add event, Add stay, Add travel while somebody owes a time, and Edit trip; a traveler gets their own Add travel while they owe one. Both then get Trip settings last, which is where the trip's own rows and your own settings are told apart — a rule between them was tried and taken out, because the list is short and a line inside it competed with the rules the rows already carry. The invitation was a row inside the trigger for a while, on the argument that a shut box holding everything is the calmest page; it is a filled box again, because the fill marks the control that finishes a job and a container that reveals is not one. First the organizer's block, then a traveler's."
            >
              <TripActions
                tripId={SAMPLE_TRIP.id}
                organizer
                travelOwed
                memberId="member-1"
              />
              <TripActions
                tripId={SAMPLE_TRIP.id}
                organizer={false}
                travelOwed
                ask={
                  <RsvpControl
                    value={rsvp ?? "no_response"}
                    onChange={(status) => {
                      setRsvp(status);
                      setLog(`RSVP "${RSVP_LABEL[status]}"`);
                    }}
                  />
                }
              />
            </Specimen>

            <Specimen
              name="RunLocked"
              contract="(no props)"
              note="The run, for a member the server will not read it to: full trip data needs a Going answer (`canViewFullTrip` in the API's event controller), so the trip page renders this in place of the run rather than a section that 403s, and the run's own reads are never fetched. It states the rule and points at the RSVP control above, in that control's own word, because a run that is simply absent reads as a trip with nothing in it."
            >
              <RunLocked />
            </Specimen>

            <Specimen
              name="InviteCard"
              contract="inviterName · tripName · destination · startDate · endDate"
              note="The trip as somebody who has not signed in reads it: the four facts the invitation preview returns, in the same order the trip page's own column uses, because this is that page seen through a keyhole. No itinerary, no roll call, no cover: those are what joining is for, and the endpoint does not send them."
            >
              <InviteCard
                inviterName={INVITATIONS[0]!.inviterName}
                tripName={TRIPS[0]!.title}
                destination={TRIPS[0]!.location}
                startDate={TRIPS[0]!.startDate}
                endDate={TRIPS[0]!.endDate}
              />
            </Specimen>

            <Specimen
              name="NotificationRow"
              contract="notification: { type, title, body, tripId, data, readAt, createdAt } · trip? · onPress?"
              note="Everything the row shows comes off the wire: the server's title is the eyebrow, its body is the message, and the cover is the client's lookup from the API's bare tripId. Unread is weight plus a strawberry edge, never a faded row. Rules, not cards."
            >
              <View className="border-t border-ink">
                {NOTIFICATIONS.slice(0, 4).map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    trip={tripFor(TRIPS, notification)}
                    onPress={() =>
                      setLog(`NotificationRow "${notification.body}" fired`)
                    }
                  />
                ))}
              </View>
            </Specimen>
            <Specimen
              name="EventCard"
              contract="event: { name, type, startTime, endTime, place, image } · onPress?"
              note="The trip card's twin — same photo, same two bold lines — except the line above the title is the time, because the day it sits under is the date. Place photos come from Google Places through the API's photo proxy."
            >
              <Grid>
                {eventsFor(TRIPS[0]!).slice(0, 2).map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onPress={() => setLog(`EventCard "${event.name}" fired`)}
                  />
                ))}
              </Grid>
            </Specimen>

            <Specimen
              name="EventRow"
              contract="event · timeZone? · onPress?"
              note="An event as a row of the run. Its twin is StayRow and they share ScheduleRow, so the thumbnail, the name's face and size, the chip line and the right-hand column's weight are decided in one place and cannot drift apart again. What makes it an event is data: the chip reads its type, and the right-hand column holds a clock. The chip beside the type is the place's name — which is what the stay row's is too, since a stay linked to a place should say which place, not only which town."
            >
              <View className="border-t border-ink">
                {eventsFor(TRIPS[0]!).slice(0, 2).map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    onPress={() => setLog(`EventRow "${event.name}" fired`)}
                  />
                ))}
              </View>
            </Specimen>

            <Specimen
              name="StayRow"
              contract="stay · timeZone? · onPress?"
              note="A roof, as a row of the run, and EventRow's twin — same ScheduleRow, so the two cannot drift apart. The chip reads Stay where an event's reads its type, and the right-hand column holds the range the stay covers where an event's holds a clock. The nights are not here: that is the sheet's line, the way an event's description is. The venue chip names the place when the stay is linked to one and the town when the address was typed instead, because the two rows have to agree about what where means."
            >
              <View className="border-t border-ink">
                {staysFor(TRIPS[0]!).slice(0, 2).map((stay) => (
                  <StayRow
                    key={stay.id}
                    stay={stay}
                    onPress={() => setLog(`StayRow "${stay.name}" fired`)}
                  />
                ))}
              </View>
            </Specimen>
          </View>
        </Section>

        <Section title="Feedback">
          <Text className="font-body text-base text-ink">
            There is no toast, and no component for one. A message that
            disappears is not a record: anything a person might need twice
            belongs in the state of the screen rather than in a line that
            fades. The web app fires toasts from its mutation hooks because a
            corner of a large screen is free; on a phone the top is the band
            and the bottom is the keyboard and the form's button, so a
            transient message has nowhere to sit that is not over something.
          </Text>
          <Text className="font-body text-base text-ink">
            What each kind of feedback is instead. An answer inverts the
            control that gave it, which is the RSVP. An authored thing appears
            in the list you were already reading, which is a trip, an event and
            a stay. An endpoint with three outcomes states all three where the
            send happened, which is the invite dialog. A failure belongs at the
            field that caused it, which is `FieldError` — the one line under a
            field that is not ink — and a request that fails belongs where its
            content would have been, with a way to ask again, which is
            `InlineError`.
          </Text>
          <Text className="font-body text-base text-ink">
            The one case that earns a transient message is a destructive action
            with no way back, and even there it is second best: the API
            soft-deletes and restores, so the answer is the Deleted items
            screen. If one is ever added it carries an action, appears alone,
            never auto-dismisses under five seconds, and never covers the
            form's button or the keyboard. Screen readers announce
            auto-dismissing content inconsistently on both platforms, which is
            the strongest argument against it here.
          </Text>
        </Section>


        <BootCoverSpecimen />
        <MotionSection onLog={setLog} />

        <Section title="Screens">
          <Text className="font-body text-base text-ink">
            Full screens under construction, composed from the tokens,
            primitives, and patterns above.
          </Text>
          <Link href="/trips" className="font-body-bold text-base text-ink underline">
            Trips
          </Link>
          <Link href="/trips/detail?id=picos" className="font-body-bold text-base text-ink underline">
            Trip detail
          </Link>
          <Link
            href="/trips/members?id=picos&as=organizer"
            className="font-body-bold text-base text-ink underline"
          >
            Who's coming · organizer
          </Link>
          <Link
            href="/trips/members?id=picos&as=traveler"
            className="font-body-bold text-base text-ink underline"
          >
            Who's coming · traveler
          </Link>
          <Link href="/trips/members/new?id=picos" className="font-body-bold text-base text-ink underline">
            Add a guest
          </Link>
          <Link
            href={`/trips/members/detail?id=picos&member=${SAMPLE_GUEST.id}`}
            className="font-body-bold text-base text-ink underline"
          >
            Guest detail
          </Link>
          <Link
            href={`/trips/members/detail?id=picos&member=${SAMPLE_MEMBER.id}`}
            className="font-body-bold text-base text-ink underline"
          >
            Member detail
          </Link>
          <Link href="/trips/settings?id=picos" className="font-body-bold text-base text-ink underline">
            Trip settings
          </Link>
          <Link href="/trips/edit?id=picos" className="font-body-bold text-base text-ink underline">
            Edit trip
          </Link>
          <Link href="/trips/events/new?id=picos" className="font-body-bold text-base text-ink underline">
            Add event
          </Link>
          <Link
            href={`/trips/events/detail?id=picos&event=${SAMPLE_EVENT.id}&as=organizer`}
            className="font-body-bold text-base text-ink underline"
          >
            Event detail · organizer
          </Link>
          <Link
            href={`/trips/events/detail?id=picos&event=${SAMPLE_EVENT.id}&as=traveler`}
            className="font-body-bold text-base text-ink underline"
          >
            Event detail · traveler
          </Link>
          <Link
            href="/trips/invite?id=picos"
            className="font-body-bold text-base text-ink underline"
          >
            Invite people
          </Link>
          <Link href="/trips/stay/new?id=picos" className="font-body-bold text-base text-ink underline">
            Add stay
          </Link>
          <Link
            href={`/trips/stay/detail?id=picos&stay=${SAMPLE_STAY.id}&as=organizer`}
            className="font-body-bold text-base text-ink underline"
          >
            Stay detail · organizer
          </Link>
          <Link
            href={`/trips/stay/detail?id=picos&stay=${SAMPLE_STAY.id}&as=traveler`}
            className="font-body-bold text-base text-ink underline"
          >
            Stay detail · traveler
          </Link>
          <Link
            href="/trips/travel?id=picos"
            className="font-body-bold text-base text-ink underline"
          >
            Travel
          </Link>
          <Link
            href={`/trips/travel/detail?id=picos&travel=${SAMPLE_TRAVEL.id}`}
            className="font-body-bold text-base text-ink underline"
          >
            Travel detail
          </Link>
          <Link href="/invite?id=invite-pending" className="font-body-bold text-base text-ink underline">
            Invitation
          </Link>
          <Link href="/invite?id=invite-gone" className="font-body-bold text-base text-ink underline">
            Invitation · gone
          </Link>
          <Link href="/notifications" className="font-body-bold text-base text-ink underline">
            Notifications
          </Link>
          <Link href="/profile" className="font-body-bold text-base text-ink underline">
            Profile
          </Link>
          <Link href="/admin/users" className="font-body-bold text-base text-ink underline">
            User management
          </Link>
          <Text className="font-body text-sm text-ink">
            The user list: search, filter tabs and Load more. A page, not a
            dialog — it is a surface you browse, like /trips. Redirects when
            the session is not an admin&apos;s — to /trips when signed in, to
            the landing when signed out — the same way /trips and /profile do.
          </Text>
          <Link href="/admin/users/detail?id=00000000-0000-4000-8000-000000000000" className="font-body-bold text-base text-ink underline">
            User
          </Link>
          <Text className="font-body text-sm text-ink">
            One user&apos;s record: facts, the edit form and the action
            group. A dialog, because it is the thing you opened to act on.
            The id is a placeholder — open a row from the list for a
            real one. Same redirect as the list when the session is not an
            admin&apos;s.
          </Text>
          <Link href="/terms" className="font-body-bold text-base text-ink underline">
            Terms of Service
          </Link>
          <Link href="/privacy" className="font-body-bold text-base text-ink underline">
            Privacy Policy
          </Link>
          <Link href="/sms-terms" className="font-body-bold text-base text-ink underline">
            SMS Terms
          </Link>
          <Text className="font-body text-base text-ink">
            The landing is not under /design: it is the app's front door, so
            it lives at / and renders the wordmark band without the person
            chrome. Same for /trips — the app's home, a re-export of the
            trips screen. The invitation is that case in reverse: it is the
            one screen a stranger reaches first, and the address a friend's
            text points at, so it lives at /invite and wears the bare band.
          </Text>
          <Link href="/" className="font-body-bold text-base text-ink underline">
            Landing
          </Link>
          <Link href="/login" className="font-body-bold text-base text-ink underline">
            Sign in
          </Link>
          <Text className="font-body text-base text-ink">
            The code and profile screens sit behind the sign-in and are
            deliberately not linked from here: each redirects back to it
            without a number or a session between them. The mock takes any
            valid number with the code 123456, and decides whether the
            profile screen is needed from whether it knows the number.
            Nothing else in the app runs those steps: an invitation hands a
            friend to this sign-in rather than repeating it.
          </Text>
        </Section>

        <Section title="Plumbing">
          <Text className="font-body text-base text-ink">
            What a mockup cannot prove by looking at it: that the bundle
            resolved a workspace import, and that the fonts loaded. The
            first is the thing Metro has historically got wrong.
          </Text>
          <TokenRow
            name="@journiful/shared"
            token={SHARED_IMPORT}
            detail="A bare package import, resolved through the exports map"
          />
          <TokenRow
            name="Viewport"
            token={width >= 768 ? "wide" : "phone"}
            detail="One layout above 768px, not a second design"
          />
        </Section>

        <Section title="Parking lot">
          <Text className="font-body text-base text-ink">
            Discover · deleted items · delete account · session storage, since
            the sign-in is a mock and nothing survives a reload. Each lands
            here as a pattern first, then in a screen.
          </Text>
          <Text className="font-body text-base text-ink">
            Delete account is the one with a backend behind it rather than
            beside it, and it is not a route: an admin can ban an account and
            nothing anywhere can remove one, and `users` has no `deleted_at`
            where every other deletable thing in the schema has one. Two
            decisions come before any screen. `payments` and
            `payment_participants` have to outlive the person they name, so
            deleting the account cannot mean deleting the rows. And the phone
            number is the account, so the row that lets somebody sign up again
            must not be reachable from the row that was deleted.
          </Text>
        </Section>
      </View>
      </Column>

      {/*
        The two bands, full bleed — and they are siblings of the root
        `Column` rather than inside it. That is the specimen as much as the
        tones are: a full-bleed ground cannot exist inside a constrained
        column, which is the whole reason `Screen` stopped wrapping its
        children in one. Every number beside each tone is computed from
        `lib/palette.ts` at render rather than typed here, because a
        hardcoded chroma is a claim and a measured one is a check.

        What the band's *content* wears matters as much as the tone: the
        first block inside one carries no rule, because the band's own edge
        is that boundary. Two marks for one seam is what the rule book
        forbids. The same reasoning gives a band its padding — on a band,
        padding is not air, it is colour.
      */}
      {(BAND_TONES as BandTone[]).map((tone) => {
        const token = TOKENS.find((t) => t.name === tone)!;
        return (
          <Band key={tone} tone={tone}>
            <Column>
              <View className="gap-2 py-2">
                <Text className="font-display-semibold text-heading-lg uppercase text-ink">
                  {tone}
                </Text>
                <Text className="font-body text-label text-ink opacity-70">
                  {token.hex} · chroma {chroma(token.hex).toFixed(3)} ·{" "}
                  {dE(token.hex, GROUNDS.sand).toFixed(1)} dE from sand · ink
                  on it {contrast("#000000", token.hex).toFixed(2)}:1
                </Text>
                <Text className="font-body text-body text-ink">
                  Text on a band is ink. No form field ever sits on one:
                  React Native cannot read a CSS variable into a prop (A5),
                  so a placeholder, an icon colour or a caret could not
                  invert with the band. One band at a time — two adjacent
                  grounds would say "these are two things" with nothing to
                  say what the division means.
                </Text>
              </View>
            </Column>
          </Band>
        );
      })}
    </Screen>
  );
}
