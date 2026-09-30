import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('WebsocketGateway (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let port: number;
  let testUser: any;
  let validToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    port = typeof address === 'string' ? 3000 : address.port;

    // Create a temporary test user
    const email = `ws_test_${Date.now()}@gitrabbit.co`;
    testUser = await prisma.user.create({
      data: {
        name: 'WebSocket Tester',
        email,
        role: 'ADMIN',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=60',
      },
    });

    validToken = await jwtService.signAsync(
      { sub: testUser.id, email: testUser.email, role: testUser.role },
      {
        secret:
          process.env.JWT_ACCESS_SECRET ||
          process.env.JWT_SECRET ||
          'zV8adrd31EFoqU6O2f3R24qYQGamxvMWIzSYwrJ4nSe',
        expiresIn: '1h',
      },
    );
  }, 30000);

  afterAll(async () => {
    try {
      if (testUser?.id) {
        await prisma.chatMessage.deleteMany({ where: { userId: testUser.id } });
        await prisma.user.delete({ where: { id: testUser.id } });
      }
    } catch {}
    await app.close();
  });

  it('should reject unauthenticated connection without token', (done) => {
    const socket: ClientSocket = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('unauthorized', (data) => {
      expect(data).toHaveProperty('message');
      socket.disconnect();
      done();
    });

    socket.on('connect', () => {
      // If connected without token, wait to ensure it gets disconnected
      setTimeout(() => {
        if (!socket.connected) {
          done();
        }
      }, 500);
    });
  });

  it('should successfully connect with valid JWT token and receive initial state', (done) => {
    const socket: ClientSocket = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: validToken },
    });

    socket.on('connected', (data) => {
      expect(data).toHaveProperty('user');
      expect(data.user.email).toBe(testUser.email);
      expect(data).toHaveProperty('channels');
      expect(data).toHaveProperty('members');
      expect(Array.isArray(data.channels)).toBe(true);
      expect(Array.isArray(data.members)).toBe(true);
      socket.disconnect();
      done();
    });
  });

  it('should handle ping and return pong with timestamp', (done) => {
    const socket: ClientSocket = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: validToken },
    });

    socket.on('connect', () => {
      socket.emit('ping');
    });

    socket.on('pong', (data) => {
      expect(data).toBeDefined();
      socket.disconnect();
      done();
    });
  });

  it('should join channel, fetch messages, and send a message', (done) => {
    const socket: ClientSocket = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: validToken },
    });

    const channelId = 'code-reviews';
    const messageContent = 'Test PR review comment on AST analysis!';

    socket.on('connected', () => {
      socket.emit('join_channel', { channelId });
    });

    socket.on('joined_channel', (data) => {
      expect(data.channelId).toBe(channelId);
      socket.emit('send_message', {
        channelId,
        content: messageContent,
        type: 'text',
      });
    });

    socket.on('new_message', (msg) => {
      if (msg.content === messageContent) {
        expect(msg.channelId).toBe(channelId);
        expect(msg.author).toBe(testUser.name);
        expect(msg.content).toBe(messageContent);
        expect(msg.type).toBe('text');
        expect(msg).toHaveProperty('timestamp');
        socket.disconnect();
        done();
      }
    });
  });

  it('should toggle message reaction and broadcast updated reactions', (done) => {
    const socket: ClientSocket = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: validToken },
    });

    const channelId = 'general';
    let createdMsgId: string;

    socket.on('connected', () => {
      socket.emit('join_channel', { channelId });
    });

    socket.on('joined_channel', () => {
      socket.emit('send_message', {
        channelId,
        content: 'Reaction testing message',
        type: 'text',
      });
    });

    socket.on('new_message', (msg) => {
      if (msg.content === 'Reaction testing message') {
        createdMsgId = msg.id;
        socket.emit('message_reaction', {
          channelId,
          messageId: createdMsgId,
          emoji: '🚀',
        });
      }
    });

    socket.on('reaction_updated', (data) => {
      if (data.messageId === createdMsgId) {
        expect(data.channelId).toBe(channelId);
        expect(Array.isArray(data.reactions)).toBe(true);
        const rocketReaction = data.reactions.find((r: any) => r.emoji === '🚀');
        expect(rocketReaction).toBeDefined();
        expect(rocketReaction.count).toBeGreaterThanOrEqual(1);
        socket.disconnect();
        done();
      }
    });
  });

  it('should broadcast presence updates when status changes', (done) => {
    const socket: ClientSocket = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: validToken },
    });

    socket.on('connected', () => {
      socket.emit('user_presence', { status: 'away' });
    });

    socket.on('presence_updated', (members) => {
      expect(Array.isArray(members)).toBe(true);
      const me = members.find((m: any) => m.name === testUser.name);
      if (me && me.status === 'away') {
        expect(me.status).toBe('away');
        socket.disconnect();
        done();
      }
    });
  });

  it('should broadcast AI alerts to #ai-alerts room and globally', (done) => {
    const socket: ClientSocket = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: validToken },
    });

    const alertContent = 'AST memory leak detected in core loop';

    socket.on('connected', () => {
      socket.emit('join_channel', { channelId: 'ai-alerts' });
    });

    socket.on('joined_channel', () => {
      socket.emit('ai_alert', {
        channelId: 'ai-alerts',
        content: alertContent,
        severity: 'CRITICAL',
      });
    });

    socket.on('global_alert', (data) => {
      if (data.content === alertContent) {
        expect(data.severity).toBe('CRITICAL');
        expect(data.channelId).toBe('ai-alerts');
        socket.disconnect();
        done();
      }
    });
  });
});
