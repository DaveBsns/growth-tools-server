import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MatchingStep2Service } from './matching-step-2.service';
import { MatchingService } from './matching.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('Matching')
@ApiBearerAuth('JWT-auth')
@Controller('matching')
@UseGuards(JwtAuthGuard)
export class MatchingStep2Controller {
  constructor(
    private readonly matchingStep2Service: MatchingStep2Service,
    private readonly matchingService: MatchingService,
  ) {}

  @ApiOperation({ summary: 'Get potential language partners filtered by LLM (Step 2 only)' })
  @Get('potential-partners-step-2')
  async getPotentialPartnersStep2(@Req() req: any) {
    const userId = req.user.userId;
    return this.matchingStep2Service.findPotentialPartnersStep2(userId);
  }

  @ApiOperation({ summary: 'Run full matching pipeline (Step 1 + Step 2)' })
  @Get('full-matching')
  async getFullMatching(@Req() req: any) {
    const userId = req.user.userId;
    await this.matchingService.findPotentialPartners(userId);
    return this.matchingStep2Service.findPotentialPartnersStep2(userId);
  }
}
