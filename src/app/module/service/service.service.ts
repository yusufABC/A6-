import httpStatus from "http-status";
import type {
	ServiceOrderByWithRelationInput,
	ServiceWhereInput,
} from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { buildPaginationMeta, getPagination } from "../../utils/pagination";
import type {
	ICreateServicePayload,
	IServiceListQuery,
	IUpdateServicePayload,
} from "./service.interface";

const getPublicServices = async () => {
	return prisma.service.findMany({
		where: {
			isActive: true,
			isDeleted: false,
		},
		orderBy: { createdAt: "desc" },
	});
};

const getServiceById = async (id: string) => {
	const service = await prisma.service.findFirst({
		where: {
			id,
			isActive: true,
			isDeleted: false,
		},
	});

	if (!service) {
		throw new AppError(httpStatus.NOT_FOUND, "Service not found");
	}

	return service;
};

const getAllServices = async (query: IServiceListQuery) => {
	const { page, limit, skip } = getPagination(query);

	const andConditions: ServiceWhereInput[] = [];

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{
					description: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
				{
					requiredSkill: {
						contains: query.searchTerm,
						mode: "insensitive",
					},
				},
			],
		});
	}

	if (query.isActive !== undefined) {
		andConditions.push({ isActive: query.isActive });
	}

	const where: ServiceWhereInput =
		andConditions.length > 0 ? { AND: andConditions } : {};

	const data = await prisma.service.findMany({
		where,
		take: limit,
		skip,
		orderBy: {
			[query.sortBy]: query.sortOrder,
		} as ServiceOrderByWithRelationInput,
	});

	const total = await prisma.service.count({ where });

	return {
		data,
		meta: buildPaginationMeta(page, limit, total),
	};
};

const createService = async (payload: ICreateServicePayload) => {
	return prisma.service.create({
		data: {
			name: payload.name.trim(),
			description: payload.description?.trim(),
			requiredSkill: payload.requiredSkill.trim(),
			basePriceAmount: payload.basePriceAmount,
			estimatedDurationMinutes: payload.estimatedDurationMinutes,
			...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
		},
	});
};

const updateService = async (id: string, payload: IUpdateServicePayload) => {
	const existingService = await prisma.service.findFirst({
		where: {
			id,
			isDeleted: false,
		},
	});

	if (!existingService) {
		throw new AppError(httpStatus.NOT_FOUND, "Service not found");
	}

	const data: {
		name?: string;
		description?: string | null;
		requiredSkill?: string;
		basePriceAmount?: string;
		estimatedDurationMinutes?: number;
		isActive?: boolean;
	} = {};

	if (payload.name !== undefined) {
		data.name = payload.name.trim();
	}
	if (payload.description !== undefined) {
		data.description = payload.description?.trim() ?? null;
	}
	if (payload.requiredSkill !== undefined) {
		data.requiredSkill = payload.requiredSkill.trim();
	}
	if (payload.basePriceAmount !== undefined) {
		data.basePriceAmount = payload.basePriceAmount;
	}
	if (payload.estimatedDurationMinutes !== undefined) {
		data.estimatedDurationMinutes = payload.estimatedDurationMinutes;
	}
	if (payload.isActive !== undefined) {
		data.isActive = payload.isActive;
	}

	return prisma.service.update({
		where: { id },
		data,
	});
};

const deleteService = async (id: string) => {
	const existingService = await prisma.service.findFirst({
		where: {
			id,
			isDeleted: false,
		},
	});

	if (!existingService) {
		throw new AppError(httpStatus.NOT_FOUND, "Service not found");
	}

	return prisma.service.update({
		where: { id },
		data: {
			isDeleted: true,
			deletedAt: new Date(),
		},
	});
};

export const ServiceServices = {
	getPublicServices,
	getServiceById,
	getAllServices,
	createService,
	updateService,
	deleteService,
};
