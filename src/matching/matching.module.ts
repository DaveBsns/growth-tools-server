import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { MatchingStep2Controller } from './matching-step-2.controller';
import { MatchingStep2Service } from './matching-step-2.service';
import { UserSchema } from '../users/user/schemas/user.schema';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
    AuthModule,
  ],
  controllers: [MatchingController, MatchingStep2Controller],
  providers: [MatchingService, MatchingStep2Service, AuthService],
})
export class MatchingModule {}
