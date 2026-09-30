import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseFilters, UsePipes, ValidationPipe, Logger } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { WebsocketService, DEFAULT_CHANNELS } from './websocket.service';
import { WebsocketExceptionsFilter } from './filters/ws-exception.filter';
import { RedisService } from '../redis/redis.service';
import {
  JoinChannelDto,
  SendMessageDto,
  MessageReactionDto,
  PinMessageDto,
  DeleteMessageDto,
  UserPresenceDto,
  TypingDto,
  GetChannelMessagesDto,
  AiAlertDto,
} from './dto/chat.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
})
@UseFilters(new WebsocketExceptionsFilter())
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(
    private readonly websocketService: WebsocketService,
    private readonly redisService: RedisService,
  ) {}

  afterInit(server: Server) {
    try {
      const pubClient = this.redisService.getClient();
      const subClient = this.redisService.createDuplicateClient();
      server.adapter(createAdapter(pubClient, subClient));
      this.logger.log('Socket.IO Redis Adapter successfully attached for horizontal pub/sub!');
    } catch (err: any) {
      this.logger.warn(
        `Failed to attach Socket.IO Redis Adapter: ${err.message}. Defaulting to in-memory adapter.`,
      );
    }
  }

  /**
   * Handle new WebSocket connection and authentication
   */
  async handleConnection(client: Socket) {
    const user = await this.websocketService.handleConnection(client);
    if (!user) return;

    // Send connection acknowledgment and initial state
    client.emit('connected', {
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
      channels: DEFAULT_CHANNELS,
      members: this.websocketService.getOnlineMembers(),
    });

    // Broadcast presence update to all clients
    this.broadcastPresence();
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    const result = this.websocketService.handleDisconnect(client);
    if (result && result.remainingSockets === 0) {
      this.broadcastPresence();
    }
  }

  /**
   * Broadcast updated active presence list to all connected clients
   */
  private broadcastPresence() {
    const members = this.websocketService.getOnlineMembers();
    this.server.emit('presence_updated', members);
  }

  /**
   * Ping / Heartbeat
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket): { event: string; timestamp: number } {
    return { event: 'pong', timestamp: Date.now() };
  }

  /**
   * Join a specific channel room and retrieve its messages
   */
  @SubscribeMessage('join_channel')
  async handleJoinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinChannelDto,
  ) {
    const user = this.websocketService.getUser(client);
    if (!user) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    const room = this.websocketService.joinChannel(client, dto.channelId);
    const messages = await this.websocketService.getChannelMessages(dto.channelId, user.userId);

    client.emit('joined_channel', { channelId: dto.channelId, room });
    client.emit('channel_messages', { channelId: dto.channelId, messages });
  }

  /**
   * Leave a channel room
   */
  @SubscribeMessage('leave_channel')
  handleLeaveChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinChannelDto,
  ) {
    this.websocketService.leaveChannel(client, dto.channelId);
    client.emit('left_channel', { channelId: dto.channelId });
  }

  /**
   * Explicitly request message history for a channel
   */
  @SubscribeMessage('get_channel_messages')
  async handleGetMessages(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: GetChannelMessagesDto,
  ) {
    const user = this.websocketService.getUser(client);
    const messages = await this.websocketService.getChannelMessages(
      dto.channelId,
      user?.userId,
      dto.limit || 50,
    );
    client.emit('channel_messages', { channelId: dto.channelId, messages });
  }

  /**
   * Send a new message to a channel
   */
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const message = await this.websocketService.sendMessage(client, dto);

    // Broadcast to the channel room (including the sender)
    this.server.to(`channel:${dto.channelId}`).emit('new_message', message);
    return message;
  }

  /**
   * Add or toggle reaction on a message
   */
  @SubscribeMessage('message_reaction')
  async handleReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: MessageReactionDto,
  ) {
    const result = await this.websocketService.toggleReaction(client, dto);

    // Broadcast to channel room
    this.server.to(`channel:${dto.channelId}`).emit('reaction_updated', {
      channelId: dto.channelId,
      messageId: result.messageId,
      reactions: result.reactions,
    });
    return result;
  }

  /**
   * Pin or unpin a message
   */
  @SubscribeMessage('pin_message')
  async handlePinMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: PinMessageDto,
  ) {
    const result = await this.websocketService.pinMessage(client, dto);

    this.server.to(`channel:${dto.channelId}`).emit('message_pinned', {
      channelId: dto.channelId,
      messageId: result.messageId,
      isPinned: result.isPinned,
    });
    return result;
  }

  /**
   * Delete a message
   */
  @SubscribeMessage('delete_message')
  async handleDeleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: DeleteMessageDto,
  ) {
    const result = await this.websocketService.deleteMessage(client, dto);

    this.server.to(`channel:${dto.channelId}`).emit('message_deleted', {
      channelId: dto.channelId,
      messageId: result.messageId,
    });
    return result;
  }

  /**
   * Update presence status
   */
  @SubscribeMessage('user_presence')
  handlePresence(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: UserPresenceDto,
  ) {
    const updated = this.websocketService.updatePresence(client, dto.status);
    if (updated) {
      this.broadcastPresence();
    }
    return { status: dto.status };
  }

  /**
   * Typing indicators
   */
  @SubscribeMessage('typing_start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: TypingDto,
  ) {
    const user = this.websocketService.getUser(client);
    if (!user) return;

    client.to(`channel:${dto.channelId}`).emit('user_typing', {
      channelId: dto.channelId,
      userId: user.userId,
      name: user.name,
      isTyping: true,
    });
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: TypingDto,
  ) {
    const user = this.websocketService.getUser(client);
    if (!user) return;

    client.to(`channel:${dto.channelId}`).emit('user_typing', {
      channelId: dto.channelId,
      userId: user.userId,
      name: user.name,
      isTyping: false,
    });
  }

  /**
   * AI Alert dispatch (can be called by internal services or admin socket)
   */
  @SubscribeMessage('ai_alert')
  async handleAiAlert(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: AiAlertDto,
  ) {
    const alertMessage = await this.websocketService.createAiAlert(dto);

    // Broadcast to `#ai-alerts` room
    this.server.to('channel:ai-alerts').emit('new_message', alertMessage);

    // Also broadcast global notification
    this.server.emit('global_alert', {
      type: 'ai-alert',
      severity: dto.severity || 'CRITICAL',
      content: dto.content,
      channelId: 'ai-alerts',
      message: alertMessage,
    });

    return alertMessage;
  }
}
