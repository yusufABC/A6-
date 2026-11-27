import httpStatus from "http-status";
import type { Prisma } from "../../../generated/prisma/client";
import { TechnicianApplicationStatus } from "../../../generated/prisma/enums";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import { uploadToCloudinary } from "../../lib/uploadImage";
import { AppError } from "../../utils/AppError";
import { AuditAction, createAuditLog } from "../../utils/auditLog";
import type {
	IAdditionalFile,
	ICreateTechnicianApplicationPayload,
	ITechnicianApplicationFiles,
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

export const TechnicianApplicationServices = {
	createTechnicianApplication,
	getMyApplications,
	deleteTechnicianApplication,
};
