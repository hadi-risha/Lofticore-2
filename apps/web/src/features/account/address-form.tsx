import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { addressSchema, type AddressDTO, type AddressInput } from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { applyApiError } from "@/features/auth/form-errors";
import { useSaveAddress } from "./api";

interface Props {
  address?: AddressDTO;
  onSaved: (address: AddressDTO) => void;
  onCancel?: () => void;
}

export function AddressForm({ address, onSaved, onCancel }: Props) {
  const save = useSaveAddress(address?.id);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof addressSchema>, unknown, AddressInput>({
    resolver: zodResolver(addressSchema),
    defaultValues: address ?? { label: "home", isDefault: false },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    save.mutate(values, {
      onSuccess: (saved) => {
        toast.success(address ? "Address updated." : "Address saved.");
        onSaved(saved);
      },
      onError: (err) => setFormError(applyApiError(err, setError)),
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Full name"
        autoComplete="name"
        error={errors.fullName?.message}
        {...register("fullName")}
      />
      <Field
        label="Mobile number"
        inputMode="tel"
        autoComplete="tel-national"
        maxLength={10}
        error={errors.phone?.message}
        {...register("phone")}
      />
      <Field
        className="sm:col-span-2"
        label="House / flat and street"
        autoComplete="address-line1"
        error={errors.line1?.message}
        {...register("line1")}
      />
      <Field
        className="sm:col-span-2"
        label="Area (optional)"
        autoComplete="address-line2"
        error={errors.line2?.message}
        {...register("line2")}
      />
      <Field
        label="Landmark (optional)"
        error={errors.landmark?.message}
        {...register("landmark")}
      />
      <Field
        label="Pincode"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={6}
        error={errors.pincode?.message}
        {...register("pincode")}
      />
      <Field
        label="City"
        autoComplete="address-level2"
        error={errors.city?.message}
        {...register("city")}
      />
      <Field
        label="State"
        autoComplete="address-level1"
        error={errors.state?.message}
        {...register("state")}
      />

      <div className="sm:col-span-2">
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" className="size-4 accent-brand" {...register("isDefault")} />
          Make this my default address
        </label>
      </div>

      {formError && (
        <p
          role="alert"
          className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger sm:col-span-2"
        >
          {formError}
        </p>
      )}

      <div className="flex gap-3 sm:col-span-2">
        <Button type="submit" loading={save.isPending}>
          {address ? "Save changes" : "Save address"}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export function AddressSummary({ a }: { a: Omit<AddressDTO, "id" | "isDefault" | "label"> }) {
  return (
    <address className="text-sm not-italic leading-relaxed">
      <strong className="font-semibold">{a.fullName}</strong>
      <br />
      {a.line1}
      {a.line2 ? `, ${a.line2}` : ""}
      {a.landmark ? ` (near ${a.landmark})` : ""}
      <br />
      {a.city}, {a.state} {a.pincode}
      <br />
      <span className="text-muted">Mobile {a.phone}</span>
    </address>
  );
}
