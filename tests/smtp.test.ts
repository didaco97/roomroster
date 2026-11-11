import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ handlers: {} as Record<string, Function>, timeout: null as Function | null, options: null as any, socket: null as any }));
vi.mock("node:tls", () => ({ connect: (options: any) => {
  state.options = options;
  return state.socket;
} }));
import { gmailTransportOptions, safeMailFailure } from "../server/smtp";
beforeEach(() => {
  state.handlers = {};
  state.timeout = null;
  state.socket = { setTimeout: vi.fn((_ms, cb) => { if (cb) state.timeout = cb; }), once: vi.fn((name, cb) => { state.handlers[name] = cb; }), destroy: vi.fn() };
});
describe("Gmail SMTP socket", () => {
  it("connects by hostname with TLS verification and hands over once", () => {
    const callback = vi.fn();
    const options = gmailTransportOptions();
    expect(options.port).toBe(465);
    expect(options.secure).toBe(true);
    options.getSocket({}, callback);
    expect(state.options).toEqual({ host: "smtp.gmail.com", port: 465, servername: "smtp.gmail.com", rejectUnauthorized: true });
    state.handlers.secureConnect();
    state.handlers.error(new Error("late"));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(null, { connection: state.socket, secured: true });
  });
  it("times out without handing an unverified socket to SMTP", () => {
    const callback = vi.fn();
    gmailTransportOptions().getSocket({}, callback);
    state.timeout!();
    expect(callback.mock.calls[0][0].code).toBe("ETIMEDOUT");
    expect(callback.mock.calls[0][1]).toBe(false);
    expect(state.socket.destroy).toHaveBeenCalledOnce();
  });
  it("logs only allowlisted diagnostic fields", () => {
    expect(safeMailFailure({ code: "EAUTH", command: "AUTH PLAIN", responseCode: 535, message: "private", response: "private" })).toEqual({ code: "EAUTH", stage: "AUTH PLAIN", responseCode: 535 });
    expect(JSON.stringify(safeMailFailure({ code: "private", command: "private", responseCode: "private" }))).not.toContain("private");
    expect(safeMailFailure(null).code).toBe("UNKNOWN");
  });
});
