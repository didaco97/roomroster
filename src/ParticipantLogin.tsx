import { useEffect, useId, useState, type FormEvent } from "react";
import { LoaderCircle, Mail } from "lucide-react";
import { api, DEMO } from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

export default function ParticipantLogin({
  event,
  initialEmail = "",
  initialCodeSent = false,
  onAuthenticated,
  onJoin,
}: {
  event: string;
  initialEmail?: string;
  initialCodeSent?: boolean;
  onAuthenticated: () => Promise<void>;
  onJoin: () => void;
}) {
  const id = useId();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(initialCodeSent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    initialCodeSent ? "Your welcome email includes your code." : "",
  );
  const [seconds, setSeconds] = useState(initialCodeSent ? 60 : 0);
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    if (!seconds) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  async function requestCode() {
    const r = await api("participant-request-code", {
      event,
      email: email.trim().toLowerCase(),
    });
    setSent(true);
    setSeconds(60);
    setCode("");
    setNotice(r.message);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (verified) return await onAuthenticated();
      if (!sent) await requestCode();
      else {
        await api("participant-login", {
          event,
          email: email.trim().toLowerCase(),
          code,
        });
        setVerified(true);
        await onAuthenticated();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="sign-in-form" aria-busy={busy}>
      {!verified && (
        <button
          type="button"
          className="text-link sign-in-join"
          disabled={busy}
          onClick={onJoin}
        >
          New here? Create your profile <span aria-hidden="true">→</span>
        </button>
      )}
      <label className="field" htmlFor={id + "email"}>
        Your email
        <Input
          id={id + "email"}
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          disabled={sent || busy}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {sent && !verified && (
        <label className="field" htmlFor={id + "code"}>
          Six-digit sign-in code
          <Input
            id={id + "code"}
            className="otp-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-describedby={id + "hint"}
          />
          <small id={id + "hint"}>
            {DEMO
              ? "Preview code: 123456"
              : "Expires in 10 minutes. Check spam too."}
          </small>
        </label>
      )}
      {notice && (
        <p role="status" className="sign-in-note">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? (
          <LoaderCircle className="loading-spin" aria-hidden="true" />
        ) : (
          <Mail size={17} />
        )}
        {busy
          ? "One moment…"
          : verified
            ? "Open my profile"
            : sent
              ? "Verify & sign in"
              : "Email my code"}
      </Button>
      {sent && !verified && (
        <div className="inline-actions sign-in-options">
          <button
            type="button"
            className="text-link"
            disabled={busy || seconds > 0}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await requestCode();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {seconds > 0 ? `Resend in ${seconds}s` : "Resend code"}
          </button>
          <button
            type="button"
            className="text-link"
            disabled={busy}
            onClick={() => {
              setSent(false);
              setNotice("");
              setError("");
            }}
          >
            Use another email
          </button>
        </div>
      )}
    </form>
  );
}
