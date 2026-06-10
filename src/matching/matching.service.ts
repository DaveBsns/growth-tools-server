import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { LanguageLevel, LanguageSkill, UserDocument } from "../users/user/schemas/user.schema";

type MatchingProfileLike = {
  hobbies?: string[];
  interests?: string[];
  spokenLanguages?: LanguageSkill[];
  learningLanguages?: LanguageSkill[];
};

type NormalizedLanguageSkill = {
  language: string;
  level: LanguageLevel;
};

@Injectable()
export class MatchingService {
  private readonly goodSpokenLevels: LanguageLevel[] = [
    "B2",
    "C1",
    "C2",
    "native",
  ];
  private readonly communicationLanguageBonus = 3;
  private readonly mutualLearningBonus = 2;
  private readonly sharedInterestBonus = 3;
  private readonly sharedTagBonus = 2;
  private readonly sharedCourseBonus = 2;
  private readonly sharedStudyProgramBonus = 2;

  private readonly levelScores: Record<LanguageLevel, number> = {
    A1: 1,
    A2: 2,
    B1: 3,
    B2: 4,
    C1: 5,
    C2: 6,
    native: 7,
  };

  constructor(@InjectModel("User") private userModel: Model<UserDocument>) {}

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
        "matchingProfile.spokenLanguages": {
          $elemMatch: {
            language: { $in: languagesToLearn },
            level: { $in: this.goodSpokenLevels },
          },
        },
    }).lean().exec();

    const currentSpokenLanguages = this.getSpokenLanguages(currentProfile);
    const currentCommunicationLanguages = this.getGoodSpokenLanguageSkills(currentProfile);

    const scoredPartners = potentialPartners
      .map((partner) => {
        const partnerProfile = partner.matchingProfile as MatchingProfileLike;
        const spokenMatches = this.getGoodSpokenLanguageMatches(partnerProfile, languagesToLearn);

        const mutualLearningMatches = this.getLearningLanguages(partnerProfile)
          .filter((language) => currentSpokenLanguages.includes(language));

        const commonCommunicationLanguages = this.getCommonCommunicationLanguages(
            currentCommunicationLanguages,
            this.getGoodSpokenLanguageSkills(partnerProfile)
        );
        const sharedInterests = this.getSharedProfileInterests(
          currentProfile,
          partnerProfile
        );
        const sharedInterestedTags = this.getSharedObjectIds(
          currentUser.interestedTags,
          partner.interestedTags
        );
        const sharedInterestedCourses = this.getSharedObjectIds(
          currentUser.interestedCourses,
          partner.interestedCourses
        );
        const sharedStudyPrograms = this.getSharedObjectIds(
          currentUser.studyPrograms,
          partner.studyPrograms
        );

        const score =
          spokenMatches.reduce(
            (sum, match) => sum + this.levelScores[match.level],
            0
          ) +
          mutualLearningMatches.length * this.mutualLearningBonus +
          commonCommunicationLanguages.reduce(
            (sum, match) => sum + match.score,
            0
          ) +
          sharedInterests.length * this.sharedInterestBonus +
          sharedInterestedTags.length * this.sharedTagBonus +
          sharedInterestedCourses.length * this.sharedCourseBonus +
          sharedStudyPrograms.length * this.sharedStudyProgramBonus;

        return {
          ...partner,
          matchScore: score,
          matchedLanguages: spokenMatches,
          mutualLearningMatches,
          commonCommunicationLanguages,
          sharedInterests,
          sharedInterestedTags,
          sharedInterestedCourses,
          sharedStudyPrograms,
        };
      })
      .filter((partner) => {
        return (
          partner.matchedLanguages.length > 0 &&
          partner.commonCommunicationLanguages.length > 0
        );
      })
      .sort((a, b) => b.matchScore - a.matchScore);

    const matchingResults = scoredPartners.map((partner) => ({
      partnerId: partner._id,
      score: partner.matchScore,
    }));

    await this.userModel.findByIdAndUpdate(userId, {
      $set: { matchingResults },
    });

    return scoredPartners;
  }

  private getLearningLanguages(profile?: MatchingProfileLike): string[] {
    const languages = (profile?.learningLanguages ?? []).map(({ language }) => language);
    return this.uniqueNormalizedLanguages(languages);
  }

  private getSpokenLanguages(profile?: MatchingProfileLike): string[] {
    const languages = (profile?.spokenLanguages ?? []).map(({ language }) => language);
    return this.uniqueNormalizedLanguages(languages);
  }

  private getGoodSpokenLanguageMatches(
    profile: MatchingProfileLike,
    languagesToLearn: string[]
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

  private getGoodSpokenLanguageSkills(
    profile?: MatchingProfileLike
  ): NormalizedLanguageSkill[] {
    const goodSpokenLanguages = (profile?.spokenLanguages ?? [])
      .filter(
        ({ language, level }) =>
          this.normalizeLanguage(language) &&
          this.goodSpokenLevels.includes(level)
      )
      .map(({ language, level }) => ({
        language: this.normalizeLanguage(language),
        level,
      }));

    return this.keepHighestLanguageLevels(goodSpokenLanguages);
  }

  private getCommonCommunicationLanguages(
    currentLanguages: NormalizedLanguageSkill[],
    partnerLanguages: NormalizedLanguageSkill[]
  ) {
    return currentLanguages
      .map((currentLanguage) => {
        const partnerLanguage = partnerLanguages.find(
          ({ language }) => language === currentLanguage.language
        );

        if (!partnerLanguage) {
          return null;
        }

        const sharedLevelScore = Math.min(
          this.levelScores[currentLanguage.level],
          this.levelScores[partnerLanguage.level]
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

  private getSharedProfileInterests(
    currentProfile?: MatchingProfileLike,
    partnerProfile?: MatchingProfileLike
  ): string[] {
    const currentInterests = this.getProfileInterests(currentProfile);
    const partnerInterests = new Set(this.getProfileInterests(partnerProfile));

    return currentInterests.filter((interest) =>
      partnerInterests.has(interest)
    );
  }

  private getProfileInterests(profile?: MatchingProfileLike): string[] {
    return this.uniqueNormalizedStrings([
      ...(profile?.interests ?? []),
      ...(profile?.hobbies ?? []),
    ]);
  }

  private getSharedObjectIds(
    currentIds: unknown[] = [],
    partnerIds: unknown[] = []
  ): string[] {
    const partnerIdSet = new Set(
      partnerIds.map((id) => id?.toString()).filter(Boolean)
    );

    return currentIds
      .map((id) => id?.toString())
      .filter((id): id is string => Boolean(id) && partnerIdSet.has(id));
  }

  private keepHighestLanguageLevels(
    skills: NormalizedLanguageSkill[]
  ): NormalizedLanguageSkill[] {
    const bestSkillByLanguage = new Map<string, NormalizedLanguageSkill>();

    skills.forEach((skill) => {
      const existingSkill = bestSkillByLanguage.get(skill.language);

      if (
        !existingSkill ||
        this.levelScores[skill.level] > this.levelScores[existingSkill.level]
      ) {
        bestSkillByLanguage.set(skill.language, skill);
      }
    });

    return [...bestSkillByLanguage.values()];
  }

  private uniqueNormalizedLanguages(
    languages: Array<string | undefined>
  ): string[] {
    return this.uniqueNormalizedStrings(languages);
  }

  private uniqueNormalizedStrings(values: Array<string | undefined>): string[] {
    return [
      ...new Set(
        values.map((value) => this.normalizeString(value)).filter(Boolean)
      ),
    ];
  }

  private normalizeLanguage(language?: string): string {
    return this.normalizeString(language);
  }

  private normalizeString(value?: string): string {
    return value?.trim().toLowerCase();
  }
}
