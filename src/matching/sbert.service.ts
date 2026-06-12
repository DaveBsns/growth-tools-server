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
}
