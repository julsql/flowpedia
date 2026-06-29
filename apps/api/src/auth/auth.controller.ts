import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import type {
  AuthResponse,
  AuthUser,
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from "@flowpedia/shared";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard, type AuthPrincipal } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() body: RegisterRequest): Promise<AuthResponse> {
    return this.auth.register(body);
  }

  @Post("login")
  @HttpCode(200)
  login(@Body() body: LoginRequest): Promise<AuthResponse> {
    return this.auth.login(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() principal: AuthPrincipal): Promise<AuthUser> {
    return this.auth.me(principal.id);
  }

  @Post("forgot-password")
  @HttpCode(200)
  forgotPassword(@Body() body: ForgotPasswordRequest): Promise<{ message: string }> {
    return this.auth.forgotPassword(body.email);
  }

  @Post("reset-password")
  @HttpCode(200)
  resetPassword(@Body() body: ResetPasswordRequest): Promise<{ message: string }> {
    return this.auth.resetPassword(body);
  }
}
