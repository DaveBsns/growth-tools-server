import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument } from '../users/user/schemas/user.schema';

@Injectable()
export class MatchingService {
  constructor(
    @InjectModel('User') private userModel: Model<UserDocument>,
  ) {}

  async findPotentialPartners(userId: string) {
    const currentUser = await this.userModel.findById(userId).exec();
    
    if (!currentUser || !currentUser.matchingProfile) {
        return [];
    }


    const { motherTongue, learningLanguage } = currentUser.matchingProfile;

    const potentialPartners = await this.userModel.find({
        _id: { $ne: userId },
        // 'matchingProfile.learningLanguage': motherTongue, // User Lernsprache ist Match Muttersprache
        // 'matchingProfile.motherTongue': learningLanguage, // User Muttersprache ist Match Lernsprache
        'matchingProfile.learningLanguage': learningLanguage,
        'matchingProfile.motherTongue': motherTongue
    }).exec();

    return potentialPartners;
  }
}
