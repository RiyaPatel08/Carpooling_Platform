import 'dotenv/config';
import { z } from 'zod';

/**
 * Fail fast on bad configuration. A missing JWT secret should crash at boot,
 * not produce unverifiable tokens at 2am during the demo.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),

  OSRM_URL: z.string().url().default('https://routing.openstreetmap.de/routed-car'),
  PHOTON_URL: z.string().url().default('https://photon.komoot.io'),

  // Corridor matching tunables — exposed because the right radius depends on
  // the city's road density, and we tune these live during the demo.
  CORRIDOR_RADIUS_M: z.coerce.number().default(1500),
  MAX_DETOUR_MIN: z.coerce.number().default(10),
  DEVIATION_THRESHOLD_M: z.coerce.number().default(500),
  DEVIATION_STRIKES: z.coerce.number().int().default(3),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;

/** Razorpay is optional: without keys, card/UPI paths report "not configured". */
export const razorpayEnabled = Boolean(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET);
