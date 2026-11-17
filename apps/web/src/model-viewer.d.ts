import type { DetailedHTMLProps, HTMLAttributes } from "react";

// Google's <model-viewer> web component, so TypeScript knows its attributes.
interface ModelViewerAttributes extends HTMLAttributes<HTMLElement> {
  src?: string;
  alt?: string;
  poster?: string;
  ar?: boolean;
  "ar-modes"?: string;
  "ar-scale"?: string;
  "camera-controls"?: boolean;
  "auto-rotate"?: boolean;
  "shadow-intensity"?: string;
  "touch-action"?: string;
  "environment-image"?: string;
  loading?: "auto" | "lazy" | "eager";
  scale?: string;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<ModelViewerAttributes, HTMLElement>;
    }
  }
}
