import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Role } from "@lofticore/shared";
import { errorMessage } from "@/lib/query-client";
import { useGoogleLogin } from "./api";
import { establishSession } from "./session";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCRIPT = "https://accounts.google.com/gsi/client";

interface GoogleId {
  initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

export const googleEnabled = Boolean(CLIENT_ID);

function loadScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google) return resolve();
    const existing = document.querySelector(`script[src="${SCRIPT}"]`);
    const s =
      existing ?? Object.assign(document.createElement("script"), { src: SCRIPT, async: true });
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(new Error("Couldn't load Google sign-in")));
    if (!existing) document.head.appendChild(s);
  });
}

// "Continue with Google". Renders nothing until a client id is configured
// (VITE_GOOGLE_CLIENT_ID), so the page is never left with a dead button.
export function GoogleButton({ role = "customer" }: { role?: Role }) {
  const el = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const { mutate } = useGoogleLogin();

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !el.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: ({ credential }) =>
            mutate(
              { idToken: credential, role },
              {
                onSuccess: (res) => {
                  establishSession(res);
                  toast.success(`Welcome, ${res.user.name.split(" ")[0]}!`);
                  navigate(from, { replace: true });
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            ),
        });
        window.google.accounts.id.renderButton(el.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          width: el.current.clientWidth || 320,
          text: "continue_with",
        });
      })
      .catch(() => toast.error("Google sign-in couldn't load. Use your email instead."));
    return () => {
      cancelled = true;
    };
  }, [mutate, role, navigate, from]);

  if (!CLIENT_ID) return null;
  return <div ref={el} className="flex min-h-11 w-full justify-center" />;
}
