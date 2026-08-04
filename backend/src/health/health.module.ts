import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './indicators/prisma.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { StorageHealthIndicator } from './indicators/storage.health';

@Module({
  imports: [
    TerminusModule.forRoot({
      // Terminus logs a stack trace per failed check by default; during a
      // database outage that is thousands of identical traces a minute, which
      // buries the one line that matters.
      logger: false,
      errorLogStyle: 'pretty',
    }),
  ],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, RedisHealthIndicator, StorageHealthIndicator],
  exports: [PrismaHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
