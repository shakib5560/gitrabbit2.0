import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { WebsocketService } from './websocket.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { JwtModule } from '@nestjs/jwt';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [JwtModule.register({}), PrismaModule],
  providers: [WebsocketGateway, WebsocketService, WsJwtGuard],
  exports: [WebsocketGateway, WebsocketService, WsJwtGuard],
})
export class WebsocketModule {}
