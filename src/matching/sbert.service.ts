import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

@Injectable()
export class SbertService {
  private readonly logger = new Logger(SbertService.name);
  private readonly serviceUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.serviceUrl = this.configService.get<string>("sbert.url");
  }

  async computeSimilarity(textA: string, textB: string): Promise<number> {
    try {
      const response = await axios.post<{ score: number }>(
        `${this.serviceUrl}/api/similarity`,
        { texts_a: [textA], texts_b: [textB] },
        { timeout: 5000 }
      );
      return response.data.score;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SBERT service unavailable: ${message}`);
      return 0;
    }
  }

  /**
   * Compares many text pairs in a single request. pairs[i].a is compared
   * against pairs[i].b. Returns a score (0..1) per pair, in the same order.
   * On failure every pair falls back to 0 so matching can still proceed.
   */
  async computeSimilarities(
    pairs: { a: string; b: string }[]
  ): Promise<number[]> {
    if (pairs.length === 0) {
      return [];
    }

    try {
      const response = await axios.post<{ scores: number[] }>(
        `${this.serviceUrl}/api/similarity-batch`,
        {
          texts_a: pairs.map((pair) => pair.a),
          texts_b: pairs.map((pair) => pair.b),
        },
        { timeout: 30000 }
      );
      return response.data.scores;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SBERT service unavailable: ${message}`);
      return pairs.map(() => 0);
    }
  }
}
