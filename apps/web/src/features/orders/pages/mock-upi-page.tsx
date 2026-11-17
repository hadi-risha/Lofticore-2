import { useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { PaymentStatus, formatINR } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/query-client";
import { useMockPayment, useMockRespond } from "../api";

// A stand-in for the customer's UPI app (PhonePe, GPay...). It exists so the whole
// payment flow can be tried without a payment gateway account: approving here sends
// our server the same kind of signed callback a real provider would.
export function MockUpiPage() {
  const { token = "" } = useParams();
  const { data, isLoading, error, refetch } = useMockPayment(token);
  const respond = useMockRespond(token);
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (decision: "approve" | "decline") => {
    setProblem(null);
    respond.mutate(
      { decision, pin: decision === "approve" ? pin : undefined },
      {
        onSuccess: (r) => {
          setResult(
            r.status === PaymentStatus.PAID
              ? { ok: true, message: "Payment successful" }
              : { ok: false, message: r.reason ?? "Payment failed" },
          );
          void refetch();
        },
        onError: (err) => setProblem(errorMessage(err)),
      },
    );
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#1c2421] p-4 font-sans">
      <div className="w-full max-w-sm overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="bg-brand px-6 pb-6 pt-8 text-white">
          <p className="text-xs uppercase tracking-widest text-white/70">Demo UPI app</p>
          <p className="mt-1 text-lg font-semibold">Pay securely</p>
        </div>

        <div className="p-6">
          {isLoading && <p className="py-10 text-center text-sm text-muted">Loading…</p>}
          {error && <p className="py-10 text-center text-sm text-danger">{errorMessage(error)}</p>}

          {data && result ? (
            <div className="py-6 text-center">
              {result.ok ? (
                <CheckCircle2 className="mx-auto size-14 text-success" aria-hidden />
              ) : (
                <XCircle className="mx-auto size-14 text-danger" aria-hidden />
              )}
              <h1 className="mt-4 font-sans text-xl font-semibold">{result.message}</h1>
              <p className="mt-2 text-sm text-muted">
                {result.ok
                  ? `${formatINR(data.amount)} paid to ${data.payee}.`
                  : "No money was taken."}{" "}
                You can close this window and go back to Lofticore.
              </p>
              <Button className="mt-6" variant="secondary" onClick={() => window.close()}>
                Close
              </Button>
            </div>
          ) : data && data.status !== PaymentStatus.PENDING ? (
            <p className="py-10 text-center text-sm text-muted">
              This payment is already {data.status}.
            </p>
          ) : data ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit("approve");
              }}
            >
              <p className="text-sm text-muted">Paying</p>
              <p className="font-semibold">{data.payee}</p>
              <p className="text-xs text-muted">{data.payeeVpa}</p>
              <p className="mt-5 text-center font-display text-4xl">{formatINR(data.amount)}</p>
              {data.orderNumber && (
                <p className="mt-1 text-center text-xs text-muted">Order {data.orderNumber}</p>
              )}

              <label htmlFor="upi-pin" className="mt-6 block text-sm font-medium">
                Enter UPI PIN
              </label>
              <input
                id="upi-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="mt-1.5 h-12 w-full rounded-xl border border-line text-center font-mono text-xl tracking-[0.6em] outline-none focus:border-brand"
                placeholder="••••"
              />
              {problem && (
                <p role="alert" className="mt-2 text-sm text-danger">
                  {problem}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                className="mt-5 w-full"
                disabled={pin.length < 4}
                loading={respond.isPending}
              >
                Pay {formatINR(data.amount)}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="mt-2 w-full"
                disabled={respond.isPending}
                onClick={() => submit("decline")}
              >
                Cancel
              </Button>

              <p className="mt-5 flex items-start gap-2 rounded-xl bg-brand-soft p-3 text-xs text-ink/80">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <span>
                  This is a demo. Use any 4-6 digit PIN to approve, or <strong>0000</strong> to see
                  an &quot;insufficient balance&quot; failure.
                </span>
              </p>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
