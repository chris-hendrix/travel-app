/**
 * The words travel uses for its own states, in one place because more
 * than one screen says them.
 *
 * A state named twice reads as two states. The board's row and the
 * form's direction summary were calling the same fact "No time yet" and
 * "Not shared yet", which invites the reader to wonder what the
 * difference is. It is the same fact: a direction nobody has filled in.
 *
 * "Not shared" over "No time" because it says whose move it is — the
 * member's — rather than describing the gap.
 */
export const NOT_SHARED = "Not shared yet";
