// Turns a user-agent string into something a person recognises in a
// "where you're signed in" list, e.g. "Chrome on Windows".
export function describeDevice(userAgent = ""): string {
  const browser = /edg\//i.test(userAgent)
    ? "Edge"
    : /opr\/|opera/i.test(userAgent)
      ? "Opera"
      : /chrome|crios/i.test(userAgent)
        ? "Chrome"
        : /firefox|fxios/i.test(userAgent)
          ? "Firefox"
          : /safari/i.test(userAgent)
            ? "Safari"
            : null;

  const os = /windows/i.test(userAgent)
    ? "Windows"
    : /android/i.test(userAgent)
      ? "Android"
      : /iphone|ipad|ios/i.test(userAgent)
        ? "iOS"
        : /mac os/i.test(userAgent)
          ? "macOS"
          : /linux/i.test(userAgent)
            ? "Linux"
            : null;

  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}
