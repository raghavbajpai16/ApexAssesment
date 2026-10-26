import { z } from 'zod';

const decimalRegex6Dp = /^\d+(\.\d{1,6})?$/;
const integerRegex = /^\d+$/;

export const materialReceiptSchema = z.object({
  material_code: z.enum(['film', 'adhesive', 'core'], {
    errorMap: () => ({ message: "Material code must be 'film', 'adhesive', or 'core'" }),
  }),
  qty: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const str = String(val).trim();
      return decimalRegex6Dp.test(str) && parseFloat(str) > 0;
    }, 'Receipt quantity must be a positive number with at most 6 decimal places'),
  supplier: z
    .string()
    .trim()
    .max(100, 'Supplier name cannot exceed 100 characters')
    .optional(),
  note: z
    .string()
    .trim()
    .max(255, 'Note cannot exceed 255 characters')
    .optional(),
});

export const materialDamageSchema = z.object({
  material_code: z.enum(['film', 'adhesive', 'core'], {
    errorMap: () => ({ message: "Material code must be 'film', 'adhesive', or 'core'" }),
  }),
  qty: z
    .union([z.number(), z.string()])
    .refine((val) => {
      const str = String(val).trim();
      return decimalRegex6Dp.test(str) && parseFloat(str) > 0;
    }, 'Damage quantity must be a positive number with at most 6 decimal places'),
  note: z
    .string()
    .trim()
    .min(1, 'Damage reason / note is required')
    .max(255, 'Damage reason cannot exceed 255 characters'),
});
