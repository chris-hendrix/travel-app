ALTER TABLE "events" ADD COLUMN "location_lat" double precision;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "location_lon" double precision;--> statement-breakpoint
ALTER TABLE "accommodations" ADD COLUMN "address_lat" double precision;--> statement-breakpoint
ALTER TABLE "accommodations" ADD COLUMN "address_lon" double precision;
