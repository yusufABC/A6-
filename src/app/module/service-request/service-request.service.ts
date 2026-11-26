import httpStatus from "http-status";
import { UserStatus } from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { uploadToCloudinary } from "../../lib/uploadImage";
import { AppError } from "../../utils/AppError";
import { AuditAction, createAuditLog } from "../../utils/auditLog";
import type {
	IAttachment,
	ICreateServiceRequestPayload,
} from "./service-request.interface";

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

export const ServiceRequestServices = {
	createServiceRequest,
};
