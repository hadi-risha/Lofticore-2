// Loads Razorpay's checkout script once, only when someone actually pays with it.
// (The script's address is allowed in the Content-Security-Policy in vercel.json.)

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  theme?: { color: string };
  prefill?: { name?: string; email?: string };
  handler: (response: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", cb: (r: { error: { description: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

function loadScript() {
  loading ??= new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const el = document.createElement("script");
    el.src = "https://checkout.razorpay.com/v1/checkout.js";
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      loading = null; // allow another try
      reject(new Error("Couldn't load the payment window. Check your connection."));
    };
    document.head.appendChild(el);
  });
  return loading;
}

export async function openRazorpay(opts: {
  keyId: string;
  orderId: string;
  amount: number;
  description: string;
  prefill?: { name?: string; email?: string };
  onSuccess: (r: RazorpaySuccess) => void;
  onFailure: (reason: string) => void;
  onDismiss: () => void;
}) {
  await loadScript();
  const rzp = new window.Razorpay!({
    key: opts.keyId,
    order_id: opts.orderId,
    amount: opts.amount,
    currency: "INR",
    name: "Lofticore",
    description: opts.description,
    prefill: opts.prefill,
    theme: { color: "#7a4e2d" },
    handler: opts.onSuccess,
    modal: { ondismiss: opts.onDismiss },
  });
  rzp.on("payment.failed", (r) => opts.onFailure(r.error.description));
  rzp.open();
}
