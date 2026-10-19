import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // 前端與後端不同源（Vite dev、Tauri webview），不 expose 的話 fetch 讀不到下載檔名
  app.enableCors({ exposedHeaders: ['Content-Disposition'] });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
