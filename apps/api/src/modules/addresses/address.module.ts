import { Router } from "express";
import mongoose, { Schema, model, type Types } from "mongoose";
import { HttpStatus, addressSchema, type AddressDTO, type AddressInput } from "@lofticore/shared";
import { AppError } from "../../lib/app-error";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";

interface AddressShape extends AddressInput {
  user: Types.ObjectId;
}

const addressModelSchema = new Schema<AddressShape>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, default: "home" },
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    line2: String,
    landmark: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Address = model<AddressShape>("Address", addressModelSchema);

const MAX_ADDRESSES = 10;

export const toAddressDTO = (a: AddressShape & { _id: Types.ObjectId }): AddressDTO => ({
  id: String(a._id),
  label: a.label,
  fullName: a.fullName,
  phone: a.phone,
  line1: a.line1,
  line2: a.line2,
  landmark: a.landmark,
  city: a.city,
  state: a.state,
  pincode: a.pincode,
  isDefault: a.isDefault,
});

// Always look an address up with its owner in the filter, so one customer can never
// read or use another's.
export async function ownedAddress(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) throw AppError.notFound("That address doesn't exist.");
  const a = await Address.findOne({ _id: id, user: userId });
  if (!a) throw AppError.notFound("That address doesn't exist.");
  return a;
}

const clearDefault = (userId: string, exceptId?: string) =>
  Address.updateMany(
    { user: userId, ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
    { isDefault: false },
  );

export const addressRouter = Router();
addressRouter.use(authenticate);

addressRouter.get("/", async (req, res) => {
  const list = await Address.find({ user: req.user!.id })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
  res.json({ addresses: list.map(toAddressDTO) });
});

addressRouter.post("/", validate(addressSchema), async (req, res) => {
  const userId = req.user!.id;
  if ((await Address.countDocuments({ user: userId })) >= MAX_ADDRESSES) {
    throw AppError.badRequest(`You can save up to ${MAX_ADDRESSES} addresses.`);
  }
  // the first address is the default automatically
  const first = (await Address.countDocuments({ user: userId })) === 0;
  const created = await Address.create({
    ...req.body,
    isDefault: req.body.isDefault || first,
    user: userId,
  });
  if (created.isDefault) await clearDefault(userId, String(created._id));
  res.status(HttpStatus.CREATED).json({ address: toAddressDTO(created) });
});

addressRouter.put("/:id", validate(addressSchema), async (req, res) => {
  const a = await ownedAddress(req.user!.id, String(req.params.id));
  a.set(req.body);
  await a.save();
  if (a.isDefault) await clearDefault(req.user!.id, String(a._id));
  res.json({ address: toAddressDTO(a) });
});

addressRouter.delete("/:id", async (req, res) => {
  const a = await ownedAddress(req.user!.id, String(req.params.id));
  await a.deleteOne();
  // keep one default if any addresses remain
  if (a.isDefault) {
    const next = await Address.findOne({ user: req.user!.id }).sort({ createdAt: -1 });
    if (next) await Address.updateOne({ _id: next._id }, { isDefault: true });
  }
  res.status(HttpStatus.NO_CONTENT).end();
});
