export interface AppConfig {
  env: string;
  port: number;
  appBaseUrl: string;
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
    ssl: boolean;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  otp: {
    ttlSeconds: number;
  };
  challenge: {
    ttlSeconds: number;
  };
  redis: {
    host: string;
    port: number;
  };
  paga: {
    businessBaseUrl: string;
    collectBaseUrl: string;
    apiKey: string;
    apiSecret: string;
    hashKey: string;
    webhookSecret: string;
  };
  risk: {
    tierDailyLimits: Record<number, bigint>;
    singleTransferLimit: bigint;
    newPayeeLimit: bigint;
    velocityCount: number;
    velocityWindowMinutes: number;
  };
  resend: {
    apiKey: string;
    fromEmail: string;
  };
  gemini: {
    apiKey: string;
    model: string;
  };
  googlePlay: {
    integrityApiKey: string;
  };
}

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
};

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 3000),
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: int(process.env.DB_PORT, 5432),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    name: process.env.DB_NAME ?? 'vireo',
    ssl: bool(process.env.DB_SSL, false),
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-only-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  otp: {
    ttlSeconds: int(process.env.OTP_TTL_SECONDS, 300),
  },
  challenge: {
    ttlSeconds: int(process.env.CHALLENGE_TTL_SECONDS, 120),
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: int(process.env.REDIS_PORT, 6379),
  },
  paga: {
    businessBaseUrl: process.env.PAGA_BUSINESS_BASE_URL ?? '',
    collectBaseUrl: process.env.PAGA_COLLECT_BASE_URL ?? '',
    apiKey: process.env.PAGA_API_KEY ?? '',
    apiSecret: process.env.PAGA_API_SECRET ?? '',
    hashKey: process.env.PAGA_HASH_KEY ?? '',
    webhookSecret: process.env.PAGA_WEBHOOK_SECRET ?? '',
  },
  risk: {
    tierDailyLimits: {
      0: BigInt(process.env.RISK_TIER0_DAILY_LIMIT ?? '2000000'),
      1: BigInt(process.env.RISK_TIER1_DAILY_LIMIT ?? '5000000'),
      2: BigInt(process.env.RISK_TIER2_DAILY_LIMIT ?? '20000000'),
    },
    singleTransferLimit: BigInt(process.env.RISK_SINGLE_TRANSFER_LIMIT ?? '10000000'),
    newPayeeLimit: BigInt(process.env.RISK_NEW_PAYEE_LIMIT ?? '5000000'),
    velocityCount: int(process.env.RISK_VELOCITY_COUNT, 10),
    velocityWindowMinutes: int(process.env.RISK_VELOCITY_WINDOW_MINUTES, 10),
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    fromEmail: process.env.RESEND_FROM_EMAIL ?? 'noreply@vireofinance.com',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL ?? 'gemini-1.5-pro',
  },
  googlePlay: {
    integrityApiKey: process.env.GOOGLE_PLAY_INTEGRITY_API_KEY ?? '',
  },
});
