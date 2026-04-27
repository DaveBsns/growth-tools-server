import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('matching')
@UseGuards(JwtAuthGuard)
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get('potential-partners')
  async getPotentialPartners(@Req() req: any) {
    const userId = req.user.userId; 
    return this.matchingService.findPotentialPartners(userId);
  }
}
