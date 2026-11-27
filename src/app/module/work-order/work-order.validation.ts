import { z } from "zod";

const optionalDateSchema = z.preprocess(
	(value) =>
		value === "" || value === null || value === undefined ? undefined : value,
	z.coerce.date().optional(),
);

const AssignTechnicianSchema = z
	.object({
		technicianId: z.string().trim().min(1, "technicianId is required"),
		startTime: z.coerce.date(),
		endTime: optionalDateSchema,
	})
	.strict();

const CancelWorkOrderSchema = z
	.object({
		reason: z
			.string()
			.trim()
			.min(1, "reason is required")
			.max(500, "reason must be at most 500 characters"),
	})
	.strict();

const WorkOrderListQuerySchema = z.object({
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(10),
	status: z
		.enum([
			"AWAITING_ASSIGNMENT",
			"ASSIGNED",
			"SCHEDULED",
			"ARRIVED",
			"AWAITING_ESTIMATE_APPROVAL",
			"ESTIMATE_APPROVED",
			"IN_PROGRESS",
			"WORK_COMPLETED",
			"COMPLETED",
			"CLOSED_NO_WORK",
			"CANCELLED",
		])
		.optional(),
	searchTerm: z.string().trim().optional(),
	sortBy: z.enum(["status", "createdAt", "updatedAt"]).default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const WorkOrderValidation = {
	AssignTechnicianSchema,
	CancelWorkOrderSchema,
	WorkOrderListQuerySchema,
};
