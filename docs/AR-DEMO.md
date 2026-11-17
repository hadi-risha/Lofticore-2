# Recording the AR demo (for your CV or portfolio)

A 20-30 second phone recording of furniture appearing in a real room is the single most memorable thing
in this project. It has to be recorded on a real phone: AR needs the phone's camera and motion sensors, so
an emulator or a desktop browser cannot show it.

## Set up (5 minutes)

1. On your PC: `npm run infra:up`, then `npm run dev`.
2. In a second terminal: `npm run share`. It prints `https://<words>.trycloudflare.com`.
3. Open that link on the phone.
   - **Android:** Chrome, with _Google Play Services for AR_ installed (Play Store).
   - **iPhone:** Safari (AR Quick Look is built in).
4. Open a product that has a 3D model (the seeded sofas, chairs and tables do).

## What to film (a script)

| Seconds | Shot                                                                         |
| ------- | ---------------------------------------------------------------------------- |
| 0-5     | Shop page, search for "sofaa" (typo on purpose: it still finds sofas)        |
| 5-10    | Open the product, drag the 3D model around                                   |
| 10-25   | Tap **View in your room**, point at the floor, place it, walk around it      |
| 25-30   | Show the size label ("Shown at 210 x 90 x 85 cm"): it is placed at real size |

## Recording

- **Android:** swipe down, _Screen record_. For the AR part the system may pause recording; if so, film the
  phone with a second phone, or use a friend's phone for the filming.
- **iPhone:** Control Centre, _Screen Recording_. Quick Look records fine.
- Trim and export with any editor, keep it under 30 seconds, and upload it to the README (drag a
  `.mp4` into a GitHub issue or the README editor to get a hosted link) or to LinkedIn.

## When you are done

Press `Ctrl+C` in the `npm run share` terminal. Anyone with the link can reach your dev site while it runs.

## If the AR button does not appear

- The page must be `https` (the tunnel link is; `http://192.168...` is not).
- The phone must support AR (Android: ARCore-supported device; iPhone: any recent model).
- The product must have a 3D model (`.glb`). Products without one show photos only.
