import 'reflect-metadata'
import * as dotenv from 'dotenv'
dotenv.config()

// ── Startup environment validation ────────────────────────────────────────────
// Fail immediately with a clear message rather than crashing later with a
// cryptic Mongoose or JWT error that obscures the real problem.
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'REDIS_URL']
const missing      = REQUIRED_ENV.filter(k => !process.env[k])
if (missing.length > 0) {
  console.error(`\n❌  Missing required environment variables: ${missing.join(', ')}`)
  console.error('    Copy .env.example to .env and fill in the values.\n')
  process.exit(1)
}

import { setDefaultResultOrder } from 'node:dns'
setDefaultResultOrder('ipv4first')

import { NestFactory }    from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { join }                 from 'path'
import { AppModule }            from './app.module'
import { AllExceptionsFilter }  from './common/all-exceptions.filter'
import helmet      from 'helmet'
import compression from 'compression'
import morgan      from 'morgan'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  // DES-01 fix: API versioned at /api/v1
  app.setGlobalPrefix('api/v1')

  // Serve uploaded files statically at /uploads/<filename>
  app.useStaticAssets(join(process.cwd(), 'public', 'uploads'), { prefix: '/uploads' })

  // ── CORS ────────────────────────────────────────────────────────────────────
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : '*'
  app.enableCors({ origin: allowedOrigins, methods: 'GET,POST,PATCH,DELETE,OPTIONS', allowedHeaders: 'Content-Type,Authorization,X-Session-ID,Idempotency-Key' })

  // ── Security & utility middleware ────────────────────────────────────────────
  app.use(helmet())
  app.use(compression())
  app.use(morgan('combined'))

  app.useGlobalFilters(new AllExceptionsFilter())

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, transform: true, forbidNonWhitelisted: true,
  }))

  // ── Swagger — development only ───────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Pikly Store API v2')
      .setDescription('Full-featured eCommerce REST API — NestJS + MongoDB + Redis')
      .setVersion('2.0.0')
      .addBearerAuth()
      .build()
    SwaggerModule.setup('api/v1/docs', app, SwaggerModule.createDocument(app, config), {
      swaggerOptions: { persistAuthorization: true },
    })
    console.log(`📖 Swagger: http://localhost:${process.env.PORT ?? 3000}/api/v1/docs`)
  }

  const port = process.env.PORT ?? 3000
  await app.listen(port)
  console.log(`\n🚀 Pikly Store API v2 running → http://localhost:${port}/api/v1\n`)
}

bootstrap()
