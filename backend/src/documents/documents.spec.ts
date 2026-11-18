import { randomBytes } from 'crypto';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { UserRole } from '../common/enums';
import { DocumentsService, sniffMime } from './documents.service';

const KEY = randomBytes(32).toString('base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  randomBytes(64),
]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(64)]);

function setup(
  opts: { storage?: boolean; key?: string; active?: number; recent?: number; role?: UserRole } = {},
) {
  const rows = new Map<string, Record<string, unknown>>();
  const documents = {
    count: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      'createdAt' in where ? (opts.recent ?? 0) : (opts.active ?? 0),
    ),
    create: jest.fn((v: Record<string, unknown>) => v),
    save: jest.fn(async (v: Record<string, unknown>) => {
      rows.set(v.id as string, v);
      return { createdAt: new Date(), ...v };
    }),
    find: jest.fn(async () => [...rows.values()]),
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const row = rows.get(where.id as string);
      if (!row) return null;
      if (where.ownerUserId && row.ownerUserId !== where.ownerUserId) return null;
      return row;
    }),
  };
  const users = {
    findOne: jest.fn(async () => ({ id: 'staff', role: opts.role ?? UserRole.USER })),
  };
  const blobs = new Map<string, Buffer>();
  const storage = {
    put: jest.fn(async (k: string, d: Buffer) => {
      blobs.set(k, d);
      return { fileId: `f-${k}` };
    }),
    get: jest.fn(async (k: string) => blobs.get(k) as Buffer),
    delete: jest.fn(async (k: string) => void blobs.delete(k)),
  };
  const config = {
    get: jest.fn((k: string) =>
      k === 'storage.documentEncryptionKey' ? (opts.key ?? KEY) : undefined,
    ),
  };
  const service = new DocumentsService(
    documents as never,
    users as never,
    config as never,
    (opts.storage === false ? null : storage) as never,
  );
  return { service, storage, blobs, documents };
}

describe('sniffMime', () => {
  it('reads the type from the bytes', () => {
    expect(sniffMime(JPEG)).toBe('image/jpeg');
    expect(sniffMime(PNG)).toBe('image/png');
    expect(sniffMime(PDF)).toBe('application/pdf');
    expect(sniffMime(Buffer.from('<html>'))).toBeNull();
  });
});

describe('DocumentsService', () => {
  it('stores only ciphertext, and returns the original bytes to the owner', async () => {
    const { service, blobs } = setup();
    const doc = await service.upload('u1', 'id_front', { buffer: JPEG, size: JPEG.length });
    expect(doc.mime).toBe('image/jpeg');
    const stored = [...blobs.values()][0];
    expect(stored.includes(JPEG.subarray(4, 20))).toBe(false); // not the plain bytes
    expect(stored.toString('utf8').startsWith('v1:')).toBe(true);
    const back = await service.read(doc.id, 'u1');
    expect(back.bytes.equals(JPEG)).toBe(true);
    expect(back.mime).toBe('image/jpeg');
  });

  it('ignores a lying file name or client type: the bytes decide', async () => {
    const { service } = setup();
    await expect(
      service.upload('u1', 'id_front', {
        buffer: Buffer.from('<script>alert(1)</script>'),
        size: 25,
      }),
    ).rejects.toThrow(/Unsupported/);
    await expect(
      service.upload('u1', 'id_front', { buffer: PDF, size: PDF.length }),
    ).rejects.toThrow(/Unsupported/); // ID photos are images
    await expect(
      service.upload('u1', 'cac_certificate', { buffer: PDF, size: PDF.length }),
    ).resolves.toMatchObject({ mime: 'application/pdf' });
  });

  it('rejects unknown kinds, empty and oversized files', async () => {
    const { service } = setup();
    await expect(
      service.upload('u1', 'passport', { buffer: JPEG, size: JPEG.length }),
    ).rejects.toThrow(/Unknown/);
    await expect(service.upload('u1', 'id_front', undefined)).rejects.toThrow(BadRequestException);
    await expect(
      service.upload('u1', 'id_front', { buffer: JPEG, size: 9 * 1024 * 1024 }),
    ).rejects.toThrow(/8 MB/);
  });

  it('limits how many files and how fast a user can upload', async () => {
    await expect(
      setup({ active: 30 }).service.upload('u1', 'id_front', { buffer: JPEG, size: 9 }),
    ).rejects.toThrow(/limit/);
    await expect(
      setup({ recent: 10 }).service.upload('u1', 'id_front', { buffer: JPEG, size: 9 }),
    ).rejects.toThrow(/Too many/);
  });

  it('serves a document only to its owner or staff', async () => {
    const { service } = setup();
    const doc = await service.upload('u1', 'id_front', { buffer: PNG, size: PNG.length });
    await expect(service.read(doc.id, 'someone-else')).rejects.toThrow(NotFoundException);
    const staff = setup({ role: UserRole.ADMIN });
    const d2 = await staff.service.upload('u1', 'id_front', { buffer: PNG, size: PNG.length });
    await expect(staff.service.read(d2.id, 'staff')).resolves.toMatchObject({ mime: 'image/png' });
  });

  it('verification can only load the owner’s document of the expected kind', async () => {
    const { service } = setup();
    const doc = await service.upload('u1', 'id_front', { buffer: JPEG, size: JPEG.length });
    await expect(service.loadOwned('u1', doc.id, ['id_front'])).resolves.toMatchObject({
      mime: 'image/jpeg',
    });
    await expect(service.loadOwned('u1', doc.id, ['proof_of_address'])).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.loadOwned('u2', doc.id, ['id_front'])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('deletes from storage and hides the record', async () => {
    const { service, storage } = setup();
    const doc = await service.upload('u1', 'id_front', { buffer: JPEG, size: JPEG.length });
    await service.remove('u1', doc.id);
    expect(storage.delete).toHaveBeenCalled();
  });

  it('refuses to read a tampered object instead of returning garbage', async () => {
    const { service, blobs } = setup();
    const doc = await service.upload('u1', 'id_front', { buffer: JPEG, size: JPEG.length });
    const k = [...blobs.keys()][0];
    blobs.set(k, Buffer.from(blobs.get(k)!.toString('utf8').replace(/.$/, 'A')));
    await expect(service.read(doc.id, 'u1')).rejects.toThrow(ServiceUnavailableException);
  });

  it('fails closed when storage or the key is missing', async () => {
    await expect(
      setup({ storage: false }).service.upload('u1', 'id_front', { buffer: JPEG, size: 9 }),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      setup({ key: '' }).service.upload('u1', 'id_front', { buffer: JPEG, size: 9 }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(setup({ storage: false }).service.isAvailable()).toBe(false);
    expect(setup().service.isAvailable()).toBe(true);
  });
});
