import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, saveSession } from "./api";

describe("API session token storage", () => {
  beforeEach(() => {
    localStorage.clear();
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
});
