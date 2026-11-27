import { z } from "zod";

const preferredDateTimeSchema = z.preprocess(
	(value) => (value === "" || value === null ? undefined : value),
	z.coerce.date().optional(),
);

const CreateServiceRequestSchema = z
	.object({
		serviceId: z.string().trim().min(1, "serviceId is required"),
		description: z
			.string()
			.trim()
			.min(1, "Description is required")
			.max(2000, "Description must be at most 2000 characters"),
		preferredDateTime: preferredDateTimeSchema,
	})
	.strict();

const ServiceRequestListQuerySchema = z.object({
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(10),
	searchTerm: z.string().trim().optional(),
	status: z
		.enum([
			"PENDING_REVIEW",
			"APPROVED",
			"DECLINED",
			"COMPLETED",
			"CLOSED_NO_WORK",
			"CANCELLED",
		])
		.optional(),
	sortBy: z
		.enum([
			"status",
			"serviceNameSnapshot",
			"basePriceSnapshot",
			"preferredDateTime",
			"createdAt",
			"updatedAt",
		])
		.default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const CancelServiceRequestSchema = z.preprocess(
	(value) => value ?? {},
	z
		.object({
			reason: z
				.string()
				.trim()
				.min(1, "Reason cannot be empty")
				.max(500, "Reason must be at most 500 characters")
				.optional(),
		})
		.strict(),
);

const DeclineServiceRequestSchema = z
	.object({
		reason: z
			.string()
			.trim()
			.min(1, "Reason is required")
			.max(500, "Reason must be at most 500 characters"),
	})
	.strict();

export const ServiceRequestValidation = {
	CreateServiceRequestSchema,
	ServiceRequestListQuerySchema,
	CancelServiceRequestSchema,
	DeclineServiceRequestSchema,
};
