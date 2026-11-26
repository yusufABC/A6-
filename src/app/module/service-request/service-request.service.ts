import httpStatus from "http-status";
import {
	Role,
	ServiceRequestStatus,
	UserStatus,
	WorkOrderStatus,
} from "../../../generated/prisma/enums";
import type {
	ServiceRequestOrderByWithRelationInput,
	ServiceRequestWhereInput,
} from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import { uploadToCloudinary } from "../../lib/uploadImage";
import { AppError } from "../../utils/AppError";
import { AuditAction, createAuditLog } from "../../utils/auditLog";
import { buildPaginationMeta, getPagination } from "../../utils/pagination";
import {
	assertTransition,
	serviceRequestMachine,
	workOrderMachine,
} from "../../utils/statusMachine";
import type {
	IAttachment,
	ICancelServiceRequestPayload,
	ICreateServiceRequestPayload,
	IRequestActor,
	IServiceRequestListQuery,
} from "./service-request.interface";

const isPrivilegedRole = (role: Role) =>
	role === Role.MANAGER || role === Role.ADMIN;

const createServiceRequest = async (
	payload: ICreateServiceRequestPayload,
	files: Express.Multer.File[],
	actorUserId: string,
) => {
	const user = await prisma.user.findFirst({
		where: {
			id: actorUserId,
			isDeleted: false,
			status: { not: UserStatus.DELETED },
		},
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (!user.addressLine || !user.city || !user.district) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Please complete your address (addressLine, city and district) before creating a service request",
		);
	}

	const service = await prisma.service.findFirst({
		where: {
			id: payload.serviceId,
			isActive: true,
			isDeleted: false,
		},
	});

	if (!service) {
		throw new AppError(httpStatus.BAD_REQUEST, "Service not found or inactive");
	}

	const attachments: IAttachment[] = await Promise.all(
		files.map(async (file) => {
			const uploaded = await uploadToCloudinary(file.buffer, {
				resource_type: "auto",
				folder: "fsms/requests",
			});

			return {
				url: uploaded.secure_url,
				publicId: uploaded.public_id,
			};
		}),
	);

	return prisma.$transaction(async (tx) => {
		const serviceRequest = await tx.serviceRequest.create({
			data: {
				customerId: actorUserId,
				serviceId: service.id,
				description: payload.description,
				preferredDateTime: payload.preferredDateTime,
				status: "PENDING_REVIEW",
				serviceNameSnapshot: service.name,
				basePriceSnapshot: service.basePriceAmount,
				serviceAddressLine: user.addressLine as string,
				serviceCity: user.city as string,
				serviceDistrict: user.district as string,
				servicePostalCode: user.postalCode ?? null,
				attachments: attachments.length > 0 ? attachments : undefined,
			},
		});

		await createAuditLog(tx, {
			userId: actorUserId,
			action: AuditAction.REQUEST_CREATED,
			entityType: "ServiceRequest",
			entityId: serviceRequest.id,
		});

		return serviceRequest;
	});
};

const getServiceRequests = async (
	query: IServiceRequestListQuery,
	actor: IRequestActor,
) => {
	const { page, limit, skip } = getPagination(query);

	const andConditions: ServiceRequestWhereInput[] = [{ isDeleted: false }];

	if (!isPrivilegedRole(actor.role)) {
		andConditions.push({ customerId: actor.userId });
	}

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	if (query.searchTerm) {
		const searchTerm = query.searchTerm;
		andConditions.push({
			OR: [
				{
					serviceNameSnapshot: {
						contains: searchTerm,
						mode: "insensitive",
					},
				},
				{
					description: {
						contains: searchTerm,
						mode: "insensitive",
					},
				},
				{
					customer: {
						name: { contains: searchTerm, mode: "insensitive" },
					},
				},
				{
					customer: {
						email: { contains: searchTerm, mode: "insensitive" },
					},
				},
			],
		});
	}

	const where: ServiceRequestWhereInput = { AND: andConditions };

	const data = await prisma.serviceRequest.findMany({
		where,
		take: limit,
		skip,
		orderBy: {
			[query.sortBy]: query.sortOrder,
		} as ServiceRequestOrderByWithRelationInput,
		include: {
			customer: {
				select: { id: true, name: true, email: true },
			},
			workOrder: {
				select: { id: true, status: true },
			},
		},
	});

	const total = await prisma.serviceRequest.count({ where });

	return {
		data,
		meta: buildPaginationMeta(page, limit, total),
	};
};

const getServiceRequestById = async (id: string, actor: IRequestActor) => {
	const serviceRequest = await prisma.serviceRequest.findFirst({
		where: { id, isDeleted: false },
		include: {
			customer: {
				select: {
					id: true,
					name: true,
					email: true,
					phone: true,
					imageUrl: true,
				},
			},
			service: {
				select: { id: true, name: true, requiredSkill: true },
			},
			workOrder: {
				include: {
					assignment: {
						include: {
							technician: {
								include: {
									user: {
										select: {
											id: true,
											name: true,
											phone: true,
											imageUrl: true,
										},
									},
								},
							},
							appointment: true,
						},
					},
				},
			},
		},
	});

	if (!serviceRequest) {
		throw new AppError(httpStatus.NOT_FOUND, "Service request not found");
	}

	if (
		!isPrivilegedRole(actor.role) &&
		serviceRequest.customerId !== actor.userId
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You don't have permission to view this service request",
		);
	}

	return serviceRequest;
};

const cancelServiceRequest = async (
	id: string,
	actor: IRequestActor,
	payload: ICancelServiceRequestPayload,
) => {
	const serviceRequest = await prisma.serviceRequest.findFirst({
		where: { id, isDeleted: false },
		include: {
			workOrder: {
				select: { id: true, status: true },
			},
		},
	});

	if (!serviceRequest) {
		throw new AppError(httpStatus.NOT_FOUND, "Service request not found");
	}

	if (
		!isPrivilegedRole(actor.role) &&
		serviceRequest.customerId !== actor.userId
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You don't have permission to cancel this service request",
		);
	}

	const workOrder = serviceRequest.workOrder;
	const canCancel =
		serviceRequest.status === ServiceRequestStatus.PENDING_REVIEW ||
		workOrder?.status === WorkOrderStatus.AWAITING_ASSIGNMENT;

	if (!canCancel) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"This service request can no longer be cancelled",
		);
	}

	assertTransition(
		serviceRequestMachine,
		serviceRequest.status,
		ServiceRequestStatus.CANCELLED,
	);

	if (workOrder) {
		assertTransition(
			workOrderMachine,
			workOrder.status,
			WorkOrderStatus.CANCELLED,
		);
	}

	return prisma.$transaction(async (tx) => {
		if (workOrder) {
			await tx.workOrder.update({
				where: { id: workOrder.id },
				data: { status: WorkOrderStatus.CANCELLED },
			});
		}

		const updatedServiceRequest = await tx.serviceRequest.update({
			where: { id: serviceRequest.id },
			data: { status: ServiceRequestStatus.CANCELLED },
			include: {
				workOrder: {
					select: { id: true, status: true },
				},
			},
		});

		await createAuditLog(tx, {
			userId: actor.userId,
			action: AuditAction.REQUEST_CANCELLED,
			entityType: "ServiceRequest",
			entityId: serviceRequest.id,
			metadata: payload.reason ? { reason: payload.reason } : undefined,
		});

		return updatedServiceRequest;
	});
};

const approveServiceRequest = async (id: string, actor: IRequestActor) => {
	const serviceRequest = await prisma.serviceRequest.findFirst({
		where: { id, isDeleted: false },
	});

	if (!serviceRequest) {
		throw new AppError(httpStatus.NOT_FOUND, "Service request not found");
	}

	if (serviceRequest.customerId === actor.userId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You cannot approve your own service request",
		);
	}

	assertTransition(
		serviceRequestMachine,
		serviceRequest.status,
		ServiceRequestStatus.APPROVED,
	);

	return prisma.$transaction(async (tx) => {
		await tx.workOrder.create({
			data: {
				serviceRequestId: serviceRequest.id,
				status: WorkOrderStatus.AWAITING_ASSIGNMENT,
			},
		});

		const updatedServiceRequest = await tx.serviceRequest.update({
			where: { id: serviceRequest.id },
			data: { status: ServiceRequestStatus.APPROVED },
			include: {
				workOrder: {
					select: { id: true, status: true },
				},
			},
		});

		await createAuditLog(tx, {
			userId: actor.userId,
			action: AuditAction.REQUEST_APPROVED,
			entityType: "ServiceRequest",
			entityId: serviceRequest.id,
		});

		return updatedServiceRequest;
	});
};

export const ServiceRequestServices = {
	createServiceRequest,
	getServiceRequests,
	getServiceRequestById,
	cancelServiceRequest,
	approveServiceRequest,
};
