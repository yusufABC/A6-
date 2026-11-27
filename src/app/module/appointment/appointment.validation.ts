import { z } from "zod";

const RescheduleAppointmentSchema = z
	.object({
		startTime: z.coerce.date(),
		endTime: z.coerce.date(),
	})
	.strict()
	.refine((data) => data.endTime.getTime() > data.startTime.getTime(), {
		message: "endTime must be after startTime",
		path: ["endTime"],
	});

export const AppointmentValidation = {
	RescheduleAppointmentSchema,
};
