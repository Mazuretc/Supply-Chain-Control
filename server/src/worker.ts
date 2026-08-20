import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MailWorkerService } from './jobs/mail-worker.service';

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const worker = app.get(MailWorkerService);
  const config = app.get(ConfigService);
  const interval =
    config.get<number>('MAIL_POLL_INTERVAL_SECONDS', 60) * 1_000;
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  while (!stopping) {
    await worker.runOnce();
    if (!stopping) await delay(interval);
  }
  await app.close();
}

void bootstrap();
