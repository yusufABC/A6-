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

const getServiceRequests = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const parsedQuery =
		ServiceRequestValidation.ServiceRequestListQuerySchema.safeParse(req.query);

	if (!parsedQuery.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			parsedQuery.error.issues[0]?.message ?? "Invalid query parameters",
		);
	}

	const { data, meta } = await ServiceRequestServices.getServiceRequests(
		parsedQuery.data,
		user,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Service requests retrieved successfully",
		data,
		meta,
	});
});

const getServiceRequestById = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user;
		if (!user) {
			throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
		}

		const result = await ServiceRequestServices.getServiceRequestById(
			req.params.id as string,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Service request retrieved successfully",
			data: result,
		});
	},
);

const cancelServiceRequest = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const parsedBody =
		ServiceRequestValidation.CancelServiceRequestSchema.safeParse(
			req.body ?? {},
		);

	if (!parsedBody.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			parsedBody.error.issues[0]?.message ?? "Invalid request body",
		);
	}

	const result = await ServiceRequestServices.cancelServiceRequest(
		req.params.id as string,
		user,
		parsedBody.data,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Service request cancelled successfully",
		data: result,
	});
});

export const ServiceRequestController = {
	createServiceRequest,
	getServiceRequests,
	getServiceRequestById,
	cancelServiceRequest,
};
