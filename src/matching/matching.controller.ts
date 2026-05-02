import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@ApiTags('Matching')
@ApiBearerAuth('JWT-auth')
@Controller('matching')
@UseGuards(JwtAuthGuard)
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @ApiOperation({ summary: 'Get potential language partners for the authenticated user' })
  @Get('potential-partners')
  async getPotentialPartners(@Req() req: any) {
    const userId = req.user.userId; 
    return this.matchingService.findPotentialPartners(userId);
  }
}
