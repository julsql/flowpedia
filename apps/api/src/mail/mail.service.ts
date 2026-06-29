import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";

/**
 * Outbound email via Gmail SMTP (mirrors the speciarium setup: smtp.gmail.com:587
 * + STARTTLS, EMAIL_HOST_USER/EMAIL_HOST_PASSWORD). When those env vars are unset
 * the email is logged to the console instead of sent — same dev behaviour as
 * speciarium's console backend, and consistent with the API running infra-less.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;

  constructor(private readonly config: ConfigService) {
    const user = this.config.get<string>("EMAIL_HOST_USER");
    const pass = this.config.get<string>("EMAIL_HOST_PASSWORD");
    if (user && pass) {
      this.transporter = createTransport({
        host: this.config.get<string>("EMAIL_HOST", "smtp.gmail.com"),
        port: Number(this.config.get("EMAIL_PORT", 587)),
        secure: false, // STARTTLS on 587
        auth: { user, pass },
      });
    } else {
      this.logger.log("No EMAIL_HOST_USER/PASSWORD — emails are logged to console (dev).");
    }
  }

  private get from(): string {
    return this.config.get<string>("EMAIL_HOST_USER", "no-reply@flowpedia.app");
  }

  /** Password-reset email — same content/validity (3 days) as speciarium. */
  async sendPasswordReset(to: string, displayName: string, link: string): Promise<void> {
    const subject = "Réinitialisation de votre mot de passe Flowpedia";
    const html = `
      <p>Bonjour ${escapeHtml(displayName)},</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous :</p>
      <p><a href="${link}">${link}</a></p>
      <p>Ce lien est valide pendant 3 jours.</p>
      <p>Si vous n'avez rien demandé, ignorez ce message.</p>
      <p>Merci,<br/>L'équipe Flowpedia</p>
    `;
    await this.send(to, subject, html, `Lien de réinitialisation (valide 3 jours) : ${link}`);
  }

  private async send(to: string, subject: string, html: string, devSummary: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[DEV email] To: ${to} — ${subject}\n${devSummary}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (err) {
      // Never let a mail failure break the request flow (e.g. forgot-password
      // stays best-effort and non-revealing).
      this.logger.warn(`Failed to send "${subject}" to ${to}: ${String(err)}`);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
