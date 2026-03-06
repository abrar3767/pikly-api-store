import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { IsString, IsArray, IsUrl, IsIn, ArrayMinSize } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { AuthGuard }      from '@nestjs/passport'
import { WebhookService } from './webhook.service'
import { successResponse } from '../common/api-utils'

const VALID_EVENTS = ['order.created','order.status_changed','order.cancelled','order.shipped','order.delivered']

class RegisterWebhookDto {
  @ApiProperty() @IsUrl() url: string
  @ApiProperty({ type:[String], enum: VALID_EVENTS })
  @IsArray() @IsIn(VALID_EVENTS, { each:true }) @ArrayMinSize(1)
  events: string[]
}

@ApiTags('Webhooks')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @ApiOperation({ summary: 'Register a webhook endpoint' })
  async register(@Request() req: any, @Body() dto: RegisterWebhookDto) {
    return successResponse(await this.webhookService.register(req.user.userId, dto.url, dto.events))
  }

  @Get()
  @ApiOperation({ summary: 'List your registered webhooks' })
  async list(@Request() req: any) {
    return successResponse(await this.webhookService.list(req.user.userId))
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook' })
  @ApiParam({ name: 'id' })
  async remove(@Request() req: any, @Param('id') id: string) {
    return successResponse(await this.webhookService.delete(id, req.user.userId))
  }
}
