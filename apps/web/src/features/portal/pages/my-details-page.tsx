import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Role,
  VEHICLES,
  deliveryProfileSchema,
  sellerProfileSchema,
  type DeliveryProfileInput,
  type SellerProfileInput,
} from "@lofticore/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/bits";
import { applyApiError } from "@/features/auth/form-errors";
import { useAuthStore } from "@/stores/auth.store";
import { useMyProfile, useSubmitProfile } from "../api";
import { ApprovalBanner } from "../approval-banner";
import { PageHeader } from "../ui";

const errorBox = "rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger";

function SellerForm({ initial }: { initial: Partial<SellerProfileInput> | null }) {
  const submit = useSubmitProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<SellerProfileInput>({
    resolver: zodResolver(sellerProfileSchema),
    defaultValues: initial ?? {},
  });
  useEffect(() => reset(initial ?? {}), [initial, reset]);

  const onSubmit = handleSubmit((v) => {
    setFormError(null);
    submit.mutate(v, { onError: (e) => setFormError(applyApiError(e, setError)) });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field
        className="sm:col-span-2"
        label="Business or shop name"
        error={errors.businessName?.message}
        {...register("businessName")}
      />
      <Field
        label="Business phone"
        inputMode="tel"
        maxLength={10}
        error={errors.phone?.message}
        {...register("phone")}
      />
      <Field
        label="PAN"
        placeholder="ABCDE1234F"
        maxLength={10}
        hint="Used to verify who you are. Never shown to customers."
        error={errors.pan?.message}
        {...register("pan")}
      />
      <Field
        label="GSTIN (if registered)"
        placeholder="Optional"
        maxLength={15}
        error={errors.gstin?.message}
        {...register("gstin")}
      />
      <Field
        label="UPI id for payouts"
        placeholder="name@bank"
        error={errors.payoutUpi?.message}
        {...register("payoutUpi")}
      />
      <Field
        className="sm:col-span-2"
        label="Business address"
        error={errors.addressLine?.message}
        {...register("addressLine")}
      />
      <Field label="City" error={errors.city?.message} {...register("city")} />
      <Field label="State" error={errors.state?.message} {...register("state")} />
      <Field
        label="Pincode"
        inputMode="numeric"
        maxLength={6}
        error={errors.pincode?.message}
        {...register("pincode")}
      />
      {formError && (
        <p role="alert" className={`${errorBox} sm:col-span-2`}>
          {formError}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" loading={submit.isPending}>
          {initial ? "Save and send for review" : "Send for review"}
        </Button>
      </div>
    </form>
  );
}

type DeliveryForm = Omit<DeliveryProfileInput, "serviceAreas"> & { areas: string };

function DeliveryForm({ initial }: { initial: Partial<DeliveryProfileInput> | null }) {
  const submit = useSubmitProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<DeliveryForm>({ defaultValues: { vehicle: "bike", areas: "" } });
  useEffect(() => {
    if (initial)
      reset({
        phone: initial.phone,
        vehicle: initial.vehicle ?? "bike",
        licenceNumber: initial.licenceNumber,
        areas: initial.serviceAreas?.join(", ") ?? "",
      });
  }, [initial, reset]);

  const onSubmit = handleSubmit(({ areas, ...rest }) => {
    setFormError(null);
    const payload = { ...rest, serviceAreas: areas.split(/[\s,]+/).filter(Boolean) };
    // check on this side first for friendlier messages, then let the server have the last word
    const parsed = deliveryProfileSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        setError(
          issue.path[0] === "serviceAreas" ? "areas" : (issue.path[0] as keyof DeliveryForm),
          { message: issue.message },
        );
      return;
    }
    submit.mutate(parsed.data, {
      onError: (e) => setFormError(applyApiError(e, setError as never)),
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Mobile number"
        inputMode="tel"
        maxLength={10}
        error={errors.phone?.message}
        {...register("phone")}
      />
      <div>
        <label htmlFor="vehicle" className="mb-1.5 block text-sm font-medium">
          Vehicle
        </label>
        <select
          id="vehicle"
          className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm"
          {...register("vehicle")}
        >
          {VEHICLES.map((v) => (
            <option key={v} value={v}>
              {v[0]!.toUpperCase() + v.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <Field
        className="sm:col-span-2"
        label="Driving licence number"
        error={errors.licenceNumber?.message}
        {...register("licenceNumber")}
      />
      <Field
        className="sm:col-span-2"
        label="Pincodes you can deliver to"
        placeholder="682001, 682030, 682016"
        hint="Separate with commas."
        error={errors.areas?.message}
        {...register("areas")}
      />
      {formError && (
        <p role="alert" className={`${errorBox} sm:col-span-2`}>
          {formError}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" loading={submit.isPending}>
          {initial ? "Save and send for review" : "Send for review"}
        </Button>
      </div>
    </form>
  );
}

export function MyDetailsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const { data, isLoading } = useMyProfile();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={role === Role.SELLER ? "Business details" : "Your details"}
        subtitle="Our team reviews these before your account goes live. You can update them any time."
      />
      <ApprovalBanner />
      <div className="rounded-2xl border border-line bg-white p-5 sm:p-7">
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : role === Role.SELLER ? (
          <SellerForm initial={data ?? null} />
        ) : (
          <DeliveryForm initial={data ?? null} />
        )}
      </div>
    </div>
  );
}
