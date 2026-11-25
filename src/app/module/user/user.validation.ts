import { z } from "zod";

const UpdateProfileSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(2, "Name must be at least 2 characters")
			.max(100, "Name must be at most 100 characters")
			.optional(),
		phone: z
			.string()
			.trim()
			.regex(/^\+?[0-9\s-]{6,20}$/, "Please provide a valid phone number")
			.optional(),
	})
	.strict()
	.refine((data) => data.name !== undefined || data.phone !== undefined, {
		message: "At least one of name or phone is required",
	});

const UpdateAddressSchema = z
	.object({
		addressLine: z.string().trim().min(1).max(255).optional(),
		city: z.string().trim().min(1).max(100).optional(),
		district: z.string().trim().min(1).max(100).optional(),
		postalCode: z.string().trim().min(1).max(20).optional(),
	})
	.strict()
	.refine(
		(data) =>
			data.addressLine !== undefined ||
			data.city !== undefined ||
			data.district !== undefined ||
			data.postalCode !== undefined,
		{ message: "At least one address field is required" },
	);

export const UserValidation = { UpdateProfileSchema, UpdateAddressSchema };
