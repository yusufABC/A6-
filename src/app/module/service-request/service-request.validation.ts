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

export const ServiceRequestValidation = {
	CreateServiceRequestSchema,
};
