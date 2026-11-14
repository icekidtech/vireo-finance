import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ChallengeStatus, ChallengeType, DeviceStatus } from '../common/enums';
import { canonicalJson, randomNonce, sha256Hex, verifyDeviceSignature } from '../common/crypto';
import { Device } from '../auth/device.entity';
import { Challenge } from './challenge.entity';

export interface IssueChallengeInput {
  userId: string;
  deviceId: string;
  type: ChallengeType;
  payload: Record<string, unknown>;
}

export interface ConsumeChallengeInput {
  challengeId: string;
  userId: string;
  type: ChallengeType;
  expectedPayload: Record<string, unknown>;
  signature: string;
}

@Injectable()
export class ChallengesService {
  constructor(
    @InjectRepository(Challenge) private readonly challenges: Repository<Challenge>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly config: ConfigService,
  ) {}

  async issue(input: IssueChallengeInput): Promise<Challenge> {
    const device = await this.devices.findOne({
      where: { id: input.deviceId, userId: input.userId },
    });
    if (!device || device.status !== DeviceStatus.ACTIVE) {
      throw new ForbiddenException('Device is not registered or has been revoked');
    }

    const ttl = this.config.get<number>('challenge.ttlSeconds') ?? 120;
    const payloadHash = sha256Hex(canonicalJson(input.payload));
    return this.challenges.save(
      this.challenges.create({
        userId: input.userId,
        deviceId: input.deviceId,
        type: input.type,
        nonce: randomNonce(),
        payload: input.payload,
        payloadHash,
        status: ChallengeStatus.PENDING,
        expiresAt: new Date(Date.now() + ttl * 1000),
      }),
    );
  }

  async consume(manager: EntityManager, input: ConsumeChallengeInput): Promise<Challenge> {
    const challenge = await manager.getRepository(Challenge).findOne({
      where: { id: input.challengeId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }
    if (challenge.userId !== input.userId) {
      throw new ForbiddenException('Challenge does not belong to this user');
    }
    if (challenge.type !== input.type) {
      throw new BadRequestException('Challenge type mismatch');
    }
    if (challenge.status !== ChallengeStatus.PENDING) {
      throw new BadRequestException('Challenge has already been used');
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      challenge.status = ChallengeStatus.EXPIRED;
      await manager.getRepository(Challenge).save(challenge);
      throw new BadRequestException('Challenge has expired');
    }

    const expectedHash = sha256Hex(canonicalJson(input.expectedPayload));
    if (expectedHash !== challenge.payloadHash) {
      throw new BadRequestException('Challenge payload does not match the requested action');
    }

    const device = await manager.getRepository(Device).findOne({
      where: { id: challenge.deviceId, userId: input.userId },
    });
    if (!device || device.status !== DeviceStatus.ACTIVE) {
      throw new ForbiddenException('Device is not registered or has been revoked');
    }

    const valid = verifyDeviceSignature({
      algorithm: device.algorithm,
      publicKeyBase64: device.publicKey,
      data: Buffer.from(challenge.payloadHash, 'utf8'),
      signatureBase64: input.signature,
    });
    if (!valid) {
      throw new UnauthorizedException('Invalid device signature');
    }

    challenge.status = ChallengeStatus.USED;
    challenge.usedAt = new Date();
    return manager.getRepository(Challenge).save(challenge);
  }

  async getForUser(userId: string, challengeId: string): Promise<Challenge> {
    const challenge = await this.challenges.findOne({
      where: { id: challengeId, userId },
    });
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }
    return {
      ...challenge,
      payload: challenge.payload,
    };
  }
}
