import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { requireEnv } from '../config/env';
import { SESSION_TTL_SECONDS } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({
  imports: [
    // Factory so JWT_SECRET is read when the app starts, after .env has been loaded.
    JwtModule.registerAsync({
      useFactory: () => ({ secret: requireEnv('JWT_SECRET'), signOptions: { expiresIn: SESSION_TTL_SECONDS } }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
