import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email({ message: 'A valid email address is required' })
    .max(255, { message: 'Email must be at most 255 characters' }),
  password: z
    .string()
    .min(1, { message: 'Password is required' })
    .max(128, { message: 'Password is too long' }),
});
