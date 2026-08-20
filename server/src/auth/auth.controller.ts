import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AdminSessionGuard } from './admin-session.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './auth.dto';
import {
  CSRF_UTILITIES,
  type CsrfUtilities,
} from '../config/csrf.provider';

@Controller('api/admin/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CSRF_UTILITIES) private readonly csrf: CsrfUtilities,
  ) {}

  @Get('csrf')
  async csrfToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const csrfToken = this.csrf.generateCsrfToken(request, response);
    await new Promise<void>((resolve, reject) => {
      request.session.save((error) => error ? reject(error) : resolve());
    });
    return { csrfToken };
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const admin = await this.auth.authenticate(input.username, input.password);
    await new Promise<void>((resolve, reject) => {
      request.session.regenerate((error) => error ? reject(error) : resolve());
    });
    request.session.admin = admin;
    await new Promise<void>((resolve, reject) => {
      request.session.save((error) => error ? reject(error) : resolve());
    });

    return {
      admin,
      csrfToken: this.csrf.generateCsrfToken(request, response, {
        overwrite: true,
      }),
    };
  }

  @Get('session')
  @UseGuards(AdminSessionGuard)
  session(@Req() request: Request) {
    return { admin: request.session.admin };
  }

  @Post('logout')
  @UseGuards(AdminSessionGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((error) => error ? reject(error) : resolve());
    });
    response.clearCookie('lovarus.sid', { path: '/' });
    return { ok: true };
  }
}
