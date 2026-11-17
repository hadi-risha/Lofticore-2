import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="container-page grid place-items-center py-24 text-center">
      <p className="font-display text-8xl text-gold">404</p>
      <h1 className="mt-4 text-3xl">This page wandered off</h1>
      <p className="mt-3 max-w-md text-muted">
        The link may be broken or the page may have moved. Let&apos;s get you back to something
        comfortable.
      </p>
      <div className="mt-8 flex gap-3">
        <Link to="/">
          <Button>Back to home</Button>
        </Link>
        <Link to="/shop">
          <Button variant="secondary">Browse the shop</Button>
        </Link>
      </div>
    </div>
  );
}

// Shown when a page crashes while rendering, instead of a white screen.
export function ErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;

  return (
    <div className="container-page grid place-items-center py-24 text-center">
      <h1 className="text-3xl">Something broke on our side</h1>
      <p className="mt-3 max-w-md text-muted">
        We&apos;ve hit an unexpected problem. Try again, and if it keeps happening, let us know.
      </p>
      {import.meta.env.DEV && error instanceof Error && (
        <pre className="mt-6 max-w-2xl overflow-auto rounded-xl bg-white p-4 text-left text-xs text-danger">
          {error.stack}
        </pre>
      )}
      <Button className="mt-8" onClick={() => window.location.assign("/")}>
        Reload the app
      </Button>
    </div>
  );
}
