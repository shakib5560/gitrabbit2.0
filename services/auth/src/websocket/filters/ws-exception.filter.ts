import { Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Catch()
export class WebsocketExceptionsFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WebsocketExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<Socket>();
    const error =
      exception instanceof WsException
        ? exception.getError()
        : exception instanceof Error
          ? exception.message
          : 'Internal WebSocket error';

    this.logger.error(`WebSocket error for client ${client.id}: ${JSON.stringify(error)}`);

    client.emit('error', {
      event: 'error',
      statusCode: 400,
      timestamp: new Date().toISOString(),
      message: typeof error === 'string' ? error : (error as any)?.message || 'An error occurred',
    });
  }
}
