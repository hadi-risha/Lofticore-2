import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/query-client";

// Puts the API's per-field messages next to the matching inputs and returns a
// general message for anything that isn't about one field.
export function applyApiError<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
): string | null {
  if (err instanceof ApiError && err.fields) {
    for (const [field, message] of Object.entries(err.fields)) {
      setError(field as Path<T>, { message });
    }
    return null;
  }
  return errorMessage(err);
}
