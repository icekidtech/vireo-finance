import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { B2Storage } from '../storage/b2.storage';
import { OBJECT_STORAGE, ObjectStorage } from '../storage/object-storage';
import { User } from '../users/user.entity';
import { Document } from './document.entity';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [TypeOrmModule.forFeature([Document, User])],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      // DOCUMENT_STORAGE unset disables uploads (endpoints answer 503); an unknown
      // name stops the app at startup instead of silently storing nowhere.
      useFactory: (config: ConfigService): ObjectStorage | null => {
        const provider = config.get<string>('storage.provider');
        if (!provider) return null;
        if (provider === 'b2') {
          return new B2Storage(
            config.getOrThrow<{
              keyId: string;
              applicationKey: string;
              bucketId: string;
              bucketName: string;
              timeoutMs: number;
            }>('storage.b2'),
          );
        }
        throw new Error(`DOCUMENT_STORAGE "${provider}" has no adapter in this build`);
      },
    },
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
