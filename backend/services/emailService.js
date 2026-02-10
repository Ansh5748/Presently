const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    // Primary: Gmail SMTP
    this.gmailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    // 2nd Fallback: Resend.com (using their API)
    this.resendApiKey = process.env.RESEND_API_KEY;
  }

  async sendEmail(to, subject, html) {
    try {
      // Try Gmail SMTP first
      console.log('[Email] Attempting to send via Gmail SMTP...');
      await this.sendViaGmail(to, subject, html);
      console.log('[Email] ✅ Email sent successfully via Gmail SMTP');
      return { success: true, method: 'gmail' };
    } catch (gmailError) {
      console.error('[Email] ❌ Gmail SMTP failed:', gmailError.message);

      try {
        // Fallback to Resend.com
        console.log('[Email] Attempting to send via Resend.com...');
        await this.sendViaResend(to, subject, html);
        console.log('[Email] ✅ Email sent successfully via Resend.com');
        return { success: true, method: 'resend' };
      } catch (resendError) {
        console.error('[Email] ❌ Resend.com failed:', resendError.message);
        throw new Error('All email services failed. Please try again later.');
      }
    }
  }

  async sendViaGmail(to, subject, html) {
    const mailOptions = {
      from: `"Presently - Delivery Tool" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    };

    return await this.gmailTransporter.sendMail(mailOptions);
  }

  async sendViaResend(to, subject, html) {
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Presently <onboarding@resend.dev>',
        to: [to],
        subject,
        html
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend API error: ${error}`);
    }

    return await response.json();
  }

  async sendPasswordResetEmail(email, resetToken, userName) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1e293b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background-color: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>We received a request to reset your password for your Presently account.</p>
            <p>Click the button below to reset your password:</p>
            <center>
              <a href="${resetUrl}" class="button">Reset Password</a>
            </center>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #3b82f6;">${resetUrl}</p>
            <p><strong>⏰ This link will expire in 1 hour.</strong></p>
            <p>If you didn't request this password reset, you can safely ignore this email.</p>
            <p>Best regards,<br>The Presently Team</p>
          </div>
          <div class="footer">
            <p>© 2026 Presently - Freelance Delivery Tool. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, 'Reset Your Password - Presently', html);
  }

  async sendWelcomeEmail(email, userName) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1e293b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to Presently!</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            <p>Thank you for signing up! Your account has been created successfully.</p>
            <p>You can now create and manage your project deliveries with ease.</p>
            <p>Best regards,<br>The Presently Team</p>
          </div>
          <div class="footer">
            <p>© 2026 Presently - Freelance Delivery Tool. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(email, 'Welcome to Presently! 🎉', html);
  }
}

module.exports = new EmailService();
