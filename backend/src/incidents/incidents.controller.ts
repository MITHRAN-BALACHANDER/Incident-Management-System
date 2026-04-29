import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller()
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get('incidents')
  findActive() {
    return this.incidentsService.findActive();
  }

  @Get('incident/:id')
  findOne(@Param('id') id: string) {
    return this.incidentsService.findOne(id);
  }

  @Patch('incident/:id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.incidentsService.updateStatus(id, dto.status);
  }
}
