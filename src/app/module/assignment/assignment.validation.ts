import { z } from "zod";

const AssignmentListQuerySchema = z.object({
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(10),
	status: z.enum(["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"]).optional(),
	sortBy: z.enum(["status", "createdAt", "updatedAt"]).default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const RejectAssignmentSchema = z
	.object({
		rejectionReason: z
			.string()
			.trim()
			.min(1, "rejectionReason is required")
			.max(500, "rejectionReason must be at most 500 characters"),
	})
	.strict();

export const AssignmentValidation = {
	AssignmentListQuerySchema,
	RejectAssignmentSchema,
};
