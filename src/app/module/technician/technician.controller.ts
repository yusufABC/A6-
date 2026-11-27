import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { TechnicianServices } from "./technician.service";
import { TechnicianValidation } from "./technician.validation";

const getPublicProfile = catchAsync(async (req: Request, res: Response) => {
	const result = await TechnicianServices.getPublicProfile(
		req.params.id as string,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Technician profile retrieved successfully",
		data: result,
	});
});

const getPublicFeedbacks = catchAsync(async (req: Request, res: Response) => {
	const parsedQuery = TechnicianValidation.FeedbackListQuerySchema.safeParse(
		req.query,
	);

	if (!parsedQuery.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			parsedQuery.error.issues[0]?.message ?? "Invalid query parameters",
		);
	}

	const { data, meta } = await TechnicianServices.getPublicFeedbacks(
		req.params.id as string,
		parsedQuery.data,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Technician feedbacks retrieved successfully",
		data,
		meta,
	});
});

const getMyProfile = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await TechnicianServices.getMyProfile(user.userId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Technician profile retrieved successfully",
		data: result,
	});
});

const updateMyProfile = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await TechnicianServices.updateMyProfile(
		user.userId,
		req.body,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Technician profile updated successfully",
		data: result,
	});
});

const getMyFeedbacks = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const parsedQuery = TechnicianValidation.FeedbackListQuerySchema.safeParse(
		req.query,
	);

	if (!parsedQuery.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			parsedQuery.error.issues[0]?.message ?? "Invalid query parameters",
		);
	}

	const { data, meta } = await TechnicianServices.getMyFeedbacks(
		user.userId,
		parsedQuery.data,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Technician feedbacks retrieved successfully",
		data,
		meta,
	});
});

const getMyStats = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await TechnicianServices.getMyStats(user.userId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Technician stats retrieved successfully",
		data: result,
	});
});

const getTechnicians = catchAsync(async (req: Request, res: Response) => {
	const parsedQuery = TechnicianValidation.TechnicianListQuerySchema.safeParse(
		req.query,
	);

	if (!parsedQuery.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			parsedQuery.error.issues[0]?.message ?? "Invalid query parameters",
		);
	}

	const { data, meta } = await TechnicianServices.getTechnicians(
		parsedQuery.data,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Technicians retrieved successfully",
		data,
		meta,
	});
});

const getAvailableTechnicians = catchAsync(
	async (req: Request, res: Response) => {
		const parsedQuery =
			TechnicianValidation.AvailableTechniciansQuerySchema.safeParse(req.query);

		if (!parsedQuery.success) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				parsedQuery.error.issues[0]?.message ?? "Invalid query parameters",
			);
		}

		const result = await TechnicianServices.getAvailableTechnicians(
			parsedQuery.data.workOrderId,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Available technicians retrieved successfully",
			data: result,
		});
	},
);

const adminUpdateTechnician = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user;
		if (!user) {
			throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
		}

		const result = await TechnicianServices.adminUpdateTechnician(
			req.params.id as string,
			req.body,
			user.userId,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message:
				req.body.isDeleted === true
					? "Technician deleted successfully"
					: "Technician profile updated successfully",
			data: result,
		});
	},
);

export const TechnicianController = {
	getPublicProfile,
	getPublicFeedbacks,
	getMyProfile,
	updateMyProfile,
	getMyFeedbacks,
	getMyStats,
	getTechnicians,
	getAvailableTechnicians,
	adminUpdateTechnician,
};
