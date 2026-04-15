"use client";

import Link from "next/link";
import { MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

type ValidProps = {
  valid: true;
  tripName: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  inviterName: string;
  inviteePhone: string;
  tripId: string;
};

type InvalidProps = {
  valid: false;
};

type InvitePreviewCardProps = ValidProps | InvalidProps;

function formatDateRange(
  startDate: string | null,
  endDate: string | null,
): string | null {
  if (!startDate) return null;
  const start = new Date(startDate + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const startStr = start.toLocaleDateString("en-US", opts);
  if (!endDate) return startStr;
  const end = new Date(endDate + "T00:00:00");
  const endStr = end.toLocaleDateString("en-US", opts);
  return `${startStr} — ${endStr}`;
}

export function InvitePreviewCard(props: InvitePreviewCardProps) {
  if (!props.valid) {
    return (
      <Card className="w-full max-w-md border-border/50 shadow-2xl linen-texture overflow-hidden">
        <CardHeader className="text-center">
          <p className="text-sm text-accent font-accent uppercase tracking-widest">
            Par Avion
          </p>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight font-playfair">
            Invitation unavailable
          </h1>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-muted-foreground">
            This invitation is no longer available. It may have expired or
            already been used.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Button asChild variant="gradient">
            <Link href="/">Go to Journiful</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const {
    tripName,
    destination,
    startDate,
    endDate,
    inviterName,
    inviteePhone,
    tripId,
  } = props;

  const dateRange = formatDateRange(startDate, endDate);
  const joinUrl = `/login?redirect=${encodeURIComponent(`/trips/${tripId}`)}&phone=${encodeURIComponent(inviteePhone)}`;

  return (
    <Card className="w-full max-w-md border-border/50 shadow-2xl linen-texture overflow-hidden">
      <CardHeader>
        <p className="text-sm text-accent font-accent uppercase tracking-widest">
          Par Avion
        </p>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight font-playfair">
          You&apos;re invited!
        </h1>
        <p className="text-sm text-muted-foreground">
          {inviterName} invited you to join a trip
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground font-playfair">
          {tripName}
        </h2>
        {destination && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            <span>{destination}</span>
          </div>
        )}
        {dateRange && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="size-4 shrink-0" />
            <span>{dateRange}</span>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button asChild variant="gradient" className="w-full h-12">
          <Link href={joinUrl}>Join Trip</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
