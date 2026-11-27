import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IAssignTechnicianPayload } from "./work-order.interface";
import { WorkOrderServices } from "./work-order.service";
import { WorkOrderValidation } from "./work-order.validation";

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

const cancelWorkOrder = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await WorkOrderServices.cancelWorkOrder(
		req.params.id as string,
		req.body,
		user.userId,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Work order cancelled successfully",
		data: result,
	});
});

const getWorkOrders = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const parsedQuery = WorkOrderValidation.WorkOrderListQuerySchema.safeParse(
		req.query,
	);

	if (!parsedQuery.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			parsedQuery.error.issues[0]?.message ?? "Invalid query parameters",
		);
	}

	const { data, meta } = await WorkOrderServices.getWorkOrders(
		parsedQuery.data,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Work orders retrieved successfully",
		data,
		meta,
	});
});

const getWorkOrderById = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await WorkOrderServices.getWorkOrderById(
		req.params.id as string,
		user,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Work order retrieved successfully",
		data: result,
	});
});

export const WorkOrderController = {
	assignTechnician,
	cancelWorkOrder,
	getWorkOrders,
	getWorkOrderById,
};
