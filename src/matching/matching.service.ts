import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LanguageLevel, LanguageSkill, UserDocument } from '../users/user/schemas/user.schema';

type MatchingProfileLike = {
  spokenLanguages?: LanguageSkill[];
  learningLanguages?: LanguageSkill[];
  motherTongue?: string;
  learningLanguage?: string;
};

type NormalizedLanguageSkill = {
  language: string;
  level: LanguageLevel;
};

@Injectable()
export class MatchingService {
  private readonly goodSpokenLevels: LanguageLevel[] = ['B2', 'C1', 'C2', 'native'];
  private readonly communicationLanguageBonus = 3;

  private readonly levelScores: Record<LanguageLevel, number> = {
    A1: 1,
    A2: 2,
    B1: 3,
    B2: 4,
    C1: 5,
    C2: 6,
    native: 7,
  };

  constructor(
    @InjectModel('User') private userModel: Model<UserDocument>,
  ) {}

  async findPotentialPartners(userId: string) {
    const currentUser = await this.userModel.findById(userId).lean().exec();
    
    if (!currentUser || !currentUser.matchingProfile) {
        return [];
    }

    const currentProfile = currentUser.matchingProfile as MatchingProfileLike;
    const languagesToLearn = this.getLearningLanguages(currentProfile);

    if (languagesToLearn.length === 0) {
      return [];
    }

    const potentialPartners = await this.userModel.find({
        _id: { $ne: userId },
        status: true,
        softDeleted: false,
        isBlockedByAdmin: false,
        $or: [
          {
            'matchingProfile.spokenLanguages': {
              $elemMatch: {
                language: { $in: languagesToLearn },
                level: { $in: this.goodSpokenLevels },
              },
            },
          },
          {
            'matchingProfile.motherTongue': { $exists: true, $ne: null },
          },
        ],
    }).lean().exec();

    const currentSpokenLanguages = this.getSpokenLanguages(currentProfile);
    const currentCommunicationLanguages = this.getGoodSpokenLanguageSkills(currentProfile);

    return potentialPartners
      .map((partner) => {
        const partnerProfile = partner.matchingProfile as MatchingProfileLike;
        const spokenMatches = this.getGoodSpokenLanguageMatches(partnerProfile, languagesToLearn);
        const legacyMotherTongueMatch = this.normalizeLanguage(partnerProfile?.motherTongue);

        if (
          legacyMotherTongueMatch &&
          languagesToLearn.includes(legacyMotherTongueMatch) &&
          !spokenMatches.some((match) => match.language === legacyMotherTongueMatch)
        ) {
          spokenMatches.push({ language: legacyMotherTongueMatch, level: 'native' });
        }

        const mutualLearningMatches = this.getLearningLanguages(partnerProfile)
          .filter((language) => currentSpokenLanguages.includes(language));

        const commonCommunicationLanguages = this.getCommonCommunicationLanguages(
          currentCommunicationLanguages,
          this.getGoodSpokenLanguageSkills(partnerProfile),
        );

        const score = spokenMatches.reduce(
          (sum, match) => sum + this.levelScores[match.level],
          0,
        ) + mutualLearningMatches.length * 2
          + commonCommunicationLanguages.reduce(
            (sum, match) => sum + match.score,
            0,
          );

        return {
          ...partner,
          matchScore: score,
          matchedLanguages: spokenMatches,
          mutualLearningMatches,
          commonCommunicationLanguages,
        };
      })
      .filter((partner) => partner.matchedLanguages.length > 0)
      .sort((a, b) => b.matchScore - a.matchScore);
  }

  private getLearningLanguages(profile?: MatchingProfileLike): string[] {
    const languages = [
      ...(profile?.learningLanguages ?? []).map(({ language }) => language),
      profile?.learningLanguage,
    ];

    return this.uniqueNormalizedLanguages(languages);
  }

  private getSpokenLanguages(profile?: MatchingProfileLike): string[] {
    const languages = [
      ...(profile?.spokenLanguages ?? []).map(({ language }) => language),
      profile?.motherTongue,
    ];

    return this.uniqueNormalizedLanguages(languages);
  }

  private getGoodSpokenLanguageMatches(
    profile: MatchingProfileLike,
    languagesToLearn: string[],
  ): NormalizedLanguageSkill[] {
    return (profile?.spokenLanguages ?? [])
      .filter(({ language, level }) => {
        const normalizedLanguage = this.normalizeLanguage(language);
        return (
          normalizedLanguage &&
          languagesToLearn.includes(normalizedLanguage) &&
          this.goodSpokenLevels.includes(level)
        );
      })
      .map(({ language, level }) => ({
        language: this.normalizeLanguage(language),
        level,
      }));
  }

  private getGoodSpokenLanguageSkills(profile?: MatchingProfileLike): NormalizedLanguageSkill[] {
    const goodSpokenLanguages = (profile?.spokenLanguages ?? [])
      .filter(({ language, level }) => this.normalizeLanguage(language) && this.goodSpokenLevels.includes(level))
      .map(({ language, level }) => ({
        language: this.normalizeLanguage(language),
        level,
      }));

    const legacyMotherTongue = this.normalizeLanguage(profile?.motherTongue);

    if (
      legacyMotherTongue &&
      !goodSpokenLanguages.some((skill) => skill.language === legacyMotherTongue)
    ) {
      goodSpokenLanguages.push({ language: legacyMotherTongue, level: 'native' });
    }

    return this.keepHighestLanguageLevels(goodSpokenLanguages);
  }

  private getCommonCommunicationLanguages(
    currentLanguages: NormalizedLanguageSkill[],
    partnerLanguages: NormalizedLanguageSkill[],
  ) {
    return currentLanguages
      .map((currentLanguage) => {
        const partnerLanguage = partnerLanguages.find(
          ({ language }) => language === currentLanguage.language,
        );

        if (!partnerLanguage) {
          return null;
        }

        const sharedLevelScore = Math.min(
          this.levelScores[currentLanguage.level],
          this.levelScores[partnerLanguage.level],
        );

        return {
          language: currentLanguage.language,
          currentUserLevel: currentLanguage.level,
          partnerLevel: partnerLanguage.level,
          score: sharedLevelScore + this.communicationLanguageBonus,
        };
      })
      .filter(Boolean);
  }

  private keepHighestLanguageLevels(skills: NormalizedLanguageSkill[]): NormalizedLanguageSkill[] {
    const bestSkillByLanguage = new Map<string, NormalizedLanguageSkill>();

    skills.forEach((skill) => {
      const existingSkill = bestSkillByLanguage.get(skill.language);

      if (!existingSkill || this.levelScores[skill.level] > this.levelScores[existingSkill.level]) {
        bestSkillByLanguage.set(skill.language, skill);
      }
    });

    return [...bestSkillByLanguage.values()];
  }

  private uniqueNormalizedLanguages(languages: Array<string | undefined>): string[] {
    return [...new Set(
      languages
        .map((language) => this.normalizeLanguage(language))
        .filter(Boolean),
    )];
  }

  private normalizeLanguage(language?: string): string {
    return language?.trim().toLowerCase();
  }
}
