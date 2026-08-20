import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AdminSessionGuard } from '../auth/admin-session.guard';
import {
  CreateMailAccountDto,
  RevealMailPasswordDto,
} from './mail-account.dto';
import { MailAccountService } from './mail-account.service';
import { MailCredentialService } from './mail-credential.service';

@Controller('api/admin/mail-accounts')
@UseGuards(AdminSessionGuard)
export class MailAccountController {
  constructor(
    private readonly accounts: MailAccountService,
    private readonly credentials: MailCredentialService,
  ) {}

  @Get()
  list() {
    return this.accounts.list();
  }

  @Post()
  create(@Body() input: CreateMailAccountDto) {
    return this.accounts.create(input);
  }

  @Post(':id/reveal-password')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async revealPassword(
    @Param('id') accountId: string,
    @Body() input: RevealMailPasswordDto,
    @Req() request: Request,
  ) {
    const password = await this.credentials.reveal({
      accountId,
      adminId: request.session.admin!.id,
      password: input.password,
      ipAddress: request.ip,
    });
    return { password };
  }
}
