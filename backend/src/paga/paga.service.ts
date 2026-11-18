import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { safeEqual, sha512Hex } from '../common/crypto';
import { formatMinor } from '../database/money';
import {
  CreateVirtualAccountInput,
  DepositToBankInput,
  PagaBank,
  PagaTransferResult,
  PaymentRequestInput,
  PaymentRequestResult,
  RegisterCustomerIdentificationInput,
  RegisterCustomerIdentificationResult,
  RegisterCustomerInput,
  RegisterCustomerResult,
  ValidateBankAccountInput,
  ValidateBankAccountResult,
  VirtualAccountResult,
} from './paga.types';

export type IncomingHeaders = Record<string, string | string[] | undefined>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BANK_CACHE_MS = 24 * 60 * 60 * 1000;
/** After a failed fetch, don't hit Paga again for this long (avoids 429 storms). */
const BANK_FAILURE_COOLDOWN_MS = 30 * 1000;

class PagaApiError extends Error {
  constructor(
    message: string,
    readonly raw: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PagaApiError';
  }
}

@Injectable()
export class PagaService {
  private readonly logger = new Logger(PagaService.name);
  private bankCache: { fetchedAt: number; banks: PagaBank[] } | null = null;
  private bankInflight: Promise<PagaBank[]> | null = null;
  private bankFailure: { at: number; error: unknown } | null = null;

  constructor(private readonly config: ConfigService) {}

  async createVirtualAccount(input: CreateVirtualAccountInput): Promise<VirtualAccountResult> {
    const referenceId = input.referenceId ?? input.userId;
    const referenceNumber = `va_${referenceId}`;
    const accountReference = toAccountReference(referenceId);
    const { firstName, lastName } = splitName(input.name);
    const callbackUrl = this.callbackUrl();

    const raw = await this.collect(
      'registerPersistentPaymentAccount',
      {
        referenceNumber,
        accountReference,
        accountName: input.name,
        firstName,
        lastName,
        phoneNumber: input.phone,
        callbackUrl,
      },
      [referenceNumber, accountReference, '', '', '', callbackUrl],
    );

    const accountNumber = String(raw.accountNumber ?? '');
    if (!accountNumber) {
      throw new BadGatewayException('Paga did not return a persistent account number');
    }

    this.logger.log(`Virtual account created for ${referenceNumber}`);

    return {
      accountNumber,
      bankName: 'Paga',
      providerReference: String(raw.accountReference ?? accountReference),
    };
  }

  async validateBankAccount(input: ValidateBankAccountInput): Promise<ValidateBankAccountResult> {
    const amount = formatMinor(input.amountMinor);
    const bankUuid = await this.resolveBankUuid(input.bankCode);

    try {
      const raw = await this.business(
        'validateDepositToBank',
        {
          referenceNumber: input.reference,
          amount,
          currency: 'NGN',
          destinationBankUUID: bankUuid,
          destinationBankAccountNumber: input.accountNumber,
        },
        [input.reference, amount, bankUuid, input.accountNumber],
      );

      const accountName = String(raw.destinationAccountHolderNameAtBank ?? '');
      if (!accountName) {
        throw new BadRequestException(
          `Could not validate bank account: ${String(raw.message ?? 'unknown error')}`,
        );
      }

      return {
        accountName,
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
        bankUuid,
      };
    } catch (error) {
      if (error instanceof PagaApiError) {
        // 139 is OUR Paga wallet being short of funds (Paga prices the lookup against it):
        // not the user's mistake, and not something to show them. Surfaces as a generic 502.
        if (String(error.raw.responseCode) === '139') {
          this.logger.error('Paga business wallet has insufficient balance for the account lookup');
          throw new BadGatewayException('Paga business wallet is out of funds');
        }
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async depositToBank(input: DepositToBankInput): Promise<PagaTransferResult> {
    const amount = formatMinor(input.amountMinor);
    const bankUuid = input.bankUuid ?? (await this.resolveBankUuid(input.bankCode ?? ''));

    const body: Record<string, unknown> = {
      referenceNumber: input.reference,
      amount,
      currency: 'NGN',
      destinationBankUUID: bankUuid,
      destinationBankAccountNumber: input.accountNumber,
      statusCallbackUrl: input.callbackUrl ?? this.callbackUrl(),
      remarks: input.narration ?? 'Vireo transfer',
    };
    if (input.accountName) {
      body.recipientName = input.accountName;
    }

    try {
      const raw = await this.business('depositToBank', body, [
        input.reference,
        amount,
        bankUuid,
        input.accountNumber,
      ]);

      const status = statusFromDeposit(raw);
      return {
        status,
        providerReference: String(raw.transactionId ?? input.reference),
        ...(status === 'failed'
          ? { failureReason: String(raw.message ?? 'Paga rejected the payout') }
          : {}),
        raw,
      };
    } catch (error) {
      if (error instanceof PagaApiError) {
        return {
          status: 'failed',
          providerReference: input.reference,
          failureReason: error.message,
          raw: error.raw,
        };
      }
      throw error;
    }
  }

  async getOperationStatus(reference: string): Promise<PagaTransferResult> {
    try {
      const raw = await this.business('getOperationStatus', { referenceNumber: reference }, [
        reference,
      ]);
      return {
        status: statusFromOperation(raw),
        providerReference: String(raw.transactionId ?? reference),
        raw,
      };
    } catch (error) {
      if (error instanceof PagaApiError) {
        return { status: 'pending', providerReference: reference, raw: error.raw };
      }
      throw error;
    }
  }

  async createPaymentRequest(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const amount = formatMinor(input.amountMinor);
    const callbackUrl = input.callbackUrl ?? this.callbackUrl();
    const payerPhone = input.payerPhone ?? '';
    const payerEmail = input.payerEmail ?? '';
    const paymentMethods = input.paymentMethods ?? ['BANK_TRANSFER'];

    const raw = await this.collect(
      'paymentRequest',
      {
        referenceNumber: input.reference,
        amount,
        currency: 'NGN',
        payer: {
          name: input.payerName ?? 'Vireo customer',
          phoneNumber: payerPhone || undefined,
          email: payerEmail || undefined,
        },
        payee: { name: 'Vireo Finance' },
        isSuppressMessages: true,
        payerCollectionFeeShare: 1,
        payeeCollectionFeeShare: 0,
        callBackUrl: callbackUrl,
        paymentMethods,
      },
      [input.reference, amount, 'NGN', payerPhone, payerEmail, '', '', '', ''],
    );

    return {
      referenceNumber: String(raw.referenceNumber ?? input.reference),
      statusCode: String(raw.statusCode ?? ''),
      statusMessage: String(raw.statusMessage ?? ''),
      paymentMethods: Array.isArray(raw.paymentMethods) ? raw.paymentMethods : [],
      raw,
    };
  }

  async registerCustomer(input: RegisterCustomerInput): Promise<RegisterCustomerResult> {
    const email = input.customerEmail ?? '';
    const dob = input.customerDateOfBirth ?? '';
    try {
      const raw = await this.business(
        'registerCustomer',
        {
          referenceNumber: input.referenceNumber,
          customerFirstName: input.customerFirstName,
          customerLastName: input.customerLastName,
          customerPhoneNumber: input.customerPhoneNumber,
          customerEmail: email || undefined,
          customerDateOfBirth: dob || undefined,
        },
        [
          input.referenceNumber,
          input.customerFirstName,
          input.customerLastName,
          input.customerPhoneNumber,
          email,
          dob,
        ],
      );

      return {
        responseCode: String(raw.responseCode ?? '0'),
        message: String(raw.message ?? 'Success'),
        referenceNumber: String(raw.referenceNumber ?? input.referenceNumber),
        raw,
      };
    } catch (error) {
      if (error instanceof PagaApiError) {
        this.logger.warn(`Paga registerCustomer reported: ${error.message}`);
        return {
          responseCode: String(error.raw.responseCode ?? '1'),
          message: error.message,
          referenceNumber: input.referenceNumber,
          raw: error.raw,
        };
      }
      throw error;
    }
  }

  async registerCustomerIdentification(
    input: RegisterCustomerIdentificationInput,
  ): Promise<RegisterCustomerIdentificationResult> {
    const idNumber = input.customerIdNumber ?? '';
    const expiry = input.customerIdExpirationDate ?? '';

    try {
      const raw = await this.business(
        'registerCustomerIdentification',
        {
          referenceNumber: input.referenceNumber,
          customerPhoneNumber: input.customerPhoneNumber,
          customerIdType: input.customerIdType,
          customerIdNumber: idNumber || undefined,
          customerIdExpirationDate: expiry || undefined,
          ...(input.customerIdPhoto ? { customerIdPhoto: input.customerIdPhoto } : {}),
        },
        [input.referenceNumber, input.customerPhoneNumber, input.customerIdType, idNumber, expiry],
      );

      return {
        responseCode: String(raw.responseCode ?? '0'),
        message: String(raw.message ?? 'Success'),
        referenceNumber: String(raw.referenceNumber ?? input.referenceNumber),
        raw,
      };
    } catch (error) {
      if (error instanceof PagaApiError) {
        this.logger.warn(`Paga registerCustomerIdentification reported: ${error.message}`);
        return {
          responseCode: String(error.raw.responseCode ?? '1'),
          message: error.message,
          referenceNumber: input.referenceNumber,
          raw: error.raw,
        };
      }
      throw error;
    }
  }

  async resolveBankUuid(bankCode: string): Promise<string> {
    const trimmed = bankCode.trim();
    if (UUID_PATTERN.test(trimmed)) {
      return trimmed;
    }
    if (!trimmed) {
      throw new BadRequestException('A bank code is required');
    }

    const banks = await this.listBanks();
    const needle = trimmed.toLowerCase();
    const match = banks.find(
      (bank) =>
        bank.sortCode === trimmed ||
        bank.uuid.toLowerCase() === needle ||
        bank.name.toLowerCase() === needle,
    );
    if (!match) {
      throw new BadRequestException(`Unsupported bank code: ${bankCode}`);
    }
    return match.uuid;
  }

  /**
   * Paga callbacks are not HMAC-signed over the raw body. They carry a SHA-512
   * hash over documented fields plus the shared hash key, either in the body
   * (`hash`) or in `x-paga-hash` with `x-paga-hash-parameters`.
   */
  verifyCallback(headers: IncomingHeaders, body: Record<string, unknown>): boolean {
    const hashKey = this.hashKeyOrEmpty();
    if (!hashKey) {
      return false;
    }

    const headerHash = headerValue(headers, 'x-paga-hash');
    const paramsHeader = headerValue(headers, 'x-paga-hash-parameters');
    if (headerHash && paramsHeader) {
      const fields = paramsHeader
        .split(',')
        .map((field) => field.trim())
        .filter((field) => field.length > 0 && field !== 'hashKey');
      const expected = pagaHash(
        fields.map((field) => valueToString(body[field])),
        hashKey,
      );
      if (safeEqual(expected, headerHash.trim())) {
        return true;
      }
    }

    const bodyHash = typeof body.hash === 'string' ? body.hash.trim() : '';
    if (!bodyHash) {
      return false;
    }

    const candidates: string[] = [];

    if (body.accountNumber !== undefined) {
      candidates.push(
        pagaHash(
          [
            valueToString(body.statusCode),
            valueToString(body.accountNumber),
            valueToString(body.amount),
            valueToString(body.clearingFeeAmount),
            valueToString(body.transferFeeAmount),
          ],
          hashKey,
        ),
      );
    }

    if (body.notificationId !== undefined) {
      candidates.push(
        pagaHash(
          [
            valueToString(body.notificationId),
            valueToString(body.statusCode),
            valueToString(body.externalReferenceNumber),
            valueToString(body.state),
            body.outstandingBalance === undefined || body.outstandingBalance === null
              ? ''
              : Number(body.outstandingBalance).toFixed(2),
          ],
          hashKey,
        ),
      );
    }

    if (body.paymentReference !== undefined) {
      candidates.push(
        pagaHash(
          [
            valueToString(body.amount),
            valueToString(body.timeStamp),
            valueToString(body.paymentReference),
          ],
          hashKey,
        ),
      );
    }

    return candidates.some((candidate) => safeEqual(candidate, bodyHash));
  }

  async listBanks(): Promise<PagaBank[]> {
    if (this.bankCache && Date.now() - this.bankCache.fetchedAt < BANK_CACHE_MS) {
      return this.bankCache.banks;
    }
    // Replay a recent failure instead of calling Paga again.
    if (this.bankFailure && Date.now() - this.bankFailure.at < BANK_FAILURE_COOLDOWN_MS) {
      throw this.bankFailure.error;
    }
    // Concurrent callers share one upstream request.
    if (!this.bankInflight) {
      this.bankInflight = this.fetchBanks()
        .then((banks) => {
          this.bankFailure = null;
          return banks;
        })
        .catch((error) => {
          this.bankFailure = { at: Date.now(), error };
          throw error;
        })
        .finally(() => {
          this.bankInflight = null;
        });
    }
    return this.bankInflight;
  }

  private async fetchBanks(): Promise<PagaBank[]> {
    const reference = newReference('banks');
    // The Business API's own bank list: its ids are the ones its transfer and account-lookup calls expect.
    const raw = await this.business('getBanks', { referenceNumber: reference }, [reference]);
    const banks = Array.isArray(raw.banks)
      ? raw.banks
          .map((entry) => asRecord(entry))
          .map((entry) => ({
            name: String(entry.name ?? ''),
            uuid: String(entry.uuid ?? ''),
            sortCode:
              entry.sortCode === undefined || entry.sortCode === null
                ? undefined
                : String(entry.sortCode),
            ussdCode:
              entry.ussdCode === undefined || entry.ussdCode === null
                ? undefined
                : String(entry.ussdCode),
          }))
          .filter((bank) => bank.uuid.length > 0)
      : [];

    this.bankCache = { fetchedAt: Date.now(), banks };
    return banks;
  }

  private async business(
    operation: string,
    body: Record<string, unknown>,
    hashValues: string[],
  ): Promise<Record<string, unknown>> {
    const raw = await this.send('business', operation, body, {
      'content-type': 'application/json',
      principal: this.required('paga.apiKey'),
      credentials: this.required('paga.apiSecret'),
      hash: pagaHash(hashValues, this.requiredHashKey()),
    });

    const code = String(raw.responseCode ?? '');
    if (code !== '0') {
      throw new PagaApiError(
        String(raw.message ?? `Paga ${operation} failed (responseCode ${code || 'missing'})`),
        raw,
      );
    }
    return raw;
  }

  private async collect(
    operation: string,
    body: Record<string, unknown>,
    hashValues: string[],
  ): Promise<Record<string, unknown>> {
    const credentials = Buffer.from(
      `${this.required('paga.apiKey')}:${this.required('paga.apiSecret')}`,
    ).toString('base64');

    const hashKey = this.requiredHashKey();
    const hash = pagaHash(hashValues, hashKey);

    const raw = await this.send('collect', operation, body, {
      'content-type': 'application/json',
      authorization: `Basic ${credentials}`,
      hash,
    });

    const code = String(raw.statusCode ?? '');
    if (code !== '0') {
      throw new PagaApiError(
        String(raw.statusMessage ?? `Paga ${operation} failed (statusCode ${code || 'missing'})`),
        raw,
      );
    }
    return raw;
  }

  private async send(
    api: 'business' | 'collect',
    operation: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const baseUrl = (this.config.get<string>(`paga.${api}BaseUrl`) ?? '').replace(/\/+$/, '');
    if (!baseUrl) {
      throw new BadGatewayException(`Paga ${api} base URL is not configured`);
    }

    const url = `${baseUrl}/${operation}`;

    // CRITICAL: Paga Collect API requires Accept-Language: en header.
    // Node's fetch sends Accept-Language: * by default, which causes HTTP 500 "system error".
    // See: https://paga-slack-thread (Sherif-deen Abdur-roheem resolution)
    const requestHeaders: Record<string, string> = {
      ...headers,
      'accept-language': 'en',
    };

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.logger.error(
        `Paga ${api} ${operation} network error after ${Date.now() - started}ms: ${String(error)}`,
      );
      throw new BadGatewayException('Paga request failed');
    }

    const text = await response.text();
    const elapsed = Date.now() - started;

    // Status and timing only: requests carry the API credentials, and bodies carry account numbers and names.
    this.logger.log(`Paga ${api} ${operation} -> ${response.status} ${elapsed}ms`);

    if (!response.ok) {
      let detail = text;
      try {
        const parsed = asRecord(JSON.parse(text));
        detail = String(parsed.message ?? parsed.statusMessage ?? parsed.error ?? text);
      } catch {
        // keep the raw body
      }
      this.logger.error(
        `Paga ${api} ${operation} failed: ${response.status} ${text.slice(0, 300)}`,
      );
      throw new BadGatewayException(
        `Paga ${api} ${operation} failed (${response.status}): ${detail || 'unknown error'}`,
      );
    }
    if (!text) {
      return {};
    }
    try {
      return asRecord(JSON.parse(text));
    } catch {
      return { message: text };
    }
  }

  private required(name: string): string {
    const value = this.config.get<string>(name) ?? '';
    if (!value) {
      throw new BadGatewayException(`Paga configuration is missing ${name}`);
    }
    return value;
  }

  private requiredHashKey(): string {
    const key = this.hashKeyOrEmpty();
    if (!key) {
      throw new BadGatewayException('Paga hash key is not configured');
    }
    return key;
  }

  private hashKeyOrEmpty(): string {
    return (
      (this.config.get<string>('paga.hashKey') ?? '').trim() ||
      (this.config.get<string>('paga.webhookSecret') ?? '').trim()
    );
  }

  private callbackUrl(): string {
    const base = (this.config.get<string>('appBaseUrl') ?? '').replace(/\/+$/, '');
    if (!base) {
      throw new BadGatewayException('APP_BASE_URL is not configured');
    }
    return `${base}/api/v1/webhooks/paga`;
  }
}

function pagaHash(values: string[], hashKey: string): string {
  return sha512Hex(values.join('') + hashKey);
}

function valueToString(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

function headerValue(headers: IncomingHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function statusFromDeposit(raw: Record<string, unknown>): 'pending' | 'completed' | 'failed' {
  if (String(raw.responseCode ?? '') !== '0') return 'failed';
  return statusFromText(raw.transactionStatus);
}

function statusFromOperation(raw: Record<string, unknown>): 'pending' | 'completed' | 'failed' {
  return statusFromText(raw.transactionStatus);
}

export function statusFromText(value: unknown): 'pending' | 'completed' | 'failed' {
  const status = String(value ?? '').toUpperCase();
  if (['SUCCESSFUL', 'SUCCESS', 'COMPLETED', 'COMPLETE'].includes(status)) return 'completed';
  if (['FAILED', 'FAILURE', 'REVERSED', 'CANCELLED'].includes(status)) return 'failed';
  return 'pending';
}

function toAccountReference(userId: string): string {
  const compact = userId.replace(/-/g, '');
  return `acct_${compact.slice(0, 25)}`;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? 'Vireo';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : firstName;
  return { firstName, lastName };
}

function newReference(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
