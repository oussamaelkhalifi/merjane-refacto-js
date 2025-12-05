import { z } from 'zod';

export const processOrderParamsSchema = z.object({
  orderId: z.coerce.number(),
});

export type ProcessOrderParams = z.infer<typeof processOrderParamsSchema>;
