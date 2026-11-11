import { connect } from "node:tls";

// Open implicit TLS by hostname. Workers can reject Nodemailer's default
// resolved-IP connection, even when the same transport works in Node locally.
export function gmailTransportOptions() {
  const host = "smtp.gmail.com";
  return {
    host,
    port: 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: 10000,
    socketTimeout: 15000,
    getSocket(_options: unknown, callback: (error: Error | null, result: any) => void) {
      const socket = connect({ host, port: 465, servername: host, rejectUnauthorized: true });
      let settled = false;
      const finish = (error: Error | null) => {
        if (settled) return;
        settled = true;
        socket.setTimeout(0);
        callback(error, error ? false : { connection: socket, secured: true });
      };
      socket.setTimeout(10000, () => {
        finish(Object.assign(new Error("SMTP connection timeout"), { code: "ETIMEDOUT" }));
        socket.destroy();
      });
      socket.once("secureConnect", () => finish(null));
      socket.once("error", finish);
    },
  };
}

// Never log error.message, response, addresses, payloads or credentials.
export function safeMailFailure(error: unknown) {
  const e = error as { code?: string; command?: string; responseCode?: number } | null;
  const codes = ["EAUTH", "ESOCKET", "ECONNECTION", "ETIMEDOUT", "EDNS", "ETLS", "EENVELOPE", "EMESSAGE"];
  const commands = ["CONN", "EHLO", "HELO", "STARTTLS", "AUTH", "AUTH PLAIN", "AUTH LOGIN", "MAIL FROM", "RCPT TO", "DATA"];
  return {
    code: codes.includes(e?.code || "") ? e!.code : "UNKNOWN",
    stage: commands.includes(e?.command || "") ? e!.command : "UNKNOWN",
    responseCode: Number.isInteger(e?.responseCode) && e!.responseCode! >= 400 && e!.responseCode! <= 599 ? e!.responseCode : undefined,
  };
}
