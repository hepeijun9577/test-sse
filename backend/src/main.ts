import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  if (existsSync('.env.local')) {
    loadEnvFile('.env.local');
  }

  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: 'http://localhost:8111',
    methods: ['GET', 'POST'],
    credentials: true,
  });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
}
void bootstrap();
