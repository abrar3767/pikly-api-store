import {
  Controller, Post, UseGuards, UseInterceptors,
  UploadedFile, BadRequestException, Request,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger'
import { AuthGuard }            from '@nestjs/passport'
import { FileInterceptor }      from '@nestjs/platform-express'
import { diskStorage }          from 'multer'
import { extname, join }        from 'path'
import { existsSync, mkdirSync } from 'fs'
import { RolesGuard }   from '../common/guards/roles.guard'
import { Roles }        from '../common/decorators/roles.decorator'
import { successResponse } from '../common/api-utils'

const UPLOAD_DIR    = join(process.cwd(), 'public', 'uploads')
const ALLOWED_TYPES = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const MAX_SIZE_MB   = 5

// FEAT-03: File upload endpoint for product images and banners.
// Files are stored on disk under /public/uploads and served statically.
// In production on Railway, use a persistent volume or swap this for an
// S3/Cloudflare R2 integration — Railway's ephemeral disk resets on redeploy.
@ApiTags('Admin — Uploads')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/upload')
export class UploadsController {
  @Post()
  @ApiOperation({ summary: '[Admin] Upload an image (max 5 MB, jpg/png/webp)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type:'object', properties: { file: { type:'string', format:'binary' } } } })
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
        cb(null, UPLOAD_DIR)
      },
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
        cb(null, `${unique}${extname(file.originalname).toLowerCase()}`)
      },
    }),
    limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase()
      if (ALLOWED_TYPES.includes(ext)) {
        cb(null, true)
      } else {
        cb(new BadRequestException({ code:'INVALID_FILE_TYPE', message:`Only ${ALLOWED_TYPES.join(', ')} files are allowed` }), false)
      }
    },
  }))
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException({ code:'NO_FILE', message:'No file uploaded' })
    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000'
    return successResponse({
      filename: file.filename,
      url:      `${baseUrl}/uploads/${file.filename}`,
      size:     file.size,
      mimetype: file.mimetype,
    })
  }
}
