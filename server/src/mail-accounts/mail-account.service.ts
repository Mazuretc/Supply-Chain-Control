import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialEncryptionService } from '../security/credential-encryption.service';

export interface CreateMailAccount {
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

@Injectable()
export class MailAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  async create(input: CreateMailAccount) {
    const encrypted = this.encryption.encrypt(input.password);
    const account = await this.prisma.mailAccount.create({
      data: {
        name: input.name,
        host: input.host,
        port: input.port,
        secure: input.secure,
        username: input.username,
        encryptedPassword: encrypted.ciphertext,
        passwordIv: encrypted.iv,
        passwordAuthTag: encrypted.authTag,
      },
    });

    return this.publicAccount(account);
  }

  list() {
    return this.prisma.mailAccount.findMany({
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        secure: true,
        username: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  private publicAccount(account: {
    id: string;
    name: string;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    enabled?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      id: account.id,
      name: account.name,
      host: account.host,
      port: account.port,
      secure: account.secure,
      username: account.username,
      enabled: account.enabled,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      passwordConfigured: true,
    };
  }
}
