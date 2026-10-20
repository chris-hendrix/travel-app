import { describe, expect, it, vi } from "vitest";
import { createElement, Suspense } from "react";
import { createRequire } from "node:module";

// Same probe seam as `member-writes.test.ts`: keep the real `ApiError`
// (the rollback tests assert on the rejection) and stub only the network
// at the module boundary.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const require = createRequire(import.meta.url);
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: unknown) => string;
};

import { QueryClientProvider } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import type { Member } from "@/lib/members";
import type { Payment } from "@/lib/payments";
import type { Payment as ApiPayment } from "@journiful/shared/types";
import { balanceKeys } from "@/lib/queries/balances";
import { memberKeys } from "@/lib/queries/members";
import {
  createPayment,
  deletePayment,
  invalidateTripMoney,
  paymentKeys,
  updatePayment,
  useCreatePayment,
  useDeletePayment,
  useUpdatePayment,
} from "@/lib/queries/payments";
import { makeQueryClient } from "@/lib/queries/client";

const mockedApiFetch = vi.mocked(apiFetch);

/** The API's own payment entity, as `paymentResponseSchema` returns it. */
function apiPayment(overrides: Partial<ApiPayment> = {}): ApiPayment {
  return {
    id: "payment-1",
    tripId: "trip-1",
    description: "Dinner",
    note: "Venmo",
    amount: 10000,
    splitScope: "custom",
    payerMemberId: "member-1",
    payerName: "Ava",
    date: new Date("2026-10-11T10:00:00.000Z"),
    createdBy: "user-1",
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-10-11T10:00:00.000Z"),
    updatedAt: new Date("2026-10-11T10:00:00.000Z"),
    participants: [
      {
        id: "pp-1",
        paymentId: "payment-1",
        memberId: "member-1",
        shareAmount: 5000,
        name: "Ava",
        createdAt: new Date("2026-10-11T10:00:00.000Z"),
      },
      {
        id: "pp-2",
        paymentId: "payment-1",
        memberId: "member-2",
        shareAmount: 5000,
        name: "Priya",
        createdAt: new Date("2026-10-11T10:00:00.000Z"),
      },
    ],
    ...overrides,
  };
}

function cachedPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    tripId: "trip-1",
    description: "Dinner",
    note: "Venmo",
    amount: 10000,
    splitScope: "custom",
    payerMemberId: "member-1",
    payerName: "Ava",
    date: "2026-10-11T10:00:00.000Z",
    createdBy: "user-1",
    participants: [
      { id: "pp-1", memberId: "member-1", name: "Ava", shareAmount: 5000 },
      { id: "pp-2", memberId: "member-2", name: "Priya", shareAmount: 5000 },
    ],
    createdAt: "2026-10-11T10:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function cachedMember(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-1",
    userId: "user-1",
    name: "Ava",
    status: "going",
    isOrganizer: true,
    phone: "",
    sharePhone: false,
    handles: null,
    ...overrides,
  };
}

const createInput = {
  description: "Dinner",
  amount: 10000,
  payerMemberId: "member-1",
  participants: [{ memberId: "member-1" }, { memberId: "member-2" }],
  date: "2026-10-11T10:00:00.000Z",
  note: "Venmo",
};

function captureCreatePayment() {
  const client = makeQueryClient();
  const seen: { create: ReturnType<typeof useCreatePayment> | null } = {
    create: null,
  };
  function Probe() {
    seen.create = useCreatePayment("trip-1");
    return null;
  }
  function Wrapper() {
    return createElement(
      QueryClientProvider,
      { client },
      createElement(Suspense, { fallback: null }, createElement(Probe)),
    );
  }
  renderToString(createElement(Wrapper));
  if (!seen.create) throw new Error("useCreatePayment was not captured");
  return { client, create: seen.create };
}

function captureUpdatePayment() {
  const client = makeQueryClient();
  const seen: { update: ReturnType<typeof useUpdatePayment> | null } = {
    update: null,
  };
  function Probe() {
    seen.update = useUpdatePayment("trip-1");
    return null;
  }
  function Wrapper() {
    return createElement(
      QueryClientProvider,
      { client },
      createElement(Suspense, { fallback: null }, createElement(Probe)),
    );
  }
  renderToString(createElement(Wrapper));
  if (!seen.update) throw new Error("useUpdatePayment was not captured");
  return { client, update: seen.update };
}

function captureDeletePayment() {
  const client = makeQueryClient();
  const seen: { remove: ReturnType<typeof useDeletePayment> | null } = {
    remove: null,
  };
  function Probe() {
    seen.remove = useDeletePayment("trip-1");
    return null;
  }
  function Wrapper() {
    return createElement(
      QueryClientProvider,
      { client },
      createElement(Suspense, { fallback: null }, createElement(Probe)),
    );
  }
  renderToString(createElement(Wrapper));
  if (!seen.remove) throw new Error("useDeletePayment was not captured");
  return { client, remove: seen.remove };
}

describe("createPayment", () => {
  it("POSTs the exact body and returns the mapped payment", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, payment: apiPayment() });

    const payment = await createPayment("trip-1", createInput);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith("/trips/trip-1/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Dinner",
        amount: 10000,
        payerMemberId: "member-1",
        participants: [{ memberId: "member-1" }, { memberId: "member-2" }],
        date: "2026-10-11T10:00:00.000Z",
        note: "Venmo",
      }),
    });
    // Mapped through `toPayment`: the note crosses, the day is ISO.
    expect(payment.note).toBe("Venmo");
    expect(payment.date).toBe("2026-10-11T10:00:00.000Z");
    expect(payment.participants.map((p) => p.name)).toEqual(["Ava", "Priya"]);
  });

  it("does not send a note it does not have", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, payment: apiPayment() });

    await createPayment("trip-1", { ...createInput, note: "" });

    const [, init] = mockedApiFetch.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).not.toHaveProperty("note");
  });

  it("keeps the picker's participant order, because the remainder rides it", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, payment: apiPayment() });

    await createPayment("trip-1", {
      ...createInput,
      participants: [{ memberId: "member-2" }, { memberId: "member-1" }],
    });

    const [, init] = mockedApiFetch.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).participants).toEqual([
      { memberId: "member-2" },
      { memberId: "member-1" },
    ]);
  });
  it("posts the rule, and no participant list, for a scoped create", async () => {
    // A rule is resolved on the server against the roster, so the wire
    // carries the rule alone: sending a list too would be refused
    // (`shared/schemas/payment.ts` — the scope and the list are exclusive).
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      payment: apiPayment({ splitScope: "all_going" }),
    });

    await createPayment("trip-1", {
      description: "Dinner",
      amount: 10000,
      payerMemberId: "member-1",
      splitScope: "all_going",
      date: "2026-10-11T10:00:00.000Z",
    });

    const [, init] = mockedApiFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.splitScope).toBe("all_going");
    expect(body).not.toHaveProperty("participants");
  });

  it("posts the fixed list, and no scope, for a custom create", async () => {
    // `custom` is the column default and it means "the rows are the
    // split", so naming it on the wire says nothing the absence does
    // not — and an edit is where the scope is sent when a rule has to be
    // undone.
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, payment: apiPayment() });

    await createPayment("trip-1", { ...createInput, splitScope: "custom" });

    const [, init] = mockedApiFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.participants).toEqual([
      { memberId: "member-1" },
      { memberId: "member-2" },
    ]);
    expect(body).not.toHaveProperty("splitScope");
  });
});

describe("useCreatePayment", () => {
  it("paints a temporary row, then swaps it for the server's row", async () => {
    mockedApiFetch.mockReset();
    let resolveFetch!: (value: unknown) => void;
    mockedApiFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { client, create } = captureCreatePayment();
    // The roster is what names the painted row.
    client.setQueryData<Member[]>(memberKeys.list("trip-1"), [
      cachedMember(),
      cachedMember({ id: "member-2", name: "Priya", isOrganizer: false }),
    ]);

    const pending = create.mutateAsync({
      input: createInput,
      splitMemberIds: ["member-1", "member-2"],
    });

    await vi.waitFor(() => {
      expect(
        client.getQueryData<Payment[]>(paymentKeys.list("trip-1")),
      ).toHaveLength(1);
    });

    const painted = client.getQueryData<Payment[]>(
      paymentKeys.list("trip-1"),
    )![0]!;
    expect(painted.id).toMatch(/^pending-/);
    expect(painted.description).toBe("Dinner");
    expect(painted.payerName).toBe("Ava");
    // The server's own remainder rule, so the painted shares are the
    // ones the form previewed.
    expect(painted.participants.map((p) => p.shareAmount)).toEqual([5000, 5000]);

    resolveFetch({ success: true, payment: apiPayment({ id: "payment-9" }) });
    await pending;

    expect(
      client
        .getQueryData<Payment[]>(paymentKeys.list("trip-1"))
        ?.map((row) => row.id),
    ).toEqual(["payment-9"]);
  });

  it("removes the painted row when the server rejects, restoring what was there", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(500, "Server exploded"));

    const { client, create } = captureCreatePayment();
    client.setQueryData<Payment[]>(paymentKeys.list("trip-1"), [
      cachedPayment({ id: "existing" }),
    ]);

    await expect(
      create.mutateAsync({
        input: createInput,
        splitMemberIds: ["member-1", "member-2"],
      }),
    ).rejects.toThrow();

    expect(
      client
        .getQueryData<Payment[]>(paymentKeys.list("trip-1"))
        ?.map((row) => row.id),
    ).toEqual(["existing"]);
  });

  it("paints a scoped row from the paint list the mutation carries", async () => {
    // A scoped create's request has no participants to paint from — the
    // rule is resolved elsewhere — so the ids the form resolved ride
    // along with the mutation: they name and price the temporary row and
    // are stripped from the body.
    mockedApiFetch.mockReset();
    let resolveFetch!: (value: unknown) => void;
    mockedApiFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { client, create } = captureCreatePayment();
    client.setQueryData<Member[]>(memberKeys.list("trip-1"), [
      cachedMember(),
      cachedMember({ id: "member-2", name: "Priya", isOrganizer: false }),
    ]);

    const pending = create.mutateAsync({
      input: {
        description: "Dinner",
        amount: 10001,
        payerMemberId: "member-1",
        splitScope: "all_going",
      },
      // Deliberately not the order the roster is cached in: the paint
      // follows the list it was handed, which is the order the form
      // priced.
      splitMemberIds: ["member-2", "member-1"],
    });

    await vi.waitFor(() => {
      expect(
        client.getQueryData<Payment[]>(paymentKeys.list("trip-1")),
      ).toHaveLength(1);
    });

    const painted = client.getQueryData<Payment[]>(
      paymentKeys.list("trip-1"),
    )![0]!;
    expect(painted.splitScope).toBe("all_going");
    expect(painted.participants.map((p) => p.memberId)).toEqual([
      "member-2",
      "member-1",
    ]);
    expect(painted.participants.map((p) => p.name)).toEqual(["Priya", "Ava"]);
    // The remainder rides the paint list's order, as it does on the wire.
    expect(painted.participants.map((p) => p.shareAmount)).toEqual([
      5001, 5000,
    ]);

    // And the body the server sees carries the rule alone.
    const [, init] = mockedApiFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.splitScope).toBe("all_going");
    expect(body).not.toHaveProperty("participants");

    resolveFetch({
      success: true,
      payment: apiPayment({ id: "payment-9", splitScope: "all_going" }),
    });
    await pending;
  });

  it("settles through invalidateTripMoney, so the balances move too", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, payment: apiPayment() });

    const { client, create } = captureCreatePayment();
    client.setQueryData<Payment[]>(paymentKeys.list("trip-1"), []);
    client.setQueryData(balanceKeys.trip("trip-1"), []);
    client.setQueryData(balanceKeys.me("trip-1"), {
      netBalance: 0,
      details: [],
    });

    await create.mutateAsync({
      input: createInput,
      splitMemberIds: ["member-1", "member-2"],
    });

    expect(
      client.getQueryState(paymentKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(balanceKeys.trip("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(balanceKeys.me("trip-1"))?.isInvalidated,
    ).toBe(true);
  });
});

describe("updatePayment", () => {
  it("PUTs only the fields it was given", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true, payment: apiPayment() });

    await updatePayment("payment-1", { amount: 5000 });

    expect(mockedApiFetch).toHaveBeenCalledWith("/payments/payment-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 5000 }),
    });
  });

  it("sends an empty note deliberately, which is how a note is cleared", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      payment: apiPayment({ note: null }),
    });

    const payment = await updatePayment("payment-1", { note: "" });

    const [, init] = mockedApiFetch.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ note: "" });
    expect(payment.note).toBeNull();
  });
});

describe("useUpdatePayment", () => {
  it("patches the row it owns and leaves the others alone", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      payment: apiPayment({ amount: 5000 }),
    });

    const { client, update } = captureUpdatePayment();
    client.setQueryData<Payment[]>(paymentKeys.list("trip-1"), [
      cachedPayment({ id: "payment-1" }),
      cachedPayment({ id: "payment-2", description: "Lunch" }),
    ]);

    await update.mutateAsync({ paymentId: "payment-1", input: { amount: 5000 } });

    const rows = client.getQueryData<Payment[]>(paymentKeys.list("trip-1"))!;
    expect(rows.find((row) => row.id === "payment-1")!.amount).toBe(5000);
    expect(rows.find((row) => row.id === "payment-2")).toEqual(
      cachedPayment({ id: "payment-2", description: "Lunch" }),
    );
  });

  it("patches a changed split rule but never the people it resolves to", async () => {
    // The rule is the request's own answer, so the row's heading follows it
    // at once — "Everyone going" must not keep reading after the reader
    // chose "Everyone invited". The people are the other half: only the
    // server can resolve a scope against the roster and price it, so
    // `participants` stays exactly as the refetch will replace it.
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      payment: apiPayment({ splitScope: "all_invited" }),
    });

    const { client, update } = captureUpdatePayment();
    const cached = cachedPayment({
      splitScope: "all_going",
      participants: [
        { id: "pp-1", memberId: "member-1", name: "Ava", shareAmount: 5000 },
        { id: "pp-2", memberId: "member-2", name: "Priya", shareAmount: 5000 },
      ],
    });
    client.setQueryData<Payment[]>(paymentKeys.list("trip-1"), [cached]);

    await update.mutateAsync({
      paymentId: "payment-1",
      input: { splitScope: "all_invited" },
    });

    const painted = client.getQueryData<Payment[]>(
      paymentKeys.list("trip-1"),
    )![0]!;
    expect(painted.splitScope).toBe("all_invited");
    expect(painted.participants).toEqual(cached.participants);

    // And the body says the same thing the row now reads.
    const [, init] = mockedApiFetch.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.splitScope).toBe("all_invited");
    expect(body).not.toHaveProperty("participants");
  });

  it("reverts only the list it replaced when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(403, "Nope"));

    const { client, update } = captureUpdatePayment();
    const original = [cachedPayment({ id: "payment-1" })];
    client.setQueryData<Payment[]>(paymentKeys.list("trip-1"), original);
    client.setQueryData(balanceKeys.trip("trip-1"), []);

    await expect(
      update.mutateAsync({ paymentId: "payment-1", input: { amount: 5000 } }),
    ).rejects.toThrow();

    expect(client.getQueryData<Payment[]>(paymentKeys.list("trip-1"))).toEqual(
      original,
    );
  });

  it("settles through invalidateTripMoney, so the balances move too", async () => {
    // A changed amount is a changed debt: the ledger and both balance
    // reads are one domain, and a write that refetched only its own list
    // would leave the headline showing the old arithmetic.
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({
      success: true,
      payment: apiPayment({ amount: 5000 }),
    });

    const { client, update } = captureUpdatePayment();
    client.setQueryData<Payment[]>(paymentKeys.list("trip-1"), [
      cachedPayment({ id: "payment-1" }),
    ]);
    client.setQueryData(balanceKeys.trip("trip-1"), []);
    client.setQueryData(balanceKeys.me("trip-1"), {
      netBalance: 0,
      details: [],
    });

    await update.mutateAsync({
      paymentId: "payment-1",
      input: { amount: 5000, splitScope: "custom", participants: [{ memberId: "member-1" }, { memberId: "member-2" }] },
    });

    expect(
      client.getQueryState(paymentKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(balanceKeys.trip("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(balanceKeys.me("trip-1"))?.isInvalidated,
    ).toBe(true);
  });
});

describe("deletePayment", () => {
  it("DELETEs the row", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockResolvedValue({ success: true });

    await deletePayment("payment-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/payments/payment-1", {
      method: "DELETE",
    });
  });
});

describe("useDeletePayment", () => {
  it("paints deletedAt so the ledger drops the row immediately", async () => {
    mockedApiFetch.mockReset();
    let resolveFetch!: (value: unknown) => void;
    mockedApiFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { client, remove } = captureDeletePayment();
    client.setQueryData<Payment[]>(paymentKeys.list("trip-1"), [
      cachedPayment({ id: "payment-1" }),
    ]);
    client.setQueryData(balanceKeys.trip("trip-1"), []);
    client.setQueryData(balanceKeys.me("trip-1"), {
      netBalance: 0,
      details: [],
    });

    const pending = remove.mutateAsync({ paymentId: "payment-1" });

    await vi.waitFor(() => {
      expect(
        client.getQueryData<Payment[]>(paymentKeys.list("trip-1"))![0]!
          .deletedAt,
      ).not.toBeNull();
    });

    resolveFetch({ success: true });
    await pending;

    expect(
      client.getQueryState(paymentKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
    // A deleted expense stops being owed, so the money domain goes stale
    // together — the same settle the other two writes make.
    expect(
      client.getQueryState(balanceKeys.trip("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(balanceKeys.me("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("restores the row when the server rejects", async () => {
    mockedApiFetch.mockReset();
    mockedApiFetch.mockRejectedValue(new ApiError(403, "Nope"));

    const { client, remove } = captureDeletePayment();
    client.setQueryData<Payment[]>(paymentKeys.list("trip-1"), [
      cachedPayment({ id: "payment-1" }),
    ]);

    await expect(
      remove.mutateAsync({ paymentId: "payment-1" }),
    ).rejects.toThrow();

    expect(
      client.getQueryData<Payment[]>(paymentKeys.list("trip-1"))![0]!.deletedAt,
    ).toBeNull();
  });
});

describe("invalidateTripMoney", () => {
  it("marks the expenses and both balance reads stale", async () => {
    const client = makeQueryClient();
    client.setQueryData<Payment[]>(paymentKeys.list("trip-1"), []);
    client.setQueryData(balanceKeys.trip("trip-1"), []);
    client.setQueryData(balanceKeys.me("trip-1"), {
      netBalance: 0,
      details: [],
    });

    await invalidateTripMoney(client, "trip-1");

    expect(
      client.getQueryState(paymentKeys.list("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(balanceKeys.trip("trip-1"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(balanceKeys.me("trip-1"))?.isInvalidated,
    ).toBe(true);
  });

  it("leaves another trip's money alone", async () => {
    const client = makeQueryClient();
    client.setQueryData<Payment[]>(paymentKeys.list("trip-2"), []);
    client.setQueryData(balanceKeys.trip("trip-2"), []);

    await invalidateTripMoney(client, "trip-1");

    expect(
      client.getQueryState(paymentKeys.list("trip-2"))?.isInvalidated,
    ).toBe(false);
    expect(
      client.getQueryState(balanceKeys.trip("trip-2"))?.isInvalidated,
    ).toBe(false);
  });
});
