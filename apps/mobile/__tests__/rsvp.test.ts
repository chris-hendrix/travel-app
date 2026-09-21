import { describe, expect, it } from "vitest";
import {
  ORGANIZING_LABEL,
  memberLabel,
  RSVP_ANSWERS,
  RSVP_LABEL,
  type RsvpStatus,
} from "@/lib/rsvp";

/** The API's `rsvp_status`, written out here as the contract it is. */
const API_STATUSES: RsvpStatus[] = [
  "going",
  "maybe",
  "no_response",
  "not_going",
];

describe("RSVP_ANSWERS", () => {
  it("offers three answers, in the order they are shown", () => {
    expect(RSVP_ANSWERS).toEqual(["going", "maybe", "not_going"]);
  });

  it("leaves out the state you cannot choose", () => {
    expect(RSVP_ANSWERS).not.toContain("no_response");
    expect(RSVP_ANSWERS).toHaveLength(API_STATUSES.length - 1);
  });

  it("lists nobody twice", () => {
    expect(new Set(RSVP_ANSWERS).size).toBe(RSVP_ANSWERS.length);
  });
});

describe("RSVP_LABEL", () => {
  it("names every status the API can return, answers included", () => {
    for (const status of API_STATUSES) {
      expect(RSVP_LABEL[status]).toBeTruthy();
    }
  });

  it("covers nothing the API cannot return", () => {
    expect(Object.keys(RSVP_LABEL).sort()).toEqual([...API_STATUSES].sort());
  });

  it("gives every status its own word", () => {
    const words = Object.values(RSVP_LABEL);
    expect(new Set(words).size).toBe(words.length);
  });
});

describe("memberLabel", () => {
  it("says Organizing for the organizer, whatever their status", () => {
    expect(memberLabel({ isOrganizer: true, status: "going" })).toBe(
      ORGANIZING_LABEL,
    );
    expect(memberLabel({ isOrganizer: true, status: "maybe" })).toBe(
      ORGANIZING_LABEL,
    );
  });

  it("says the answer for everyone else", () => {
    for (const status of API_STATUSES) {
      expect(memberLabel({ isOrganizer: false, status })).toBe(
        RSVP_LABEL[status],
      );
    }
  });
});
