import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../security/password.service';

export interface AdminIdentity {
  id: string;
  username: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async authenticate(username: string, password: string): Promise<AdminIdentity> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { username },
      select: { id: true, username: true, passwordHash: true },
    });
    if (!admin || !(await this.passwords.verify(admin.passwordHash, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { id: admin.id, username: admin.username };
  }
}
