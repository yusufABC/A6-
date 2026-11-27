import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { TechnicianApplicationServices } from "./technician-application.service";
import { TechnicianApplicationValidation } from "./technician-application.validation";

const parseDataField = (data: unknown) => {
	if (typeof data !== "string" || data.trim() === "") {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"data field is required and must be a valid JSON string",
		);
	}

	try {
		return JSON.parse(data);
	} catch {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"data field is required and must be a valid JSON string",
		);
	}
};

const createTechnicianApplication = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user;
		if (!user) {
			throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
		}

		const parsedData = parseDataField(req.body.data);

		const parsedPayload =
			TechnicianApplicationValidation.CreateTechnicianApplicationSchema.safeParse(
				parsedData,
			);

		if (!parsedPayload.success) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				parsedPayload.error.issues[0]?.message ?? "Invalid application data",
			);
		}

		const files =
			(req.files as
				| { [fieldname: string]: Express.Multer.File[] }
				| undefined) ?? {};

		const result =
			await TechnicianApplicationServices.createTechnicianApplication(
				parsedPayload.data,
				{
					resume: files.resume,
					additionalFiles: files.additionalFiles,
				},
				user.userId,
			);

		sendResponse(res, {
			statusCode: httpStatus.CREATED,
			success: true,
			message: "Technician application submitted successfully",
			data: result,
		});
	},
);

const getMyApplications = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await TechnicianApplicationServices.getMyApplications(
		user.userId,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Technician applications retrieved successfully",
		data: result,
	});
});

const deleteTechnicianApplication = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user;
		if (!user) {
			throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
		}

		const result =
			await TechnicianApplicationServices.deleteTechnicianApplication(
				req.params.id as string,
				user.userId,
			);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Technician application withdrawn successfully",
			data: result,
		});
	},
);

export const TechnicianApplicationController = {
	createTechnicianApplication,
	getMyApplications,
	deleteTechnicianApplication,
};
