import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UseGuards } from "@nestjs/common";
import type {
  AuthResponse,
  AuthUser,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
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

  @UseGuards(JwtAuthGuard)
  @Patch("me")
  updateProfile(
    @CurrentUser() principal: AuthPrincipal,
    @Body() body: UpdateProfileRequest,
  ): Promise<AuthUser> {
    return this.auth.updateProfile(principal.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  @HttpCode(200)
  changePassword(
    @CurrentUser() principal: AuthPrincipal,
    @Body() body: ChangePasswordRequest,
  ): Promise<{ message: string }> {
    return this.auth.changePassword(principal.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("me")
  @HttpCode(200)
  deleteAccount(@CurrentUser() principal: AuthPrincipal): Promise<{ message: string }> {
    return this.auth.deleteAccount(principal.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("wipe-data")
  @HttpCode(200)
  wipeData(@CurrentUser() principal: AuthPrincipal): Promise<{ message: string }> {
    return this.auth.wipeData(principal.id);
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
