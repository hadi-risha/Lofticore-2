import { useEffect, useRef, useState } from "react";
import { Loader2, Smartphone } from "lucide-react";

interface Props {
  glbUrl: string;
  title: string;
  poster?: string;
  // the product's real size, from the listing
  dimensions: { widthCm: number; depthCm: number; heightCm: number };
}

interface ViewerElement extends HTMLElement {
  getDimensions?: () => { x: number; y: number; z: number };
  // re-frames the camera around the model after it changes size
  updateFraming?: () => Promise<void>;
  scale: string;
}

// The 3D / AR view. The viewer library is big, so it only downloads when someone
// actually opens a product that has a model.
export function ArViewer({ glbUrl, title, poster, dimensions }: Props) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<ViewerElement>(null);

  useEffect(() => {
    let cancelled = false;
    import("@google/model-viewer")
      .then(() => !cancelled && setReady(true))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Once the model loads, scale it so its height matches the listing. AR then places
  // it at that real-world size instead of whatever the 3D file happened to be drawn at.
  useEffect(() => {
    const el = ref.current;
    if (!ready || !el) return;
    const fit = () => {
      const size = el.getDimensions?.();
      if (!size || size.y <= 0) return;
      const factor = dimensions.heightCm / 100 / size.y;
      el.scale = `${factor} ${factor} ${factor}`;
      // the camera was framed for the original size, so frame it again
      void el.updateFraming?.();
    };
    const fail = () => setFailed(true);
    el.addEventListener("load", fit);
    el.addEventListener("error", fail);
    return () => {
      el.removeEventListener("load", fit);
      el.removeEventListener("error", fail);
    };
  }, [ready, dimensions.heightCm]);

  if (failed) {
    return (
      <div className="grid aspect-square place-items-center rounded-3xl bg-brand-soft p-8 text-center text-sm text-muted">
        We couldn&apos;t load the 3D view right now. Check your connection and try again.
      </div>
    );
  }

  return (
    <div className="relative aspect-square overflow-hidden rounded-3xl bg-gradient-to-b from-brand-soft to-white">
      {!ready ? (
        <div
          className="grid size-full place-items-center"
          role="status"
          aria-label="Loading 3D view"
        >
          <Loader2 className="size-7 animate-spin text-brand" />
        </div>
      ) : (
        <model-viewer
          ref={ref}
          src={glbUrl}
          alt={`3D model of ${title}`}
          poster={poster}
          ar
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="fixed"
          ar-placement="floor"
          xr-environment
          camera-controls
          auto-rotate
          touch-action="pan-y"
          shadow-intensity="1"
          style={{ width: "100%", height: "100%", ["--poster-color" as string]: "transparent" }}
        >
          {/* shown by the viewer only on phones and tablets that support AR */}
          <button
            slot="ar-button"
            className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-medium text-white shadow-lg"
          >
            <Smartphone className="size-4" aria-hidden /> View in your room
          </button>
        </model-viewer>
      )}

      <p className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-xs shadow-sm">
        Shown at {dimensions.widthCm} × {dimensions.depthCm} × {dimensions.heightCm} cm
      </p>
      <p className="pointer-events-none absolute bottom-3 left-3 right-3 text-center text-xs text-muted">
        Drag to turn it. On a phone, tap &ldquo;View in your room&rdquo; to place it in your space.
      </p>
    </div>
  );
}
