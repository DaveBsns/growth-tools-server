import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument } from '../users/user/schemas/user.schema';

@Injectable()
export class MatchingStep2Service {
  private readonly logger = new Logger(MatchingStep2Service.name);
  private readonly topCandidateCount: number;
  private readonly openaiModel: string;

  constructor(
    @InjectModel('User') private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {
    this.topCandidateCount = parseInt(this.configService.get('LLM_TOP_N', '6'), 10);
    this.openaiModel = this.configService.get('OPENAI_MODEL', 'gpt-4o-mini');
  }

  async findPotentialPartnersStep2(userId: string) {
    const user = await this.userModel.findById(userId).lean().exec();
    if (!user || !user.matchingResults || user.matchingResults.length === 0) {
      return [];
    }

    const sortedResults = [...user.matchingResults]
      .sort((a, b) => b.score - a.score)
      .slice(0, this.topCandidateCount);

    const partnerIds = sortedResults.map((r) => r.partnerId);
    const partners = await this.userModel
      .find({ _id: { $in: partnerIds } })
      .lean()
      .exec();

    const partnerMap = new Map(partners.map((p) => [p._id.toString(), p]));

    const candidateProfiles = sortedResults.map((result) => {
      const partner = partnerMap.get(result.partnerId.toString());
      return {
        partnerId: result.partnerId.toString(),
        score: result.score,
        firstName: partner?.firstName || 'Unknown',
        overview: partner?.overview || '',
        matchingProfile: partner?.matchingProfile || {},
      };
    });

    const userProfile = {
      firstName: user.firstName,
      overview: user.overview || '',
      matchingProfile: user.matchingProfile || {},
    };

    try {
      const llmRanking = await this.callLlm(userProfile, candidateProfiles);
      await this.updateMatchingResults(userId, llmRanking);

      return llmRanking.map((ranked) => ({
        partnerId: ranked.partnerId,
        score: candidateProfiles.find((c) => c.partnerId === ranked.partnerId)?.score || 0,
        rank: ranked.rank,
        llmSummary: ranked.llmSummary,
        partnerProfile: partnerMap.get(ranked.partnerId),
      }));
    } catch (error) {
      this.logger.error('LLM call failed, returning unranked results', error);
      return candidateProfiles;
    }
  }

  private async callLlm(
    userProfile: any,
    candidates: any[],
  ): Promise<{ partnerId: string; rank: number; llmSummary: string }[]> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    
    // Fallback Mock, wenn kein echter API-Key hinterlegt ist
    if (!apiKey || apiKey === 'sk-your-api-key-here' || apiKey.trim() === '') {
      this.logger.warn('Kein echter OpenAI API-Key gefunden. Nutze Fallback-Mock für Filterstufe 2.');
      return candidates.map((candidate, index) => ({
        partnerId: candidate.partnerId,
        rank: index + 1,
        llmSummary: `[MOCK] Automatischer Fallback, da kein OpenAI-Key konfiguriert ist. ${candidate.firstName} scheint aufgrund der initialen Auswertung gut zu passen.`,
      }));
    }

    const systemPrompt = `Du bist ein Experte für Sprachlernpartner-Matching. 
Analysiere die Profile der Kandidaten und vergleiche sie mit dem suchenden User.
Berücksichtige: Sprachkombinationen, Freitextbeschreibungen, Hobbies, Interessen und Verfügbarkeit.
Erstelle eine finale Rangfolge und eine kurze Begründung pro Kandidat.
Antworte ausschließlich im folgenden JSON-Format:
[{"partnerId": "...", "rank": 1, "llmSummary": "Kurze Begründung"}, ...]`;

    const userPrompt = `Suchender User:
${JSON.stringify(userProfile, null, 2)}

Kandidaten (vorsortiert nach quantitativem Score):
${JSON.stringify(candidates, null, 2)}

Sortiere die Kandidaten nach qualitativer Passung und gib pro Kandidat eine kurze Begründung.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.openaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    const ranking = Array.isArray(parsed) ? parsed : parsed.ranking || parsed.results || [];

    return ranking.map((item: any, index: number) => ({
      partnerId: item.partnerId,
      rank: item.rank ?? index + 1,
      llmSummary: item.llmSummary || item.summary || '',
    }));
  }

  private async updateMatchingResults(
    userId: string,
    llmRanking: { partnerId: string; rank: number; llmSummary: string }[],
  ) {
    const bulkOps = llmRanking.map((ranked) => ({
      updateOne: {
        filter: {
          _id: userId,
          'matchingResults.partnerId': ranked.partnerId,
        },
        update: {
          $set: {
            'matchingResults.$.rank': ranked.rank,
            'matchingResults.$.llmSummary': ranked.llmSummary,
          },
        },
      },
    }));

    if (bulkOps.length > 0) {
      await this.userModel.bulkWrite(bulkOps);
    }
  }
}
