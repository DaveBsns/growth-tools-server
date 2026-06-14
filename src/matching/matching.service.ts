import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { LanguageLevel, LanguageSkill, UserDocument } from "../users/user/schemas/user.schema";
import { SbertService } from "./sbert.service";

type MatchingProfileLike = {
  hobbies?: string[];
  interests?: string;
  spokenLanguages?: LanguageSkill[];
  learningLanguages?: LanguageSkill[];
};

type PopulatedTag = { name: string } | null;

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
  private readonly communicationLanguageBonus = 10;
  private readonly sharedCourseBonus = 2;
  private readonly sharedStudyProgramBonus = 2;
  // SBERT similarity is 0..1; multiplied by these factors to keep impact low
  private readonly tagsAndHobbiesSemanticMaxBonus = 5;
  private readonly freeTextSemanticMaxBonus = 5;

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
    @InjectModel("User") private userModel: Model<UserDocument>,
    private readonly sbertService: SbertService,
  ) {}

  async findPotentialPartners(userId: string) {
    const currentUser = await this.userModel
      .findById(userId)
      .populate<{ interestedTags: PopulatedTag[] }>("interestedTags")
      .lean()
      .exec();

    if (!currentUser || !currentUser.matchingProfile) {
      return [];
    }

    const currentProfile = currentUser.matchingProfile as MatchingProfileLike;
    const languagesToLearn = this.getLearningLanguages(currentProfile);
    const currentGoodSpokenSkills = this.getGoodSpokenLanguageSkills(currentProfile);
    const currentGoodSpokenLanguages = currentGoodSpokenSkills.map((skill) => skill.language);

    // No tandem possible if the user neither wants to learn a language
    // nor speaks any language well enough to teach it.
    if (languagesToLearn.length === 0 && currentGoodSpokenLanguages.length === 0) {
      return [];
    }

    const partnerLanguageConditions = [];

    // Direction 1: partner speaks a language the current user wants to learn
    if (languagesToLearn.length > 0) {
      partnerLanguageConditions.push({
        "matchingProfile.spokenLanguages": {
          $elemMatch: {
            language: { $in: languagesToLearn },
            level: { $in: this.goodSpokenLevels },
          },
        },
      });
    }

    // Direction 2: partner wants to learn a language the current user speaks well
    if (currentGoodSpokenLanguages.length > 0) {
      partnerLanguageConditions.push({
        "matchingProfile.learningLanguages.language": { $in: currentGoodSpokenLanguages },
      });
    }

    const potentialPartners = await this.userModel.find({
      _id: { $ne: userId },
      status: true,
      softDeleted: false,
      isBlockedByAdmin: false,
      $or: partnerLanguageConditions,
    })
      .populate<{ interestedTags: PopulatedTag[] }>("interestedTags")
      .lean()
      .exec();

    const currentCommunicationLanguages = this.getGoodSpokenLanguageSkills(currentProfile);
    const currentTagsAndHobbiesText = this.buildTagsAndHobbiesText(
      currentProfile.hobbies,
      currentUser.interestedTags
    );
    const currentFreeText = this.buildFreeText(currentProfile.interests, currentUser.overview);

    const scoredPartners = await Promise.all(
      potentialPartners.map(async (partner) => {
        const partnerProfile = partner.matchingProfile as MatchingProfileLike;

        // Direction 1: partner can teach the current user (speaks a language to learn)
        const spokenMatches = this.getGoodSpokenLanguageMatches(partnerProfile, languagesToLearn);

        // Direction 2: current user can teach the partner (partner learns a language the user speaks well).
        // Scored by the current user's own level in that language, mirroring direction 1.
        const partnerLanguagesToLearn = this.getLearningLanguages(partnerProfile);
        const teachableLanguages = currentGoodSpokenSkills.filter((skill) =>
          partnerLanguagesToLearn.includes(skill.language)
        );

        const commonCommunicationLanguages = this.getCommonCommunicationLanguages(
          currentCommunicationLanguages,
          this.getGoodSpokenLanguageSkills(partnerProfile)
        );
        const sharedInterestedCourses = this.getSharedObjectIds(
          currentUser.interestedCourses,
          partner.interestedCourses
        );
        const sharedStudyPrograms = this.getSharedObjectIds(
          currentUser.studyPrograms,
          partner.studyPrograms
        );

        const partnerTagsAndHobbiesText = this.buildTagsAndHobbiesText(
          partnerProfile.hobbies,
          partner.interestedTags
        );
        const partnerFreeText = this.buildFreeText(partnerProfile.interests, partner.overview);

        const [tagsAndHobbiesSemanticSimilarity, freeTextSemanticSimilarity] = await Promise.all([
          this.sbertService.computeSimilarity(currentTagsAndHobbiesText, partnerTagsAndHobbiesText),
          this.sbertService.computeSimilarity(currentFreeText, partnerFreeText),
        ]);

        const score =
          spokenMatches.reduce((sum, match) => sum + this.levelScores[match.level], 0) +
          teachableLanguages.reduce((sum, skill) => sum + this.levelScores[skill.level], 0) +
          (commonCommunicationLanguages.length > 0 ? this.communicationLanguageBonus : 0) +
          sharedInterestedCourses.length * this.sharedCourseBonus +
          sharedStudyPrograms.length * this.sharedStudyProgramBonus +
          tagsAndHobbiesSemanticSimilarity * this.tagsAndHobbiesSemanticMaxBonus +
          freeTextSemanticSimilarity * this.freeTextSemanticMaxBonus;

        return {
          ...partner,
          matchScore: score,
          matchedLanguages: spokenMatches,
          teachableLanguages,
          commonCommunicationLanguages,
          sharedInterestedCourses,
          sharedStudyPrograms,
          tagsAndHobbiesSemanticSimilarity,
          freeTextSemanticSimilarity,
        };
      })
    );

    const result = scoredPartners
      .filter(
        (partner) =>
          partner.matchedLanguages.length > 0 || partner.teachableLanguages.length > 0
      )
      .sort((a, b) => b.matchScore - a.matchScore);

    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        matchingResults: result.map((partner) => ({
          partnerId: partner._id,
          score: partner.matchScore,
        })),
      },
    });

    return result;
  }

  // Combines hobby tags and interestedTags into one text
  private buildTagsAndHobbiesText(
    hobbies?: string[],
    interestedTags?: PopulatedTag[]
  ): string {
    const hobbyParts = (hobbies ?? []).filter(Boolean);
    const tagParts = (interestedTags ?? [])
      .map((tag) => tag?.name)
      .filter(Boolean);
    return [...hobbyParts, ...tagParts].join(", ");
  }

  // Combines the interests free-text and the overview bio into one string for SBERT
  // interests may still be a legacy string[] in existing DB documents
  private buildFreeText(interests?: string | string[], overview?: string): string {
    const interestsStr = Array.isArray(interests) ? interests.join(", ") : interests;
    return [interestsStr, overview]
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .join(" ")
      .trim();
  }

  private getLearningLanguages(profile?: MatchingProfileLike): string[] {
    const languages = (profile?.learningLanguages ?? []).map(({ language }) => language);
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

        return {
          language: currentLanguage.language,
          currentUserLevel: currentLanguage.level,
          partnerLevel: partnerLanguage.level,
        };
      })
      .filter(Boolean);
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