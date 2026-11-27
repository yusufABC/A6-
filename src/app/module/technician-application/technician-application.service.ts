import httpStatus from "http-status";
import type { Prisma } from "../../../generated/prisma/client";
import {
	Role,
	TechnicianApplicationStatus,
	UserStatus,
} from "../../../generated/prisma/enums";
import type {
	TechnicianApplicationOrderByWithRelationInput,
	TechnicianApplicationWhereInput,
} from "../../../generated/prisma/models";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import { uploadToCloudinary } from "../../lib/uploadImage";
import { AppError } from "../../utils/AppError";
import { AuditAction, createAuditLog } from "../../utils/auditLog";
import { buildPaginationMeta, getPagination } from "../../utils/pagination";
import {
	assertTransition,
	technicianApplicationMachine,
} from "../../utils/statusMachine";
import type {
	IAdditionalFile,
	IApproveTechnicianApplicationPayload,
	ICreateTechnicianApplicationPayload,
	IRejectTechnicianApplicationPayload,
	ITechnicianApplicationFiles,
	ITechnicianApplicationListQuery,
} from "./technician-application.interface";

const APPLICATION_FOLDER = "fsms/applications";

const uploadApplicationFiles = async (files: ITechnicianApplicationFiles) => {
	const resumeFile = files.resume?.[0];

	if (!resumeFile) {
		throw new AppError(httpStatus.BAD_REQUEST, "Resume file is required");
	}

	const resumeUpload = await uploadToCloudinary(resumeFile.buffer, {
		resource_type: "auto",
		folder: APPLICATION_FOLDER,
	});

	const additionalFiles: IAdditionalFile[] = await Promise.all(
		(files.additionalFiles ?? []).map(async (file) => {
			const uploaded = await uploadToCloudinary(file.buffer, {
				resource_type: "auto",
				folder: APPLICATION_FOLDER,
			});

			return {
				url: uploaded.secure_url,
				publicId: uploaded.public_id,
			};
		}),
	);

	return {
		resume: resumeUpload.secure_url,
		resumePublicId: resumeUpload.public_id,
		additionalFiles,
	};
};

const cleanupUploadedFiles = async (publicIds: string[]) => {
	await Promise.all(
		publicIds.map((publicId) =>
			cloudinary.uploader.destroy(publicId).catch(() => undefined),
		),
	);
};

const createTechnicianApplication = async (
	payload: ICreateTechnicianApplicationPayload,
	files: ITechnicianApplicationFiles,
	actorUserId: string,
) => {
	const existingPending = await prisma.technicianApplication.findFirst({
		where: {
			userId: actorUserId,
			status: TechnicianApplicationStatus.PENDING,
			isDeleted: false,
		},
		select: { id: true },
	});

	if (existingPending) {
		throw new AppError(
			httpStatus.CONFLICT,
			"You already have a pending technician application",
		);
	}

	let uploaded: Awaited<ReturnType<typeof uploadApplicationFiles>> | undefined;

	try {
		const uploadedFiles = await uploadApplicationFiles(files);
		uploaded = uploadedFiles;

		return await prisma.$transaction(async (tx) => {
			const lockedUsers = await tx.$queryRaw<{ id: string }[]>`
				SELECT id FROM users WHERE id = ${actorUserId} FOR UPDATE
			`;

			if (lockedUsers.length === 0) {
				throw new AppError(httpStatus.NOT_FOUND, "User not found");
			}

			const pendingApplication = await tx.technicianApplication.findFirst({
				where: {
					userId: actorUserId,
					status: TechnicianApplicationStatus.PENDING,
					isDeleted: false,
				},
				select: { id: true },
			});

			if (pendingApplication) {
				throw new AppError(
					httpStatus.CONFLICT,
					"You already have a pending technician application",
				);
			}

			const application = await tx.technicianApplication.create({
				data: {
					userId: actorUserId,
					status: TechnicianApplicationStatus.PENDING,
					professionalTitle: payload.professionalTitle,
					yearsOfExperience: payload.yearsOfExperience,
					bio: payload.bio ?? null,
					skills: payload.skills as Prisma.InputJsonValue,
					serviceAreas: payload.serviceAreas as Prisma.InputJsonValue,
					workingDays: (payload.workingDays ?? undefined) as
						| Prisma.InputJsonValue
						| undefined,
					preferredHours: payload.preferredHours ?? null,
					resume: uploadedFiles.resume,
					resumePublicId: uploadedFiles.resumePublicId,
					additionalFiles:
						uploadedFiles.additionalFiles.length > 0
							? (uploadedFiles.additionalFiles as unknown as Prisma.InputJsonValue)
							: undefined,
				},
			});

			await createAuditLog(tx, {
				userId: actorUserId,
				action: AuditAction.TECHNICIAN_APPLICATION_SUBMITTED,
				entityType: "TechnicianApplication",
				entityId: application.id,
			});

			return application;
		});
	} catch (error) {
		if (uploaded) {
			await cleanupUploadedFiles([
				uploaded.resumePublicId,
				...uploaded.additionalFiles.map((file) => file.publicId),
			]);
		}

		throw error;
	}
};

const getMyApplications = async (actorUserId: string) => {
	return prisma.technicianApplication.findMany({
		where: {
			userId: actorUserId,
			isDeleted: false,
		},
		orderBy: { createdAt: "desc" },
	});
};

const deleteTechnicianApplication = async (id: string, actorUserId: string) => {
	const application = await prisma.technicianApplication.findFirst({
		where: {
			id,
			isDeleted: false,
		},
	});

	if (!application) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Technician application not found",
		);
	}

	if (application.userId !== actorUserId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You don't have permission to withdraw this technician application",
		);
	}

	if (application.status !== TechnicianApplicationStatus.PENDING) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Only pending technician applications can be withdrawn",
		);
	}

	return prisma.technicianApplication.update({
		where: { id },
		data: {
			isDeleted: true,
			deletedAt: new Date(),
		},
	});
};

const getTechnicianApplications = async (
	query: ITechnicianApplicationListQuery,
) => {
	const { page, limit, skip } = getPagination(query);

	const andConditions: TechnicianApplicationWhereInput[] = [
		{ isDeleted: false },
	];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	if (query.searchTerm) {
		const searchTerm = query.searchTerm;
		andConditions.push({
			OR: [
				{
					professionalTitle: { contains: searchTerm, mode: "insensitive" },
				},
				{ user: { name: { contains: searchTerm, mode: "insensitive" } } },
				{ user: { email: { contains: searchTerm, mode: "insensitive" } } },
			],
		});
	}

	const where: TechnicianApplicationWhereInput = { AND: andConditions };

	const data = await prisma.technicianApplication.findMany({
		where,
		take: limit,
		skip,
		orderBy: {
			[query.sortBy]: query.sortOrder,
		} as TechnicianApplicationOrderByWithRelationInput,
		include: {
			user: {
				select: {
					id: true,
					name: true,
					email: true,
					phone: true,
					imageUrl: true,
					role: true,
					status: true,
				},
			},
		},
	});

	const total = await prisma.technicianApplication.count({ where });

	return {
		data,
		meta: buildPaginationMeta(page, limit, total),
	};
};

const approveTechnicianApplication = async (
	id: string,
	actorUserId: string,
	payload: IApproveTechnicianApplicationPayload,
) => {
	return prisma.$transaction(async (tx) => {
		const lockedApplications = await tx.$queryRaw<
			{
				id: string;
				status: TechnicianApplicationStatus;
				userId: string;
			}[]
		>`
			SELECT id, status, "userId" FROM technician_applications
			WHERE id = ${id} AND "isDeleted" = false
			FOR UPDATE
		`;

		if (lockedApplications.length === 0) {
			throw new AppError(
				httpStatus.NOT_FOUND,
				"Technician application not found",
			);
		}

		assertTransition(
			technicianApplicationMachine,
			lockedApplications[0].status,
			TechnicianApplicationStatus.APPROVED,
		);

		const application = await tx.technicianApplication.findUnique({
			where: { id },
		});

		if (!application) {
			throw new AppError(
				httpStatus.NOT_FOUND,
				"Technician application not found",
			);
		}

		const user = await tx.user.findUnique({
			where: { id: application.userId },
		});

		if (!user || user.isDeleted || user.status === UserStatus.DELETED) {
			throw new AppError(httpStatus.NOT_FOUND, "Applicant not found");
		}

		const existingProfile = await tx.technicianProfile.findUnique({
			where: { userId: application.userId },
		});

		const updatedApplication = await tx.technicianApplication.update({
			where: { id: application.id },
			data: {
				status: TechnicianApplicationStatus.APPROVED,
				reviewedBy: actorUserId,
				reviewedAt: new Date(),
				reviewNote: payload.reviewNote ?? null,
			},
		});

		await tx.user.update({
			where: { id: application.userId },
			data: { role: Role.TECHNICIAN },
		});

		let technicianProfile = existingProfile;
		if (!technicianProfile) {
			technicianProfile = await tx.technicianProfile.create({
				data: {
					userId: application.userId,
					professionalTitle: application.professionalTitle,
					yearsOfExperience: application.yearsOfExperience,
					bio: application.bio,
					skills:
						application.skills === null
							? undefined
							: (application.skills as Prisma.InputJsonValue),
					serviceAreas:
						application.serviceAreas === null
							? undefined
							: (application.serviceAreas as Prisma.InputJsonValue),
					workingDays:
						application.workingDays === null
							? undefined
							: (application.workingDays as Prisma.InputJsonValue),
					preferredHours: application.preferredHours,
				},
			});
		}

		await createAuditLog(tx, {
			userId: actorUserId,
			action: AuditAction.TECHNICIAN_APPROVED,
			entityType: "TechnicianApplication",
			entityId: application.id,
			metadata: payload.reviewNote
				? { reviewNote: payload.reviewNote }
				: undefined,
		});

		await createAuditLog(tx, {
			userId: actorUserId,
			action: AuditAction.USER_ROLE_UPDATED,
			entityType: "User",
			entityId: application.userId,
			metadata: { oldRole: user.role, newRole: Role.TECHNICIAN },
		});

		return { application: updatedApplication, technicianProfile };
	});
};

const rejectTechnicianApplication = async (
	id: string,
	actorUserId: string,
	payload: IRejectTechnicianApplicationPayload,
) => {
	return prisma.$transaction(async (tx) => {
		const lockedApplications = await tx.$queryRaw<
			{ id: string; status: TechnicianApplicationStatus }[]
		>`
			SELECT id, status FROM technician_applications
			WHERE id = ${id} AND "isDeleted" = false
			FOR UPDATE
		`;

		if (lockedApplications.length === 0) {
			throw new AppError(
				httpStatus.NOT_FOUND,
				"Technician application not found",
			);
		}

		assertTransition(
			technicianApplicationMachine,
			lockedApplications[0].status,
			TechnicianApplicationStatus.REJECTED,
		);

		const updatedApplication = await tx.technicianApplication.update({
			where: { id },
			data: {
				status: TechnicianApplicationStatus.REJECTED,
				reviewedBy: actorUserId,
				reviewedAt: new Date(),
				reviewNote: payload.reviewNote,
			},
		});

		await createAuditLog(tx, {
			userId: actorUserId,
			action: AuditAction.TECHNICIAN_REJECTED,
			entityType: "TechnicianApplication",
			entityId: id,
			metadata: { reviewNote: payload.reviewNote },
		});

		return updatedApplication;
	});
};

export const TechnicianApplicationServices = {
	createTechnicianApplication,
	getMyApplications,
	deleteTechnicianApplication,
	getTechnicianApplications,
	approveTechnicianApplication,
	rejectTechnicianApplication,
};
