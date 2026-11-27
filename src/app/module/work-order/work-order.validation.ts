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

export const WorkOrderValidation = {
	AssignTechnicianSchema,
};
