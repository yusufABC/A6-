import httpStatus from "http-status";
import type {
	UserOrderByWithRelationInput,
	UserWhereInput,
} from "../../../generated/prisma/models";
import { UserStatus } from "../../../generated/prisma/enums";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import { uploadToCloudinary } from "../../lib/uploadImage";
import { AppError } from "../../utils/AppError";
import { AuditAction, createAuditLog } from "../../utils/auditLog";
import { buildPaginationMeta, getPagination } from "../../utils/pagination";
import type {
	IUpdateAddressPayload,
	IUpdateProfilePayload,
	IUpdateUserRolePayload,
	IUserListQuery,
} from "./user.interface";

const getMe = async (userId: string) => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		omit: { password: true },
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(httpStatus.FORBIDDEN, "User has been deleted");
	}

	return user;
};

const updateProfile = async (
	userId: string,
	payload: IUpdateProfilePayload,
) => {
	await getMe(userId);

	const data: { name?: string; phone?: string } = {};
	if (payload.name !== undefined) {
		data.name = payload.name;
	}
	if (payload.phone !== undefined) {
		data.phone = payload.phone;
	}

	return prisma.user.update({
		where: { id: userId },
		data,
		omit: { password: true },
	});
};

const updateAddress = async (
	userId: string,
	payload: IUpdateAddressPayload,
) => {
	await getMe(userId);

	const data: {
		addressLine?: string;
		city?: string;
		district?: string;
		postalCode?: string;
	} = {};
	if (payload.addressLine !== undefined) {
		data.addressLine = payload.addressLine;
	}
	if (payload.city !== undefined) {
		data.city = payload.city;
	}
	if (payload.district !== undefined) {
		data.district = payload.district;
	}
	if (payload.postalCode !== undefined) {
		data.postalCode = payload.postalCode;
	}

	return prisma.user.update({
		where: { id: userId },
		data,
		omit: { password: true },
	});
};

const updateProfileImage = async (userId: string, buffer: Buffer) => {
	const existingUser = await getMe(userId);

	const uploaded = await uploadToCloudinary(buffer, {
		resource_type: "image",
		folder: "fsms/users/profile",
	});

	const updatedUser = await prisma.user.update({
		where: { id: userId },
		data: {
			imageUrl: uploaded.secure_url,
			imagePublicId: uploaded.public_id,
		},
		omit: { password: true },
	});

	if (existingUser.imagePublicId) {
		await cloudinary.uploader
			.destroy(existingUser.imagePublicId)
			.catch(() => undefined);
	}

	return updatedUser;
};

const getAllUsers = async (query: IUserListQuery) => {
	const { page, limit, skip } = getPagination(query);

	const andConditions: UserWhereInput[] = [{ isDeleted: false }];

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{ email: { contains: query.searchTerm, mode: "insensitive" } },
			],
		});
	}

	if (query.role) {
		andConditions.push({ role: query.role });
	}

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	const where: UserWhereInput = { AND: andConditions };

	const data = await prisma.user.findMany({
		where,
		take: limit,
		skip,
		orderBy: {
			[query.sortBy]: query.sortOrder,
		} as UserOrderByWithRelationInput,
		omit: { password: true },
	});

	const total = await prisma.user.count({ where });

	return {
		data,
		meta: buildPaginationMeta(page, limit, total),
	};
};

const getUserById = async (id: string) => {
	const user = await prisma.user.findFirst({
		where: {
			id,
			isDeleted: false,
			status: { not: UserStatus.DELETED },
		},
		omit: { password: true },
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	return user;
};

const suspendUser = async (id: string, actorId: string) => {
	if (id === actorId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"You cannot perform this action on your own account",
		);
	}

	return prisma.$transaction(async (tx) => {
		const existing = await tx.user.findFirst({
			where: { id, isDeleted: false },
		});

		if (!existing || existing.status === UserStatus.DELETED) {
			throw new AppError(httpStatus.NOT_FOUND, "User not found");
		}

		if (existing.status === UserStatus.SUSPENDED) {
			throw new AppError(httpStatus.BAD_REQUEST, "User is already suspended");
		}

		const user = await tx.user.update({
			where: { id },
			data: { status: UserStatus.SUSPENDED },
			omit: { password: true },
		});

		await createAuditLog(tx, {
			userId: actorId,
			action: AuditAction.USER_SUSPENDED,
			entityType: "User",
			entityId: id,
		});

		return user;
	});
};

const activateUser = async (id: string, actorId: string) => {
	return prisma.$transaction(async (tx) => {
		const existing = await tx.user.findFirst({
			where: { id, isDeleted: false },
		});

		if (!existing || existing.status === UserStatus.DELETED) {
			throw new AppError(httpStatus.NOT_FOUND, "User not found");
		}

		if (existing.status === UserStatus.ACTIVE) {
			throw new AppError(httpStatus.BAD_REQUEST, "User is already active");
		}

		const user = await tx.user.update({
			where: { id },
			data: { status: UserStatus.ACTIVE },
			omit: { password: true },
		});

		await createAuditLog(tx, {
			userId: actorId,
			action: AuditAction.USER_ACTIVATED,
			entityType: "User",
			entityId: id,
		});

		return user;
	});
};

const updateUserRole = async (
	id: string,
	payload: IUpdateUserRolePayload,
	actorId: string,
) => {
	if (id === actorId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"You cannot perform this action on your own account",
		);
	}

	return prisma.$transaction(async (tx) => {
		const existing = await tx.user.findFirst({
			where: { id, isDeleted: false },
		});

		if (!existing || existing.status === UserStatus.DELETED) {
			throw new AppError(httpStatus.NOT_FOUND, "User not found");
		}

		if (existing.role === payload.role) {
			throw new AppError(httpStatus.BAD_REQUEST, "User already has this role");
		}

		const user = await tx.user.update({
			where: { id },
			data: { role: payload.role },
			omit: { password: true },
		});

		await createAuditLog(tx, {
			userId: actorId,
			action: AuditAction.USER_ROLE_UPDATED,
			entityType: "User",
			entityId: id,
			metadata: {
				oldRole: existing.role,
				newRole: payload.role,
			},
		});

		return user;
	});
};

const deleteUser = async (id: string, actorId: string) => {
	if (id === actorId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"You cannot perform this action on your own account",
		);
	}

	return prisma.$transaction(async (tx) => {
		const existing = await tx.user.findFirst({
			where: { id, isDeleted: false },
		});

		if (!existing || existing.status === UserStatus.DELETED) {
			throw new AppError(httpStatus.NOT_FOUND, "User not found");
		}

		const user = await tx.user.update({
			where: { id },
			data: {
				isDeleted: true,
				deletedAt: new Date(),
				status: UserStatus.DELETED,
			},
			omit: { password: true },
		});

		await createAuditLog(tx, {
			userId: actorId,
			action: AuditAction.RECORD_DELETED,
			entityType: "User",
			entityId: id,
		});

		return user;
	});
};

export const UserServices = {
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
