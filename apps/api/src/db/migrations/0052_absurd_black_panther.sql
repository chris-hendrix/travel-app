ALTER TABLE "invitations" ALTER COLUMN "invitee_phone" SET DATA TYPE varchar(64);--> statement-breakpoint
ALTER TABLE "members" ALTER COLUMN "guest_phone" SET DATA TYPE varchar(64);