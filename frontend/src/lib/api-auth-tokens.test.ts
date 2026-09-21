import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSession, refreshSession, saveSession } from "./api";

describe("API session token storage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores the candidate token separately from the access-portal token", () => {
    localStorage.setItem("access_token", "portal-access-token");

    saveSession({ accessToken: "candidate-svp-token" });

    expect(localStorage.getItem("accessToken")).toBe("candidate-svp-token");
    expect(localStorage.getItem("access_token")).toBe("portal-access-token");
  });

  it("clears only the candidate session when the candidate session is invalid", () => {
    saveSession({ accessToken: "stale-candidate-token" });
    localStorage.setItem("access_token", "portal-access-token");
    localStorage.setItem("refreshToken", "refresh-token");
    localStorage.setItem("sessionId", "session-id");

    clearSession();

    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("access_token")).toBe("portal-access-token");
    expect(localStorage.getItem("refreshToken")).toBeNull();
    expect(localStorage.getItem("sessionId")).toBeNull();
  });

  it("refreshes an expired access token without deleting refresh credentials", async () => {
    saveSession({ accessToken: "expired-access-token", refreshToken: "refresh-token", sessionId: "session-id" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: "new-access-token" }), { status: 200 }),
    ));

    await expect(refreshSession()).resolves.toBe("new-access-token");

    expect(localStorage.getItem("accessToken")).toBe("new-access-token");
    expect(localStorage.getItem("refreshToken")).toBe("refresh-token");
    expect(localStorage.getItem("sessionId")).toBe("session-id");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetch as any).mock.calls[0][1].body)).toEqual({
      sessionId: "session-id",
      refreshToken: "refresh-token",
    });
  });

});
