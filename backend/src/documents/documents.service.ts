import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { UserRole } from '../common/enums';
import { decryptEmbedding, encryptEmbedding, parseEncryptionKey } from '../common/crypto';
import { OBJECT_STORAGE, ObjectStorage } from '../storage/object-storage';
import { User } from '../users/user.entity';
import { DOCUMENT_KINDS, Document, DocumentKind } from './document.entity';

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_ACTIVE_DOCUMENTS = 30;
const MAX_UPLOADS_PER_HOUR = 10;

const ALLOWED_MIME: Record<DocumentKind, string[]> = {
  id_front: ['image/jpeg', 'image/png'],
  id_back: ['image/jpeg', 'image/png'],
  proof_of_address: ['image/jpeg', 'image/png', 'application/pdf'],
  cac_certificate: ['image/jpeg', 'image/png', 'application/pdf'],
};

export interface UploadedFile {
  buffer: Buffer;
  size: number;
}

/** File type from the first bytes. The client's claimed type and file name are ignored. */
export function sniffMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-')
    return 'application/pdf';
  return null;
}

/**
 * Identity and business documents. Files are encrypted (AES-256-GCM, bound to
 * the document id) before they reach the object store, and are only returned
 * by this service after an ownership / staff check. Storage locations are
 * never exposed to clients.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
    @Optional() @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage | null,
  ) {}

  private key(): Buffer {
    try {
      return parseEncryptionKey(this.config.get<string>('storage.documentEncryptionKey') ?? '');
    } catch {
      throw new ServiceUnavailableException('Document storage is not available yet');
    }
  }

  private store(): ObjectStorage {
    if (!this.storage)
      throw new ServiceUnavailableException('Document storage is not available yet');
    return this.storage;
  }

  /** Whether uploads can work on this server (for clients to say so up front). */
  isAvailable(): boolean {
    try {
      this.key();
      return !!this.storage;
    } catch {
      return false;
    }
  }

  async upload(userId: string, kind: string, file: UploadedFile | undefined) {
    const storage = this.store();
    const key = this.key();
    if (!(DOCUMENT_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException('Unknown document type');
    }
    if (!file || file.size === 0) throw new BadRequestException('Attach a file');
    if (file.size > MAX_DOCUMENT_BYTES) throw new BadRequestException('File is larger than 8 MB');

    const mime = sniffMime(file.buffer);
    if (!mime || !ALLOWED_MIME[kind as DocumentKind].includes(mime)) {
      throw new BadRequestException(
        'Unsupported file. Use a JPG or PNG photo, or a PDF where allowed.',
      );
    }

    const active = await this.documents.count({
      where: { ownerUserId: userId, deletedAt: IsNull() },
    });
    if (active >= MAX_ACTIVE_DOCUMENTS) {
      throw new BadRequestException('You have reached the document limit. Remove one first.');
    }
    const recent = await this.documents.count({
      where: { ownerUserId: userId, createdAt: MoreThan(new Date(Date.now() - 60 * 60 * 1000)) },
    });
    if (recent >= MAX_UPLOADS_PER_HOUR) {
      throw new HttpException('Too many uploads. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const id = randomUUID();
    const objectKey = `docs/${userId}/${id}`;
    const sealed = Buffer.from(encryptEmbedding(file.buffer.toString('base64'), key, id), 'utf8');
    const stored = await storage.put(objectKey, sealed, 'application/octet-stream');

    try {
      const saved = await this.documents.save(
        this.documents.create({
          id,
          ownerUserId: userId,
          kind,
          mime,
          size: file.size,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          objectKey,
          storageFileId: stored.fileId,
          deletedAt: null,
        }),
      );
      return present(saved);
    } catch (error) {
      // Do not leave an orphaned encrypted file behind.
      await storage.delete(objectKey, stored.fileId).catch(() => undefined);
      throw error;
    }
  }

  async list(userId: string) {
    const docs = await this.documents.find({
      where: { ownerUserId: userId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return docs.map(present);
  }

  /** The decrypted file for its owner, or for staff (every staff read is logged). */
  async read(documentId: string, requesterId: string): Promise<{ bytes: Buffer; mime: string }> {
    const doc = await this.documents.findOne({ where: { id: documentId, deletedAt: IsNull() } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.ownerUserId !== requesterId) {
      const requester = await this.users.findOne({ where: { id: requesterId } });
      if (!requester || requester.role !== UserRole.ADMIN) {
        // Same answer as "missing", so ids cannot be probed.
        throw new NotFoundException('Document not found');
      }
      this.logger.warn(
        `staff ${requesterId} viewed document ${doc.id} (${doc.kind}) of user ${doc.ownerUserId}`,
      );
    }
    return { bytes: await this.decrypt(doc), mime: doc.mime };
  }

  /** For verification: only the owner's own document, and only of the expected kinds. */
  async loadOwned(
    userId: string,
    documentId: string,
    kinds: DocumentKind[],
  ): Promise<{ bytes: Buffer; mime: string }> {
    const doc = await this.documents.findOne({
      where: { id: documentId, ownerUserId: userId, deletedAt: IsNull() },
    });
    if (!doc || !kinds.includes(doc.kind as DocumentKind)) {
      throw new BadRequestException('That document is not available. Upload it again.');
    }
    return { bytes: await this.decrypt(doc), mime: doc.mime };
  }

  async remove(userId: string, documentId: string): Promise<void> {
    const doc = await this.documents.findOne({
      where: { id: documentId, ownerUserId: userId, deletedAt: IsNull() },
    });
    if (!doc) throw new NotFoundException('Document not found');
    await this.store().delete(doc.objectKey, doc.storageFileId);
    doc.deletedAt = new Date();
    await this.documents.save(doc);
  }

  private async decrypt(doc: Document): Promise<Buffer> {
    const sealed = (await this.store().get(doc.objectKey)).toString('utf8');
    try {
      return Buffer.from(decryptEmbedding(sealed, this.key(), doc.id), 'base64');
    } catch {
      this.logger.error(`Document ${doc.id} could not be decrypted (wrong key or tampered)`);
      throw new ServiceUnavailableException('Document storage is not available right now');
    }
  }
}

function present(d: Document) {
  return { id: d.id, kind: d.kind, mime: d.mime, size: d.size, createdAt: d.createdAt };
}
