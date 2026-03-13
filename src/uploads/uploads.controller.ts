import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { extname, join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { successResponse } from '../common/api-utils'

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads')
const MAX_SIZE_MB = 5

// ── Magic byte detection ─────────────────────────────────────────────────────
// We read the first 12 bytes of the file buffer and match them against known
// image format signatures. This cannot be faked by renaming a file, unlike
// extension-based checks. The 12-byte length covers the WebP detection (which
// requires bytes 0-3 for "RIFF" and bytes 8-11 for "WEBP").
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function detectMimeType(buf: Buffer): string | null {
  if (buf.length < 4) return null

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'

  // PNG: 89 50 4E 47 (‰PNG)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'

  // GIF: 47 49 46 38 (GIF8)
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif'

  // WebP: RIFF????WEBP (bytes 0-3 = "RIFF", bytes 8-11 = "WEBP")
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString('ascii') === 'RIFF' &&
    buf.slice(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp'

  return null
}

// Map detected MIME types to canonical file extensions for stored filenames
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

@ApiTags('Admin — Uploads')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/upload')
export class UploadsController {
  @Post()
  @ApiOperation({
    summary: '[Admin] Upload an image (max 5 MB, jpeg/png/webp/gif — validated by magic bytes)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  // BUG-06: use memoryStorage so the file buffer is available for magic-byte
  // inspection before anything is written to disk. diskStorage writes the file
  // before any controller logic runs, meaning a malicious file could be stored
  // on disk even if subsequent validation rejects it.
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
      // Keep a loose fileFilter as a first-pass size gate; the real content
      // validation happens below after the buffer is in memory.
      fileFilter: (_req, _file, cb) => cb(null, true),
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException({ code: 'NO_FILE', message: 'No file uploaded' })
    }

    // BUG-06: validate content by magic bytes, not by filename extension.
    // A file named "malware.jpg" that actually contains HTML or a PHP script
    // passes the extension check but fails here because its first bytes do not
    // match any known image signature.
    const detectedMime = detectMimeType(file.buffer)
    if (!detectedMime || !ALLOWED_MIME_TYPES.has(detectedMime)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message:
          'File content does not match a supported image format (jpeg, png, webp, gif). Renaming files does not bypass this check.',
      })
    }

    // Use the extension derived from actual content, not from the original filename
    const ext = MIME_TO_EXT[detectedMime]
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    const filename = `${unique}${ext}`

    // Create upload directory if it doesn't exist, then write the validated buffer
    if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
    writeFileSync(join(UPLOAD_DIR, filename), file.buffer)

    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000'
    return successResponse({
      filename,
      url: `${baseUrl}/uploads/${filename}`,
      size: file.size,
      mimetype: detectedMime, // report the detected MIME, not the claimed one
    })
  }
}
