import { Module } from '@nestjs/common';
import { YardController } from './yard.controller.js';
import { YardService } from './yard.service.js';

@Module({
  controllers: [YardController],
  providers: [YardService],
  exports: [YardService],
})
export class YardModule {}
