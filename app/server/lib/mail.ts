import type { Env } from "../env";

/** 可选邮件发送（Resend HTTP API）。未配置 RESEND_API_KEY / MAIL_FROM 时视为关闭。 */
export function mailEnabled(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!
  ));
}

export async function sendActionMail(
  env: Env,
  input: { to: string; subject: string; intro: string; actionText: string; url: string }
): Promise<void> {
  if (!mailEnabled(env)) throw new Error("mail is not configured");
  const url = escapeHtml(input.url);
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#1f2937">
<p>${escapeHtml(input.intro)}</p>
<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(input.actionText)}</a></p>
<p style="font-size:12px;color:#6b7280">如果按钮无法点击，请复制此链接到浏览器：<br>${url}</p>
<p style="font-size:12px;color:#6b7280">如果这不是你本人的操作，请忽略这封邮件。</p>
</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [input.to],
      subject: input.subject,
      html,
      text: `${input.intro}\n\n${input.actionText}：${input.url}\n\n如果这不是你本人的操作，请忽略这封邮件。`,
    }),
  });
  if (!res.ok) {
    console.error("[mail] send failed", res.status, await res.text().catch(() => ""));
    throw new Error(`mail send failed: ${res.status}`);
  }
}
