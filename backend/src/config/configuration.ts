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
    /** Write each OTP to the server log until SMS delivery exists. Never enable in production. */
    logCode: boolean;
  };
  challenge: {
    ttlSeconds: number;
  };
  admin: {
    phones: string[];
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
  merchantLimits: {
    /** Daily cash-out cap per business verification level (minor units). */
    cashoutDailyLimits: Record<number, bigint>;
  };
  risk: {
    tierDailyLimits: Record<number, bigint>;
    singleTransferLimit: bigint;
    newPayeeLimit: bigint;
    velocityCount: number;
    velocityWindowMinutes: number;
  };
  openai: {
    apiKey: string;
    model: string;
  };
  logging: {
    /** Log redacted HTTP request bodies. Development only. */
    httpBodies: boolean;
    /** Log full OpenAI request/response payloads. Development only. */
    llmPayloads: boolean;
  };
  biometrics: {
    /** Name of the configured biometric vendor adapter; empty means biometrics are disabled. */
    provider: string;
    /** Base64 AES-256 key that encrypts stored biometric templates. */
    encryptionKey: string;
    didit: { apiKey: string; baseUrl: string; keyType: string; timeoutMs: number };
  };
  kyc: {
    /** Name of the BVN verification vendor; empty disables automatic BVN checks. */
    provider: string;
    /** Base64 AES-256 key that encrypts stored BVNs (also keys the BVN uniqueness hash). */
    encryptionKey: string;
  };
  notifications: {
    sms?: {
      enabled?: boolean;
      gatewayUrl?: string;
      apiKey?: string;
      senderId?: string;
    };
    push?: {
      enabled?: boolean;
    };
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
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  otp: {
    ttlSeconds: int(process.env.OTP_TTL_SECONDS, 300),
    logCode: bool(process.env.OTP_LOG_CODE, false),
  },
  challenge: {
    ttlSeconds: int(process.env.CHALLENGE_TTL_SECONDS, 120),
  },
  admin: {
    phones: (process.env.ADMIN_PHONES ?? '')
      .split(',')
      .map((phone) => phone.trim())
      .filter((phone) => phone.length > 0),
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
  merchantLimits: {
    cashoutDailyLimits: {
      1: BigInt(process.env.MERCHANT_LEVEL1_CASHOUT_DAILY_LIMIT ?? '20000000'),
      2: BigInt(process.env.MERCHANT_LEVEL2_CASHOUT_DAILY_LIMIT ?? '500000000'),
    },
  },
  risk: {
    tierDailyLimits: {
      0: BigInt(process.env.RISK_TIER0_DAILY_LIMIT ?? '2000000'),
      1: BigInt(process.env.RISK_TIER1_DAILY_LIMIT ?? '5000000'),
      2: BigInt(process.env.RISK_TIER2_DAILY_LIMIT ?? '20000000'),
      3: BigInt(process.env.RISK_TIER3_DAILY_LIMIT ?? '500000000'),
    },
    singleTransferLimit: BigInt(process.env.RISK_SINGLE_TRANSFER_LIMIT ?? '10000000'),
    newPayeeLimit: BigInt(process.env.RISK_NEW_PAYEE_LIMIT ?? '5000000'),
    velocityCount: int(process.env.RISK_VELOCITY_COUNT, 10),
    velocityWindowMinutes: int(process.env.RISK_VELOCITY_WINDOW_MINUTES, 10),
  },
  logging: {
    httpBodies: bool(process.env.LOG_HTTP_BODIES, false),
    llmPayloads: bool(process.env.LOG_LLM_PAYLOADS, false),
  },
  kyc: {
    provider: (process.env.KYC_PROVIDER ?? '').trim().toLowerCase(),
    encryptionKey: process.env.KYC_ENCRYPTION_KEY ?? '',
  },
  biometrics: {
    provider: (process.env.BIOMETRIC_PROVIDER ?? '').trim().toLowerCase(),
    encryptionKey: process.env.BIOMETRIC_ENCRYPTION_KEY ?? '',
    didit: {
      apiKey: process.env.DIDIT_API_KEY ?? '',
      baseUrl: (process.env.DIDIT_BASE_URL ?? 'https://verification.didit.me/v3').replace(
        /\/+$/,
        '',
      ),
      keyType: (process.env.DIDIT_KEY_TYPE ?? '').trim().toLowerCase(),
      timeoutMs: parseInt(process.env.DIDIT_TIMEOUT_MS ?? '15000', 10),
    },
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  },
  notifications: {
    sms: {
      enabled: bool(process.env.NOTIFICATIONS_SMS_ENABLED, false),
      gatewayUrl: process.env.NOTIFICATIONS_SMS_GATEWAY_URL ?? undefined,
      apiKey: process.env.NOTIFICATIONS_SMS_API_KEY ?? undefined,
      senderId: process.env.NOTIFICATIONS_SMS_SENDER_ID ?? undefined,
    },
    push: {
      enabled: bool(process.env.NOTIFICATIONS_PUSH_ENABLED, false),
    },
  },
});
