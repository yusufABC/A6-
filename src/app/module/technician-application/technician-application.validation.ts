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

export const TechnicianApplicationValidation = {
	CreateTechnicianApplicationSchema,
};
