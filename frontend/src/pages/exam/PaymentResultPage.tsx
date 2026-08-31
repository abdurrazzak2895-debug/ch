import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";

function readParam(searchParams: URLSearchParams, names: string[]) {
  for (const name of names) {
    const value = searchParams.get(name);
    if (value) return value;
  }
  return "";
}

function getPaymentResult(searchParams: URLSearchParams) {
  const code = readParam(searchParams, ["result.code", "resultCode", "code"]);
  const description = readParam(searchParams, ["result.description", "resultDescription", "description", "message"]);
  const status = readParam(searchParams, ["status", "payment_status", "paymentStatus"]);
  const text = `${code} ${description} ${status}`.toLowerCase();

  if (/^000\.(?!200\.)/.test(code) || /success|successful|paid|approved|completed/.test(text)) {
    return {
      type: "success",
      title: "Payment Successful",
      message: "Payment completed successfully. Your booking list will show the final SVP status.",
    };
  }

  if (/pending|processing|review/.test(text)) {
    return {
      type: "pending",
      title: "Payment Pending",
      message: "Payment is still processing. Refresh My bookings after a short moment.",
    };
  }

  return {
    type: "failed",
    title: "Payment Failed",
    message: description || "Payment was not completed. You can retry from My bookings.",
  };
}

export default function PaymentResultPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reservationId = searchParams.get("reservationId") || "";
  const resourcePath = searchParams.get("resourcePath") || "";
  const paymentId = searchParams.get("id") || searchParams.get("paymentId") || "";
  const result = getPaymentResult(searchParams);

  useEffect(() => {
    if (reservationId) {
      localStorage.setItem(`paymentStatus:${reservationId}`, result.type);
    }
    const timer = window.setTimeout(() => {
      navigate("/exam/reservations");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [navigate, reservationId, result.type]);

  return (
    <div className="booking-shell">
      <div className="booking-modal payment-modal">
        <div className="modal-head">
          <h1>{result.title}</h1>
          <Link to="/exam/reservations" className="close-link" aria-label="Close">x</Link>
        </div>

        <div className={`notice ${result.type === "success" ? "notice--ok" : "notice--error"}`}>
          {result.message}
        </div>

        <div className="meta-grid">
          <div><span>Reservation:</span> <strong>{reservationId || "-"}</strong></div>
          <div><span>Payment ID:</span> <strong>{paymentId || "-"}</strong></div>
          <div><span>Resource:</span> <strong>{resourcePath || "-"}</strong></div>
          <div><span>Result Code:</span> <strong>{readParam(searchParams, ["result.code", "resultCode", "code"]) || "-"}</strong></div>
          <div><span>Status:</span> <strong>{result.title}</strong></div>
        </div>

        <div className="actions-row">
          <Link className="primary-btn payment-link-btn" to="/exam/reservations">My bookings</Link>
          <Link className="ghost-btn payment-link-btn" to="/dashboard">Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
