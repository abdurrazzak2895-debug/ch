import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAccessAuth } from "@/contexts/AccessAuthContext";
import "@/styles/auth-premium.css";

export default function AccessLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"info" | "ok" | "error">("info");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAccessAuth();

  function openYopmailInbox(value: string) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized.endsWith("@yopmail.com")) return;
    const mailbox = normalized.slice(0, -"@yopmail.com".length);
    if (!mailbox) return;
    window.open(`https://yopmail.com/?${encodeURIComponent(mailbox)}`, "_blank", "noopener,noreferrer");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    openYopmailInbox(email);
    setLoading(true);
    setMsg("");
    try {
      const user = await login(email, password);
      if (user.role === "ADMIN" || user.role === "AGENCY") {
        setMsg("Login successful. Redirecting to dashboard…");
        setMsgType("ok");
        navigate("/access/dashboard");
        return;
      }

      sessionStorage.setItem("portal_login", email);
      setMsg("Login successful. Redirecting to dashboard…");
      setMsgType("ok");
      navigate("/dashboard");
    } catch (error: unknown) {
      const value = error as { message?: string; data?: { message?: unknown } };
      const detail = value.data?.message || value.message || "Login failed";
      setMsg(typeof detail === "string" ? detail : JSON.stringify(detail));
      setMsgType("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ap-shell">
      <aside className="ap-brand-panel">
        <div className="ap-brand-head">
          <div className="ap-brand-mark">A</div>
          <div className="ap-brand-title">
            <strong>Access Control</strong>
            <span>Admin & agency portal</span>
          </div>
        </div>

        <div className="ap-brand-copy">
          <span className="ap-brand-eyebrow">Restricted area · Authorized only</span>
          <h2>Elevated access to the <em>accreditation</em> command centre</h2>
          <p>Administrators and agencies sign in here to manage users, agencies, test centres and section-level booking rules.</p>
        </div>

        <div className="ap-brand-features">
          <div className="ap-brand-feature">
            <div className="ap-brand-feature-icon">◆</div>
            <div className="ap-brand-feature-copy">
              <strong>Role-based control</strong>
              <span>Admin, agency and user permissions are enforced everywhere.</span>
            </div>
          </div>
          <div className="ap-brand-feature">
            <div className="ap-brand-feature-icon">⊡</div>
            <div className="ap-brand-feature-copy">
              <strong>Fleet-wide visibility</strong>
              <span>Manage centres, sessions and section rules from one panel.</span>
            </div>
          </div>
          <div className="ap-brand-feature">
            <div className="ap-brand-feature-icon">⇄</div>
            <div className="ap-brand-feature-copy">
              <strong>Auto SVP hand-off</strong>
              <span>Regular users are routed straight to the SVP login after sign in.</span>
            </div>
          </div>
        </div>

        <div className="ap-brand-foot">
          <span>© {new Date().getFullYear()} Accreditation Suite</span>
          <span>Secured portal</span>
        </div>
      </aside>

      <section className="ap-form-panel">
        <div className="ap-form-card">
          <div className="ap-form-header">
            <h1>Access Control Login</h1>
            <p>Sign in with your admin or agency account. Regular users will be redirected to the SVP verification flow.</p>
          </div>

          <form className="ap-form" onSubmit={submit}>
            <div className="ap-field">
              <label htmlFor="acc-email">Email</label>
              <input id="acc-email" type="email" autoComplete="username"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com" required />
            </div>

            <div className="ap-field">
              <label htmlFor="acc-password">Password</label>
              <div className="ap-input-wrap">
                <input id="acc-password" type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password" required />
                <button type="button" className="ap-input-toggle"
                  onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button type="submit" className="ap-submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>

            {msg ? (
              <div className={`ap-message${msgType === "error" ? " ap-message--error" : msgType === "ok" ? " ap-message--ok" : ""}`}>
                {msg}
              </div>
            ) : null}

            <div className="ap-footer">
              <Link to="/access/forgot-password" className="ap-link">Forgot password?</Link>
              <span className="ap-hint"> · New candidate? <Link to="/access/register">Create account</Link></span>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
