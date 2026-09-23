import { Segmented, type SegmentedTone } from "@/components/ui/Segmented";
import { RSVP_ANSWERS, RSVP_LABEL, type RsvpStatus } from "@/lib/rsvp";

/**
 * The three answers, in the colours they deserve.
 *
 * Green, amber, red — the closest three the palette has, spent on the one
 * control where the choice is the content: going, maybe, not going. Sea
 * foam is the system's yes (the date a trip runs, the button that makes
 * one), acid is its only caution, and strawberry is its alert, shared
 * with Delete event.
 *
 * Its own component rather than a tone map at each call site, so the
 * answer to "what colour is Maybe" has one home.
 */
const TONES: Record<RsvpStatus, SegmentedTone> = {
  going: "primary",
  maybe: "highlight",
  not_going: "danger",
  // Never offered — you cannot go back to not having answered — so it
  // only has to exist, not to look like anything.
  no_response: "accent",
};

export function RsvpControl({
  value,
  onChange,
  disabled = false,
}: {
  value: RsvpStatus;
  onChange: (status: RsvpStatus) => void;
  /**
   * The answer is in flight, so the control reports itself disabled:
   * announced on both platforms, and the pressables refuse the second
   * tap — which is what keeps one answer to one send.
   */
  disabled?: boolean;
}) {
  return (
    <Segmented
      options={RSVP_ANSWERS.map((status) => ({
        value: status,
        label: RSVP_LABEL[status],
        tone: TONES[status],
      }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
