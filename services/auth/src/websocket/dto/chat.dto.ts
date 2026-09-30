import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  MaxLength,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class JoinChannelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  channelId: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  channelId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string;

  @IsOptional()
  @IsIn(['text', 'system', 'ai-alert'])
  type?: 'text' | 'system' | 'ai-alert';
}

export class MessageReactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  channelId: string;

  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  emoji: string;
}

export class PinMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  channelId: string;

  @IsString()
  @IsNotEmpty()
  messageId: string;
}

export class DeleteMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  channelId: string;

  @IsString()
  @IsNotEmpty()
  messageId: string;
}

export class UserPresenceDto {
  @IsIn(['online', 'away', 'offline'])
  status: 'online' | 'away' | 'offline';
}

export class TypingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  channelId: string;
}

export class GetChannelMessagesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  channelId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AiAlertDto {
  @IsOptional()
  @IsString()
  channelId?: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsIn(['CRITICAL', 'HIGH', 'MEDIUM', 'INFO'])
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO';

  @IsOptional()
  @IsString()
  repo?: string;

  @IsOptional()
  @IsString()
  file?: string;

  @IsOptional()
  @IsNumber()
  line?: number;
}
