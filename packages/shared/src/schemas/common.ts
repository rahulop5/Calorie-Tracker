import { z } from 'zod';

/** 'YYYY-MM-DD'. See domain/dates.ts for why calendar dates are strings. */
export const dateOnlySchema = z.iso.date();

export const uuidSchema = z.uuid();

export const idParamSchema = z.object({ id: uuidSchema });
export type IdParam = z.infer<typeof idParamSchema>;

/** A date window, inclusive at both ends. */
export const dateRangeQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '`from` must not be after `to`',
  });
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;
