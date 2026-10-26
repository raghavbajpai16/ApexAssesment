import { z } from 'zod';

const decimalRegex6Dp = /^\d+(\.\d{1,6})?$/;

export const createOrderSchema = z.object({
  order_no: z
    .string()
    .trim()
    .max(50, 'Order number cannot exceed 50 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Order number may only contain letters, numbers, hyphens, and underscores')
    .optional(),
  customer_id: z.number().int().positive('Customer ID is required'),
  spec_id: z.number().int().positive('Specification ID is required'),
  input_qty: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const str = String(val).trim();
      return decimalRegex6Dp.test(str) && parseFloat(str) > 0;
    }, 'Order quantity must be a positive number with at most 6 decimal places'),
  input_unit: z.enum(['rolls', 'metres', 'kg'], {
    invalid_type_error: "Unit must be 'rolls', 'metres', or 'kg'",
  }),
  note: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional().nullable(),
});

export const dispatchOrderSchema = z.object({
  rolls: z
    .number({ invalid_type_error: 'Rolls must be a whole integer' })
    .int('Rolls must be an integer')
    .positive('Dispatch roll count must be at least 1 roll'),
  note: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional().nullable(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').optional().nullable(),
});
