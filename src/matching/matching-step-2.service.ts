import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument } from '../users/user/schemas/user.schema';
import { MatchingService } from './matching.service';

@Injectable()
export class MatchingStep2Service {
  constructor(
    @InjectModel('User') private readonly userModel: Model<UserDocument>,
    private readonly matchingService: MatchingService,
  ) {}

  async findPotentialPartnersStep2(userId: string) {
    const step1Results = await this.matchingService.findPotentialPartners(userId);
    const topCandidates = step1Results.slice(0, 6);

    // TODO: Implement OpenAI API call to analyze free text inputs (overview) and re-rank candidates

    return topCandidates;
  }
}
