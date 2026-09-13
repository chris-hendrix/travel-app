ALTER TABLE "payment_participants" DROP CONSTRAINT "payment_participants_member_id_members_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_participants" ADD CONSTRAINT "payment_participants_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;