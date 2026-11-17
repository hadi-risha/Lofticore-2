import { Link } from "react-router-dom";
import { AccountStatus, Role } from "@lofticore/shared";
import { useAuthStore } from "@/stores/auth.store";

// Tells a seller or delivery partner where they are in the approval process.
export function ApprovalBanner() {
  const user = useAuthStore((s) => s.user);
  if (!user || user.status === AccountStatus.ACTIVE) return null;

  const detailsPath = user.role === Role.SELLER ? "/seller/profile" : "/delivery/profile";

  if (user.status === AccountStatus.REJECTED) {
    return (
      <div
        role="status"
        className="mb-6 rounded-2xl border border-danger/30 bg-danger/10 p-5 text-sm"
      >
        <p className="font-semibold text-danger">Your application wasn&apos;t approved yet</p>
        {user.statusReason && <p className="mt-1">Reason: {user.statusReason}</p>}
        <p className="mt-2">
          Fix the details and send them again - it goes straight back to the review queue.{" "}
          <Link to={detailsPath} className="font-medium underline">
            Update my details
          </Link>
        </p>
      </div>
    );
  }

  if (!user.profileSubmitted) {
    return (
      <div role="status" className="mb-6 rounded-2xl border border-gold bg-gold/15 p-5 text-sm">
        <p className="font-semibold text-bronze">One step left before you can start</p>
        <p className="mt-1">
          Tell us about{" "}
          {user.role === Role.SELLER ? "your business" : "yourself and the areas you cover"}. Our
          team checks every seller and delivery partner to keep customers safe.{" "}
          <Link to={detailsPath} className="font-medium underline">
            Add my details
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div role="status" className="mb-6 rounded-2xl border border-line bg-brand-soft p-5 text-sm">
      <p className="font-semibold text-brand">Your details are being reviewed</p>
      <p className="mt-1">
        We&apos;ll email you as soon as you&apos;re approved. It usually takes a day or two.
      </p>
    </div>
  );
}
