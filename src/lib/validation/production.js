import { z } from 'zod';

const decimalRegex6Dp = /^\d+(\.\d{1,6})?$/;

export const productionBatchInputSchema = z.object({
  batch_no: z
    .string()
    .trim()
    .min(1, 'Batch number is required')
    .max(50, 'Batch number cannot exceed 50 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Batch number may only contain letters, numbers, hyphens, and underscores'),
  spec_id: z.number().int().positive('Specification ID is required'),
  rolls: z
    .number({ invalid_type_error: 'Rolls must be an integer' })
    .int('Rolls must be a whole integer')
    .positive('Roll count must be at least 1 roll'),
  film_kg: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const str = String(val).trim();
      return decimalRegex6Dp.test(str) && parseFloat(str) > 0;
    }, 'Film weight must be a positive number with at most 6 decimal places'),
  liquid_kg: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const str = String(val).trim();
      return decimalRegex6Dp.test(str) && parseFloat(str) > 0;
    }, 'Liquid adhesive weight must be a positive number with at most 6 decimal places'),
  waste_kg: z
    .union([z.number(), z.string()])
    .default(0)
    .refine((val) => {
      const str = String(val).trim();
      return decimalRegex6Dp.test(str) && parseFloat(str) >= 0;
    }, 'Dry wastage must be a non-negative decimal (>= 0) with at most 6 decimal places'),
  shift: z
    .preprocess((val) => (typeof val === 'string' ? val.toLowerCase() : val), z.enum(['morning', 'evening', 'night']))
    .optional(),
  note: z
    .string()
    .trim()
    .max(255, 'Note cannot exceed 255 characters')
    .optional(),
});
