import type { ReactNode } from "react";
import bg from "@/assets/home-bg2.webp";

// Shared frame for every sign-in style page: form on the left, a photo on larger screens.
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="container-page py-8 sm:py-12">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-line bg-white shadow-sm lg:grid-cols-2">
        <div className="p-6 sm:p-10">
          <h1 className="text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
        <div className="relative hidden lg:block">
          <img src={bg} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-brand/80 via-brand/10 to-transparent" />
          <p className="absolute bottom-8 left-8 right-8 font-display text-2xl leading-snug text-white">
            Pieces with a point of view, from makers who care.
          </p>
        </div>
      </div>
    </div>
  );
}
