/**
 * The API's `rsvp_status`, all four states — including `no_response`,
 * which is where every invited person starts.
 */
export type RsvpStatus = "going" | "maybe" | "no_response" | "not_going";

/**
 * The three answers a person can give, in the order they are offered.
 *
 * `no_response` is deliberately absent: it is the state you start in, not
 * an answer, and there is no going back to it once you have replied.
 */
export const RSVP_ANSWERS: RsvpStatus[] = ["going", "maybe", "not_going"];

/** How a status reads as a word — on a segment, or in a roll call. */
export const RSVP_LABEL: Record<RsvpStatus, string> = {
  going: "Going",
  maybe: "Maybe",
  no_response: "No response",
  not_going: "Not going",
};

/**
 * What the organizer's row says instead. An organizer is going by
 * default — it is their own trip — so repeating it spends the column on
 * the one answer nobody had to give.
 */
export const ORGANIZING_LABEL = "Organizing";

/**
 * The last column of a roll call: what this person's part in the trip is.
 * For everyone else that is an answer; for the organizer it is the job.
 */
export function memberLabel(member: {
  isOrganizer: boolean;
  status: RsvpStatus;
}): string {
  return member.isOrganizer ? ORGANIZING_LABEL : RSVP_LABEL[member.status];
}
