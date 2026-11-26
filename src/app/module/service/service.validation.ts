import { z } from "zod";

const decimalAmountSchema = z
	.union([z.string(), z.number()])
	.transform((value) => String(value).trim())
	.refine((value) => /^\d+(\.\d{1,2})?$/.test(value), {
		message:
			"basePriceAmount must be a valid amount with up to 2 decimal places",
	})
	.refine((value) => Number(value) > 0, {
		message: "basePriceAmount must be greater than 0",
	});

const CreateServiceSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(2, "Name must be at least 2 characters")
			.max(150, "Name must be at most 150 characters"),
		description: z
			.string()
			.trim()
			.max(2000, "Description must be at most 2000 characters")
			.optional(),
		requiredSkill: z
			.string()
			.trim()
			.min(1, "Required skill is required")
			.max(100, "Required skill must be at most 100 characters"),
		basePriceAmount: decimalAmountSchema,
		estimatedDurationMinutes: z.coerce
			.number()
			.int("Estimated duration must be a whole number")
			.positive("Estimated duration must be a positive integer"),
		isActive: z.boolean().optional(),
	})
	.strict();

const UpdateServiceSchema = z
	.object({
		name: z
			.string()
			.trim()
			.min(2, "Name must be at least 2 characters")
			.max(150, "Name must be at most 150 characters")
			.optional(),
		description: z
			.string()
			.trim()
			.max(2000, "Description must be at most 2000 characters")
			.nullable()
			.optional(),
		requiredSkill: z
			.string()
			.trim()
			.min(1, "Required skill is required")
			.max(100, "Required skill must be at most 100 characters")
			.optional(),
		basePriceAmount: decimalAmountSchema.optional(),
		estimatedDurationMinutes: z.coerce
			.number()
			.int("Estimated duration must be a whole number")
			.positive("Estimated duration must be a positive integer")
			.optional(),
		isActive: z.boolean().optional(),
	})
	.strict()
	.refine((data) => Object.values(data).some((value) => value !== undefined), {
		message: "At least one field is required",
	});

const ServiceListQuerySchema = z.object({
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(10),
	searchTerm: z.string().trim().optional(),
	sortBy: z
		.enum([
			"name",
			"basePriceAmount",
			"estimatedDurationMinutes",
			"isActive",
			"isDeleted",
			"createdAt",
			"updatedAt",
		])
		.default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
	isActive: z
		.enum(["true", "false"])
		.transform((value) => value === "true")
		.optional(),
});

export const ServiceValidation = {
	CreateServiceSchema,
	UpdateServiceSchema,
	ServiceListQuerySchema,
};
