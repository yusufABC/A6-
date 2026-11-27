import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AssignmentServices } from "./assignment.service";
import { AssignmentValidation } from "./assignment.validation";

const getAssignments = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const parsedQuery = AssignmentValidation.AssignmentListQuerySchema.safeParse(
		req.query,
	);

	if (!parsedQuery.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			parsedQuery.error.issues[0]?.message ?? "Invalid query parameters",
		);
	}

	const { data, meta } = await AssignmentServices.getAssignments(
		parsedQuery.data,
		user,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assignments retrieved successfully",
		data,
		meta,
	});
});

const getAssignmentById = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await AssignmentServices.getAssignmentById(
		req.params.id as string,
		user,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assignment retrieved successfully",
		data: result,
	});
});

const acceptAssignment = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await AssignmentServices.acceptAssignment(
		req.params.id as string,
		user.userId,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assignment accepted successfully",
		data: result,
	});
});

const rejectAssignment = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await AssignmentServices.rejectAssignment(
		req.params.id as string,
		req.body,
		user.userId,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assignment rejected successfully",
		data: result,
	});
});

export const AssignmentController = {
	getAssignments,
	getAssignmentById,
	acceptAssignment,
	rejectAssignment,
};
