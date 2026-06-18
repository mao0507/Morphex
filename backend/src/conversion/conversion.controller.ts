import {
  BadRequestException,
  Body,
  Controller,
  Get,
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

@Controller()
export class ConversionController {
  constructor(private readonly conversionService: ConversionService) {}

  @Get('formats')
  getFormats() {
    return this.conversionService.listFormats();
  }

  @Post('convert')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async convert(
    @UploadedFile() file: Express.Multer.File,
    @Body('format') format: string,
  ) {
    if (!file) {
      throw new BadRequestException('請上傳檔案');
    }
    if (!format || typeof format !== 'string') {
      throw new BadRequestException('請指定輸出格式');
    }

    return this.conversionService.convert(file, format);
  }

  @Get('download/:id')
  download(@Param('id') id: string, @Res() res: Response) {
    const { path, ext } = this.conversionService.getOutputForDownload(id);

    res.setHeader('Content-Disposition', `attachment; filename="converted.${ext}"`);
    const stream = createReadStream(path);
    stream.on('close', () => {
      void this.conversionService.releaseOutput(id);
    });
    stream.pipe(res);
  }
}
