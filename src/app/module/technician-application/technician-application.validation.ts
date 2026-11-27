import { z } from "zod";

const workingDaysSchema = z
	.object({
		sun: z.boolean().optional(),
		mon: z.boolean().optional(),
		tue: z.boolean().optional(),
		wed: z.boolean().optional(),
		thu: z.boolean().optional(),
		fri: z.boolean().optional(),
		sat: z.boolean().optional(),
	})
	.strict();

const CreateTechnicianApplicationSchema = z
	.object({
		professionalTitle: z
			.string()
			.trim()
			.min(2, "Professional title must be at least 2 characters")
			.max(150, "Professional title must be at most 150 characters"),
		yearsOfExperience: z.coerce
			.number()
			.int("Years of experience must be a whole number")
			.min(0, "Years of experience cannot be negative"),
		bio: z
			.string()
			.trim()
			.max(2000, "Bio must be at most 2000 characters")
			.nullable()
			.optional(),
		skills: z
			.array(z.string().trim().min(1, "Skill cannot be empty"))
			.min(1, "At least one skill is required"),
		serviceAreas: z
			.array(z.string().trim().min(1, "Service area cannot be empty"))
			.min(1, "At least one service area is required"),
		workingDays: workingDaysSchema.nullable().optional(),
		preferredHours: z
			.string()
			.trim()
			.regex(
				/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/,
				"preferredHours must be in HH:MM-HH:MM format",
			)
			.nullable()
			.optional(),
	})
	.strict();

const TechnicianApplicationListQuerySchema = z.object({
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(10),
	searchTerm: z.string().trim().optional(),
	status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
	sortBy: z
		.enum([
			"status",
			"professionalTitle",
			"yearsOfExperience",
			"createdAt",
			"updatedAt",
		])
		.default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const ApproveTechnicianApplicationSchema = z.preprocess(
	(value) => value ?? {},
	z
		.object({
			reviewNote: z
				.string()
				.trim()
				.max(1000, "Review note must be at most 1000 characters")
				.optional(),
		})
		.strict(),
);

const RejectTechnicianApplicationSchema = z
	.object({
		reviewNote: z
			.string()
			.trim()
			.min(1, "Review note is required")
			.max(1000, "Review note must be at most 1000 characters"),
	})
	.strict();

export const TechnicianApplicationValidation = {
	CreateTechnicianApplicationSchema,
	TechnicianApplicationListQuerySchema,
	ApproveTechnicianApplicationSchema,
	RejectTechnicianApplicationSchema,
};
