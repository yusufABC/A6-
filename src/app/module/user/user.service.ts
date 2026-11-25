import httpStatus from "http-status";
import { UserStatus } from "../../../generated/prisma/enums";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import { uploadToCloudinary } from "../../lib/uploadImage";
import { AppError } from "../../utils/AppError";
import type {
	IUpdateAddressPayload,
	IUpdateProfilePayload,
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

export const UserServices = {
	getMe,
	updateProfile,
	updateAddress,
	updateProfileImage,
};
