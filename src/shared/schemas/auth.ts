import { z } from "zod";

export const accessLoginQuerySchema = z.object({
  next: z.string().max(2048).optional(),
});
