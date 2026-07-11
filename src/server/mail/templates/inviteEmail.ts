export interface InviteEmailContent {
  to: string;
  inviteeName: string;
  inviterEmail: string;
  welcomeUrl: string;
}

export function renderInviteEmailHtml({
  inviteeName,
  inviterEmail,
  welcomeUrl,
}: InviteEmailContent): string {
  const safeName = escapeHtml(inviteeName);
  const safeInviter = escapeHtml(inviterEmail);
  const safeUrl = escapeHtml(welcomeUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>You're invited to The Conglomerate</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;color:#f5f0e8;font-family:Manrope,Inter,Segoe UI,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a0a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:40px 32px;">
          <tr>
            <td style="text-align:center;padding-bottom:24px;">
              <p style="margin:0;font-family:Bodoni Moda,Georgia,serif;font-size:32px;font-weight:700;color:#f5f0e8;">The Conglomerate</p>
              <p style="margin:12px 0 0;font-size:16px;color:#b8b0a4;">A private archive.</p>
            </td>
          </tr>
          <tr>
            <td style="font-size:16px;line-height:1.6;color:#d9d2c7;">
              <p style="margin:0 0 16px;">Hi ${safeName},</p>
              <p style="margin:0 0 16px;">
                ${safeInviter} invited you to explore The Conglomerate — our private band archive.
              </p>
              <p style="margin:0 0 28px;">
                Use the button below to get started. You'll sign in with Google or a one-time email PIN.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <a href="${safeUrl}" style="display:inline-block;background:#078a70;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:8px;">
                Accept invitation
              </a>
            </td>
          </tr>
          <tr>
            <td style="font-size:13px;line-height:1.5;color:#8f877c;text-align:center;">
              <p style="margin:0;">This link expires in seven days. If you weren't expecting this invite, you can ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderInviteEmailText({
  inviteeName,
  inviterEmail,
  welcomeUrl,
}: InviteEmailContent): string {
  return [
    `Hi ${inviteeName},`,
    "",
    `${inviterEmail} invited you to explore The Conglomerate — our private band archive.`,
    "",
    `Accept your invitation: ${welcomeUrl}`,
    "",
    "This link expires in seven days. If you weren't expecting this invite, you can ignore this email.",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
