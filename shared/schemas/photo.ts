import { z } from "zod";

export const updatePhotoCaptionSchema = z.object({
  caption: z.string().max(200),
});

export type UpdatePhotoCaptionInput = z.infer<typeof updatePhotoCaptionSchema>;
