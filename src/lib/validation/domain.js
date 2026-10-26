import { z } from 'zod';

/**
 * domain.js: Strict Zod validation schemas for Apex Tape Stock.
 * Enforces business constraints:
 * - Positive integers for rolls, metres, width, GSMs.
 * - Solids percentage strictly > 0 and <= 100.
 * - Wastage >= 0.
 * - Decimal inputs allowed up to 6 decimal places (whole milligrams).
 */

const decimalRegex6Dp = /^\d+(\.\d{1,6})?$/;
const decimalRegex2Dp = /^\d+(\.\d{1,2})?$/;

export const specSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Spec code is required')
    .max(50, 'Spec code cannot exceed 50 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Spec code may only contain letters, numbers, hyphens, and underscores'),
  name: z.string().trim().max(100).optional(),
  width_mm: z
    .number({ invalid_type_error: 'Width must be a number' })
    .int('Width in mm must be an integer')
    .positive('Width in mm must be greater than zero'),
  film_gsm: z
    .number({ invalid_type_error: 'Film GSM must be a number' })
    .int('Film GSM must be an integer')
    .positive('Film GSM must be greater than zero'),
  coating_gsm: z
    .number({ invalid_type_error: 'Coating GSM must be a number' })
    .int('Coating GSM must be an integer')
    .positive('Coating GSM must be greater than zero'),
  solids_percent: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const str = String(val).trim().replace(/%$/, '');
      if (!decimalRegex2Dp.test(str)) return false;
      const num = parseFloat(str);
      return num > 0 && num <= 100;
    }, 'Solids percentage must be strictly greater than 0% and at most 100% with up to 2 decimal places'),
  roll_length_m: z
    .number({ invalid_type_error: 'Roll length must be a number' })
    .int('Roll length in metres must be an integer')
    .positive('Roll length must be greater than zero'),
});

export const orderInputSchema = z.object({
  customer_id: z.number().int().positive('Customer is required'),
  spec_id: z.number().int().positive('Specification is required'),
  input_qty: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const str = String(val).trim();
      return decimalRegex6Dp.test(str) && parseFloat(str) > 0;
    }, 'Order quantity must be a positive number with at most 6 decimal places'),
  input_unit: z.enum(['rolls', 'metres', 'kg'], {
    errorMap: () => ({ message: "Unit must be one of: 'rolls', 'metres', or 'kg'" }),
  }),
});

export const productionBatchSchema = z.object({
  batch_no: z
    .string()
    .trim()
    .min(1, 'Batch number is required')
    .max(50, 'Batch number cannot exceed 50 characters'),
  spec_id: z.number().int().positive('Specification is required'),
  rolls: z
    .number({ invalid_type_error: 'Rolls must be an integer' })
    .int('Rolls must be a whole integer')
    .positive('Rolls must be at least 1'),
  film_kg: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const str = String(val).trim();
      return decimalRegex6Dp.test(str) && parseFloat(str) > 0;
    }, 'Film weight must be a positive decimal with at most 6 decimal places'),
  liquid_kg: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const str = String(val).trim();
      return decimalRegex6Dp.test(str) && parseFloat(str) > 0;
    }, 'Liquid adhesive weight must be a positive decimal with at most 6 decimal places'),
  waste_kg: z
    .union([z.number(), z.string()])
    .default(0)
    .refine((val) => {
      const str = String(val).trim();
      return decimalRegex6Dp.test(str) && parseFloat(str) >= 0;
    }, 'Dry wastage must be a non-negative decimal (>= 0) with at most 6 decimal places'),
});
