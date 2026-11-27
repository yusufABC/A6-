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

const profileFields = {
	professionalTitle: z
		.string()
		.trim()
		.min(2, "Professional title must be at least 2 characters")
		.max(150, "Professional title must be at most 150 characters")
		.optional(),
	yearsOfExperience: z.coerce
		.number()
		.int("Years of experience must be a whole number")
		.min(0, "Years of experience cannot be negative")
		.optional(),
	bio: z
		.string()
		.trim()
		.max(2000, "Bio must be at most 2000 characters")
		.nullable()
		.optional(),
	skills: z
		.array(z.string().trim().min(1, "Skill cannot be empty"))
		.min(1, "At least one skill is required")
		.optional(),
	serviceAreas: z
		.array(z.string().trim().min(1, "Service area cannot be empty"))
		.min(1, "At least one service area is required")
		.optional(),
	workingDays: workingDaysSchema.optional(),
	preferredHours: z
		.string()
		.trim()
		.regex(
			/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/,
			"preferredHours must be in HH:MM-HH:MM format",
		)
		.optional(),
};

const UpdateMyProfileSchema = z
	.object(profileFields)
	.strict()
	.refine((data) => Object.values(data).some((value) => value !== undefined), {
		message: "At least one field is required",
	});

const AdminUpdateTechnicianSchema = z
	.object({
		...profileFields,
		isDeleted: z.literal(true).optional(),
	})
	.strict()
	.refine((data) => Object.values(data).some((value) => value !== undefined), {
		message: "At least one field is required",
	})
	.refine(
		(data) =>
			data.isDeleted !== true ||
			Object.keys(data).every((key) => key === "isDeleted"),
		{
			message: "isDeleted cannot be combined with other fields",
		},
	);

const TechnicianListQuerySchema = z.object({
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(10),
	searchTerm: z.string().trim().optional(),
	sortBy: z
		.enum(["professionalTitle", "yearsOfExperience", "createdAt", "updatedAt"])
		.default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const FeedbackListQuerySchema = z.object({
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(10),
	sortBy: z.enum(["createdAt", "rating"]).default("createdAt"),
	sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const AvailableTechniciansQuerySchema = z.object({
	workOrderId: z.string().trim().min(1, "workOrderId is required"),
});

export const TechnicianValidation = {
	UpdateMyProfileSchema,
	AdminUpdateTechnicianSchema,
	TechnicianListQuerySchema,
	FeedbackListQuerySchema,
	AvailableTechniciansQuerySchema,
};
