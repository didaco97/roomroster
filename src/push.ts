// Push notification plumbing for the installed app and the browser.
// Subscribing is silent when permission was granted before; asking always
// happens from a visible button, never on page load.
import { api } from "./api";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): "granted" | "default" | "denied" | "unsupported" {
  return pushSupported() ? Notification.permission : "unsupported";
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

function urlKeyToBytes(key: string): Uint8Array {
  const pad = "=".repeat((4 - (key.length % 4)) % 4);
  const bin = atob((key + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type PushResult = "enabled" | "denied" | "unsupported" | "dismissed" | "failed";

// Ask (when ask=true) and subscribe this device, then store the subscription on
// the signed-in profile. Resolves "dismissed" when the prompt is closed.
export async function enablePush(event: string, ask: boolean): Promise<PushResult> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "default") {
    if (!ask) return "dismissed";
    let answer: NotificationPermission;
    try {
      answer = await Notification.requestPermission();
    } catch {
      return "failed";
    }
    if (answer === "default") return "dismissed";
    if (answer !== "granted") return "denied";
  }
  try {
    const reg =
      (await navigator.serviceWorker.getRegistration("/")) ||
      (await registerServiceWorker());
    if (!reg || !reg.pushManager) return "unsupported";
    const { key } = await api<{ key: string }>("push-key", { event });
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlKeyToBytes(key) as BufferSource,
    });
    await api("push-subscribe", { event, subscription: sub.toJSON() });
    return "enabled";
  } catch {
    return "failed";
  }
}

// Remove this device's subscription everywhere (settings toggle).
export async function disablePush(event: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api("push-unsubscribe", {
        event,
        subscription: { endpoint: sub.endpoint },
      });
      await sub.unsubscribe();
    }
  } catch {
    // Best effort: the server forgets the endpoint when the push service drops it.
  }
}
