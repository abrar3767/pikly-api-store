import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation }   from '@nestjs/swagger'
import { successResponse }         from '../common/api-utils'
import * as fs   from 'fs'
import * as path from 'path'

@ApiTags('Health')
@Controller('health')
export class HealthController {

  private count(file: string) {
    try {
      return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', `${file}.json`), 'utf-8')).length
    } catch { return 0 }
  }

  @Get()
  @ApiOperation({ summary: 'API health check with data status' })
  check() {
    return successResponse({
      status:    'ok',
      uptime:    process.uptime().toFixed(2) + 's',
      timestamp: new Date().toISOString(),
      version:   '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      dataLoaded: {
        products:   this.count('products'),
        categories: this.count('categories'),
        users:      this.count('users'),
        orders:     this.count('orders'),
        coupons:    this.count('coupons'),
        banners:    this.count('banners'),
      },
      memory: {
        heapUsed:  (process.memoryUsage().heapUsed  / 1024 / 1024).toFixed(2) + ' MB',
        heapTotal: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2) + ' MB',
      },
    })
  }
}

