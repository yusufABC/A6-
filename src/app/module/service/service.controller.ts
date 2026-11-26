import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ServiceServices } from "./service.service";
import { ServiceValidation } from "./service.validation";

const getPublicServices = catchAsync(async (_req: Request, res: Response) => {
	const result = await ServiceServices.getPublicServices();

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Services retrieved successfully",
		data: result,
	});
});

const getServiceById = catchAsync(async (req: Request, res: Response) => {
	const result = await ServiceServices.getServiceById(req.params.id as string);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Service retrieved successfully",
		data: result,
	});
});

const getAllServices = catchAsync(async (req: Request, res: Response) => {
	const parsedQuery = ServiceValidation.ServiceListQuerySchema.safeParse(
		req.query,
	);

	if (!parsedQuery.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			parsedQuery.error.issues[0]?.message ?? "Invalid query parameters",
		);
	}

	const { data, meta } = await ServiceServices.getAllServices(parsedQuery.data);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Services retrieved successfully",
		data,
		meta,
	});
});

const createService = catchAsync(async (req: Request, res: Response) => {
	const result = await ServiceServices.createService(req.body);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Service created successfully",
		data: result,
	});
});

const updateService = catchAsync(async (req: Request, res: Response) => {
	const result = await ServiceServices.updateService(
		req.params.id as string,
		req.body,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Service updated successfully",
		data: result,
	});
});

const deleteService = catchAsync(async (req: Request, res: Response) => {
	const result = await ServiceServices.deleteService(req.params.id as string);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Service deleted successfully",
		data: result,
	});
});

export const ServiceController = {
	getPublicServices,
	getServiceById,
	getAllServices,
	createService,
	updateService,
	deleteService,
};
