import 'reflect-metadata'
import * as dotenv from 'dotenv'
dotenv.config()

// ── Startup environment validation ────────────────────────────────────────────
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'REDIS_URL']
const missing = REQUIRED_ENV.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.error(`\n❌  Missing required environment variables: ${missing.join(', ')}`)
  console.error('    Copy .env.example to .env and fill in the values.\n')
  process.exit(1)
}

import { setDefaultResultOrder } from 'node:dns'
setDefaultResultOrder('ipv4first')

import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { join } from 'path'
import * as express from 'express'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/all-exceptions.filter'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  app.setGlobalPrefix('api/v1')

  // SEC-03: explicit body-size limits registered before any route handlers.
  // Without these, Express defaults to 100 kB for JSON and no limit for
  // URL-encoded bodies. A missing explicit limit means an attacker can submit
  // a 50 MB JSON body and exhaust the Node.js heap. 1 MB is generous for all
  // legitimate API use cases in this application.
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ limit: '1mb', extended: true }))

  // Serve uploaded files with Content-Disposition: attachment to prevent
  // inline execution of any uploaded SVG/HTML files. (BUG-06 complement.)
  app.useStaticAssets(join(process.cwd(), 'public', 'uploads'), {
    prefix: '/uploads',
    setHeaders: (res) => {
      res.setHeader('Content-Disposition', 'attachment')
      res.setHeader('X-Content-Type-Options', 'nosniff')
    },
  })

  // ── CORS ────────────────────────────────────────────────────────────────────
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
    : '*'
  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,POST,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,X-Session-ID,Idempotency-Key',
  })

  // ── Security & utility middleware ─────────────────────────────────────────
  app.use(helmet())
  app.use(compression())
  app.use(morgan('combined'))

  app.useGlobalFilters(new AllExceptionsFilter())

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  // ── Swagger ──────────────────────────────────────────────────────────────
  // QA-04: Swagger is now opt-in via SWAGGER_ENABLED=true rather than
  // opt-out via NODE_ENV=production. Any deployment that does not explicitly
  // set SWAGGER_ENABLED=true will not expose the API documentation, regardless
  // of what NODE_ENV is set to. This prevents accidental Swagger exposure on
  // staging, review-apps, or Railway deployments where NODE_ENV may be unset.
  if (process.env.SWAGGER_ENABLED === 'true') {
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
