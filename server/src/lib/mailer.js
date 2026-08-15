import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return transporter;
}

export function isMailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export async function sendPasswordResetEmail(toEmail, resetUrl) {
  const t = getTransporter();
  if (!t) throw new Error("메일 발송 기능이 서버에 설정되어 있지 않습니다.");

  await t.sendMail({
    from: `"Verilog 협업 사이트" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: "[Verilog 협업 사이트] 비밀번호 재설정",
    text: `비밀번호를 재설정하려면 아래 링크를 열어주세요 (1시간 동안 유효):\n\n${resetUrl}\n\n요청하지 않으셨다면 이 메일을 무시하셔도 됩니다.`,
    html: `
      <p>비밀번호를 재설정하려면 아래 버튼을 눌러주세요 (1시간 동안 유효).</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#0e639c;color:#fff;text-decoration:none;border-radius:4px;">비밀번호 재설정</a></p>
      <p>버튼이 안 눌리면 이 주소를 복사해서 브라우저에 붙여넣으세요:<br>${resetUrl}</p>
      <p style="color:#888;font-size:12px;">요청하지 않으셨다면 이 메일을 무시하셔도 됩니다.</p>
    `,
  });
}
