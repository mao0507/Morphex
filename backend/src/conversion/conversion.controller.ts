import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { ConversionService } from './conversion.service';
import { multerOptions } from './multer.config';
import type { ConvertRequestBody } from './tuning.parser';
import { parseTuningOptions } from './tuning.parser';

@Controller()
export class ConversionController {
  constructor(private readonly conversionService: ConversionService) {}

  @Get('formats')
  getFormats() {
    return this.conversionService.listFormats();
  }

  @Post('convert')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async convert(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: ConvertRequestBody,
  ) {
    if (!file) {
      throw new BadRequestException('請上傳檔案');
    }
    if (body.format !== undefined && typeof body.format !== 'string') {
      throw new BadRequestException('請指定輸出格式');
    }

    return this.conversionService.convert(
      file,
      body.format,
      parseTuningOptions(body),
    );
  }

  @Get('convert/:id/status')
  getStatus(@Param('id') id: string) {
    return this.conversionService.getStatus(id);
  }

  @Get('download/:id')
  download(@Param('id') id: string, @Res() res: Response) {
    const { path, ext } = this.conversionService.getOutputForDownload(id);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="converted.${ext}"`,
    );
    const stream = createReadStream(path);
    stream.on('close', () => {
      void this.conversionService.releaseOutput(id);
    });
    stream.pipe(res);
  }
}
