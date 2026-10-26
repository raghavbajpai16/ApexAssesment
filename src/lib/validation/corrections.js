import { z } from 'zod';

const decimalRegex6Dp = /^\d+(\.\d{1,6})?$/;

export const correctMaterialReceiptSchema = z.object({
  txn_id: z.number().int().positive('Transaction ID is required'),
  qty: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const str = String(val).trim();
      return decimalRegex6Dp.test(str) && parseFloat(str) > 0;
    }, 'Quantity must be a positive number with at most 6 decimal places'),
  supplier: z.string().trim().max(100).optional().nullable(),
  reason: z
    .string()
    .trim()
    .min(5, 'Reason must be at least 5 characters explaining why the correction is needed')
    .max(500, 'Reason cannot exceed 500 characters'),
  approved_by: z.string().trim().max(100).optional().nullable(),
});

export const correctMaterialDamageSchema = z.object({
  txn_id: z.number().int().positive('Transaction ID is required'),
  qty: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const str = String(val).trim();
      return decimalRegex6Dp.test(str) && parseFloat(str) > 0;
    }, 'Quantity must be a positive number with at most 6 decimal places'),
  reason: z
    .string()
    .trim()
    .min(5, 'Reason must be at least 5 characters explaining why the correction is needed')
    .max(500, 'Reason cannot exceed 500 characters'),
  approved_by: z.string().trim().max(100).optional().nullable(),
});

export const correctProductionBatchSchema = z.object({
  batch_id: z.number().int().positive('Batch ID is required'),
  rolls: z
    .number({ invalid_type_error: 'Roll count must be an integer' })
    .int('Roll count must be an integer')
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
  reason: z
    .string()
    .trim()
    .min(5, 'Reason must be at least 5 characters explaining why the correction is needed')
    .max(500, 'Reason cannot exceed 500 characters'),
  approved_by: z.string().trim().max(100).optional().nullable(),
});
