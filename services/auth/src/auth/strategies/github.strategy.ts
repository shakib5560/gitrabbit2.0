import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { AuthService } from '../auth.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(private authService: AuthService) {
    super({
      clientID: process.env.GITHUB_CLIENT_ID || 'missing_client_id',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || 'missing_secret',
      callbackURL: process.env.GITHUB_CALLBACK_URL || 'missing_callback_url',
      scope: ['user:email'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: any) {
    const user = await this.authService.validateOAuthLogin(profile);
    done(null, user);
  }
}
