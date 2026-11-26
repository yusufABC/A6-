import type { Request, Response } from "express";
import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UserServices } from "./user.service";
import { UserValidation } from "./user.validation";

const getMe = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}
	const result = await UserServices.getMe(user.userId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Profile retrieved successfully",
		data: result,
	});
});

const updateProfile = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}
	const result = await UserServices.updateProfile(user.userId, req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Profile updated successfully",
		data: result,
	});
});

const updateAddress = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}
	const result = await UserServices.updateAddress(user.userId, req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Address updated successfully",
		data: result,
	});
});

const updateProfileImage = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	if (!req.file) {
		throw new AppError(httpStatus.BAD_REQUEST, "Profile image is required");
	}

	const result = await UserServices.updateProfileImage(
		user.userId,
		req.file.buffer,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Profile image updated successfully",
		data: result,
	});
});

const getAllUsers = catchAsync(async (req: Request, res: Response) => {
	const parsedQuery = UserValidation.UserListQuerySchema.safeParse(req.query);

	if (!parsedQuery.success) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			parsedQuery.error.issues[0]?.message ?? "Invalid query parameters",
		);
	}

	const { data, meta } = await UserServices.getAllUsers(parsedQuery.data);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Users retrieved successfully",
		data,
		meta,
	});
});

const getUserById = catchAsync(async (req: Request, res: Response) => {
	const result = await UserServices.getUserById(req.params.id as string);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User retrieved successfully",
		data: result,
	});
});

const suspendUser = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await UserServices.suspendUser(
		req.params.id as string,
		user.userId,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User suspended successfully",
		data: result,
	});
});

const activateUser = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await UserServices.activateUser(
		req.params.id as string,
		user.userId,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User activated successfully",
		data: result,
	});
});

const updateUserRole = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await UserServices.updateUserRole(
		req.params.id as string,
		req.body,
		user.userId,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User role updated successfully",
		data: result,
	});
});

const deleteUser = catchAsync(async (req: Request, res: Response) => {
	const user = req.user;
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You are not logged in");
	}

	const result = await UserServices.deleteUser(
		req.params.id as string,
		user.userId,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User deleted successfully",
		data: result,
	});
});

export const UserController = {
	getMe,
	updateProfile,
	updateAddress,
	updateProfileImage,
	getAllUsers,
	getUserById,
	suspendUser,
	activateUser,
	updateUserRole,
	deleteUser,
};
