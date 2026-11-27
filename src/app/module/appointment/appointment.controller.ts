import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AppointmentServices } from "./appointment.service";

const rescheduleAppointment = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user;
		if (!user) {
			throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
		}

		const result = await AppointmentServices.rescheduleAppointment(
			req.params.id as string,
			req.body,
			user.userId,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Appointment rescheduled successfully",
			data: result,
		});
	},
);

const cancelAppointment = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await AppointmentServices.cancelAppointment(
		req.params.id as string,
		user.userId,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Appointment cancelled successfully",
		data: result,
	});
});

export const AppointmentController = {
	rescheduleAppointment,
	cancelAppointment,
};
