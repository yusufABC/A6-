import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ServiceRequestServices } from "./service-request.service";
import { ServiceRequestValidation } from "./service-request.validation";

const createServiceRequest = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const parsedBody =
		ServiceRequestValidation.CreateServiceRequestSchema.safeParse(req.body);

	if (!parsedBody.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			parsedBody.error.issues[0]?.message ?? "Invalid request body",
		);
	}

	const files = (req.files as Express.Multer.File[] | undefined) ?? [];

	const result = await ServiceRequestServices.createServiceRequest(
		parsedBody.data,
		files,
		user.userId,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Service request created successfully",
		data: result,
	});
});

export const ServiceRequestController = {
	createServiceRequest,
};
