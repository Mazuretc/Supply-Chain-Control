import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialEncryptionService } from '../security/credential-encryption.service';
import { PasswordService } from '../security/password.service';

interface RevealRequest {
  accountId: string;
  adminId: string;
  password: string;
  ipAddress?: string;
}

@Injectable()
export class MailCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  async reveal(request: RevealRequest): Promise<string> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: request.adminId },
      select: { id: true, passwordHash: true },
    });
    if (
      !admin
      || !(await this.passwords.verify(admin.passwordHash, request.password))
    ) {
      throw new UnauthorizedException('Administrator re-authentication failed');
    }

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.mailAccount.findUniqueOrThrow({
        where: { id: request.accountId },
        select: {
          id: true,
          encryptedPassword: true,
          passwordIv: true,
          passwordAuthTag: true,
        },
      });
      const plaintext = this.encryption.decrypt({
        ciphertext: account.encryptedPassword,
        iv: account.passwordIv,
        authTag: account.passwordAuthTag,
      });

      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'MAIL_ACCOUNT_PASSWORD_REVEALED',
          entityType: 'MailAccount',
          entityId: account.id,
          ipAddress: request.ipAddress,
        },
      });

      return plaintext;
    });
  }
}
