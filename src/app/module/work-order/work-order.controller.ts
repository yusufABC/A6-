import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IAssignTechnicianPayload } from "./work-order.interface";
import { WorkOrderServices } from "./work-order.service";

const assignTechnician = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await WorkOrderServices.assignTechnician(
		req.params.id as string,
		req.body as IAssignTechnicianPayload,
		user.userId,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Technician assigned and appointment scheduled successfully",
		data: result,
	});
});

export const WorkOrderController = {
	assignTechnician,
};
