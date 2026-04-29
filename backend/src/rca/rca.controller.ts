import { Body, Controller, Post } from '@nestjs/common';
import { RcaService } from './rca.service';
import { CreateRcaDto } from './dto/create-rca.dto';

@Controller()
export class RcaController {
  constructor(private readonly rcaService: RcaService) {}

  @Post('rca')
  async create(@Body() dto: CreateRcaDto) {
    return this.rcaService.create(dto);
  }
}
