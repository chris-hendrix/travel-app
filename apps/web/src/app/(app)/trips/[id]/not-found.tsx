import Link from "next/link";

export default function TripNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-4xl font-semibold">404</h2>
        <p className="text-xl text-muted-foreground">Trip not found</p>
        <p className="text-muted-foreground">
          This trip may have been deleted or you don&apos;t have access.
        </p>
        <Link
          href="/trips"
          className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Back to trips
        </Link>
      </div>
    </div>
  );
}
