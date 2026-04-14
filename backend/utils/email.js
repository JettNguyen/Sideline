const nodemailer = require('nodemailer');

const EMAIL_ENABLED = String(process.env.EMAIL_ENABLED ?? 'true').toLowerCase() === 'true';
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const hasSmtpConfig =
    !!process.env.EMAIL_HOST &&
    !!process.env.EMAIL_USER &&
    !!process.env.EMAIL_PASS &&
    !!process.env.EMAIL_FROM;

const parseSender = (fromValue) => {
    const fallback = { email: fromValue, name: 'Sideline' };

    if (!fromValue) {
        return fallback;
    }

    const match = fromValue.match(/^(.*?)\s*<([^>]+)>$/);
    if (!match) {
        return fallback;
    }

    const name = match[1].trim().replace(/^"|"$/g, '');
    const email = match[2].trim();
    return {
        name: name || 'Sideline',
        email,
    };
};

const transporter = EMAIL_ENABLED && hasSmtpConfig
    ? nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT || 587),
        secure: String(process.env.EMAIL_SECURE).toLowerCase() === 'true',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
    })
    : null;

if (!EMAIL_ENABLED) {
    console.warn('Email sending disabled via EMAIL_ENABLED=false');
}
else if (!hasSmtpConfig) {
    console.warn('Email sending disabled: missing one or more EMAIL_* SMTP variables');
}
else {
    transporter.verify().catch((err) => {
        console.warn('SMTP verify failed at startup:', err?.message || err);
    });
}

const sendMailSafe = async ({ to, subject, html }) => {
    if (BREVO_API_KEY) {
        const sender = parseSender(process.env.EMAIL_FROM);
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                sender,
                to: [{ email: to }],
                subject,
                htmlContent: html,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`Brevo API error (${response.status}): ${errorText}`);
            error.code = `BREVO_${response.status}`;
            throw error;
        }

        return response.json().catch(() => ({ ok: true }));
    }

    if (!transporter) {
        return { skipped: true, reason: 'email-disabled-or-misconfigured' };
    }

    return transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        html,
    });
};

const sendVerificationEmail = async ({ to, username, verificationUrl }) => {
    const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <h2>Verify your Sideline account</h2>
            <p>Hi ${username},</p>
            <p>Thanks for creating your account! Please verify your email by clicking the button below:</p>
            <p>
                <a
                    href="${verificationUrl}"
                    style="
                        display: inline-block;
                        padding: 12px 20px;
                        background-color: #2563eb;
                        color: #ffffff;
                        text-decoration: none;
                        border-radius: 6px;
                        font-weight: bold;
                    "
                >
                    Verify Email
                </a>
            </p>
            <p>If the button does not work, use this link:</p>
            <p>${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
        </div>
    `;

    return sendMailSafe({
        to,
        subject: 'Verify your Sideline account',
        html,
    });
};

const sendPasswordResetEmail = async ({ to, username, resetUrl }) => {
    const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <h2>Reset your Sideline password</h2>
            <p>Hi ${username},</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <p>
                <a
                    href="${resetUrl}"
                    style="
                        display: inline-block;
                        padding: 15px 20px;
                        background-color: #2f6fe0;
                        color: #f7f7f7;
                        text-decoration: none;
                        border-radius: 10px;
                        font-weight: bold;
                    "
                >
                    Reset Password
                </a>
            </p>
            <p>If the button does not work, use this link:</p>
            <p>${resetUrl}</p>
            <p>This link will expire in 1 hour.</p>
        </div>
    `;

    return sendMailSafe({
        to,
        subject: 'Reset your Sideline password',
        html,
    });
};

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
};