import httpStatus from "http-status";
import type { Prisma } from "../../../generated/prisma/client";
import {
	AssignmentStatus,
	UserStatus,
	WorkOrderStatus,
} from "../../../generated/prisma/enums";
import type {
	FeedbackOrderByWithRelationInput,
	FeedbackWhereInput,
	TechnicianProfileOrderByWithRelationInput,
	TechnicianProfileWhereInput,
} from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { AuditAction, createAuditLog } from "../../utils/auditLog";
import { buildPaginationMeta, getPagination } from "../../utils/pagination";
import type {
	IAdminUpdateTechnicianPayload,
	IFeedbackListQuery,
	ITechnicianListQuery,
	ITechnicianStats,
	IUpdateTechnicianProfilePayload,
} from "./technician.interface";

const PUBLIC_USER_FILTER = {
	isDeleted: false,
	status: UserStatus.ACTIVE,
} as const;

type TProfileUpdateData = {
	professionalTitle?: string;
	yearsOfExperience?: number;
	bio?: string | null;
	skills?: Prisma.InputJsonValue;
	serviceAreas?: Prisma.InputJsonValue;
	workingDays?: Prisma.InputJsonValue;
	preferredHours?: string;
};

const buildProfileUpdateData = (
	payload: IUpdateTechnicianProfilePayload,
): TProfileUpdateData => {
	const data: TProfileUpdateData = {};

	if (payload.professionalTitle !== undefined) {
		data.professionalTitle = payload.professionalTitle;
	}
	if (payload.yearsOfExperience !== undefined) {
		data.yearsOfExperience = payload.yearsOfExperience;
	}
	if (payload.bio !== undefined) {
		data.bio = payload.bio;
	}
	if (payload.skills !== undefined) {
		data.skills = payload.skills as Prisma.InputJsonValue;
	}
	if (payload.serviceAreas !== undefined) {
		data.serviceAreas = payload.serviceAreas as Prisma.InputJsonValue;
	}
	if (payload.workingDays !== undefined) {
		data.workingDays = payload.workingDays as Prisma.InputJsonValue;
	}
	if (payload.preferredHours !== undefined) {
		data.preferredHours = payload.preferredHours;
	}

	return data;
};

const getProfileByUserId = async (userId: string) => {
	const profile = await prisma.technicianProfile.findFirst({
		where: { userId, isDeleted: false },
	});

	if (!profile) {
		throw new AppError(httpStatus.NOT_FOUND, "Technician profile not found");
	}

	return profile;
};

const getActiveProfileById = async (id: string) => {
	const profile = await prisma.technicianProfile.findFirst({
		where: {
			id,
			isDeleted: false,
			user: PUBLIC_USER_FILTER,
		},
	});

	if (!profile) {
		throw new AppError(httpStatus.NOT_FOUND, "Technician profile not found");
	}

	return profile;
};

const getRatingStats = async (technicianId: string) => {
	const stats = await prisma.feedback.aggregate({
		where: { technicianId, isDeleted: false },
		_avg: { rating: true },
		_count: { _all: true },
	});

	const average = stats._avg.rating;

	return {
		averageRating: average === null ? null : Math.round(average * 100) / 100,
		totalReviews: stats._count._all,
	};
};

const getFeedbacks = async (
	technicianId: string,
	query: IFeedbackListQuery,
) => {
	const { page, limit, skip } = getPagination(query);

	const where: FeedbackWhereInput = {
		technicianId,
		isDeleted: false,
	};

	const data = await prisma.feedback.findMany({
		where,
		take: limit,
		skip,
		orderBy: {
			[query.sortBy]: query.sortOrder,
		} as FeedbackOrderByWithRelationInput,
		select: {
			id: true,
			rating: true,
			comment: true,
			createdAt: true,
			customer: {
				select: { name: true, imageUrl: true },
			},
		},
	});

	const total = await prisma.feedback.count({ where });

	return {
		data,
		meta: buildPaginationMeta(page, limit, total),
	};
};

const getPublicProfile = async (id: string) => {
	const profile = await prisma.technicianProfile.findFirst({
		where: {
			id,
			isDeleted: false,
			user: PUBLIC_USER_FILTER,
		},
		include: {
			user: {
				select: { name: true, imageUrl: true },
			},
		},
	});

	if (!profile) {
		throw new AppError(httpStatus.NOT_FOUND, "Technician profile not found");
	}

	const rating = await getRatingStats(profile.id);

	return {
		id: profile.id,
		name: profile.user.name,
		imageUrl: profile.user.imageUrl,
		professionalTitle: profile.professionalTitle,
		yearsOfExperience: profile.yearsOfExperience,
		bio: profile.bio,
		skills: profile.skills,
		serviceAreas: profile.serviceAreas,
		averageRating: rating.averageRating,
		totalReviews: rating.totalReviews,
	};
};

const getPublicFeedbacks = async (id: string, query: IFeedbackListQuery) => {
	const profile = await getActiveProfileById(id);
	return getFeedbacks(profile.id, query);
};

const getMyProfile = async (actorUserId: string) => {
	const profile = await prisma.technicianProfile.findFirst({
		where: { userId: actorUserId, isDeleted: false },
		include: {
			user: {
				select: {
					id: true,
					name: true,
					email: true,
					phone: true,
					imageUrl: true,
				},
			},
		},
	});

	if (!profile) {
		throw new AppError(httpStatus.NOT_FOUND, "Technician profile not found");
	}

	const rating = await getRatingStats(profile.id);

	return { ...profile, ...rating };
};

const updateMyProfile = async (
	actorUserId: string,
	payload: IUpdateTechnicianProfilePayload,
) => {
	const profile = await getProfileByUserId(actorUserId);
	const data = buildProfileUpdateData(payload);

	return prisma.technicianProfile.update({
		where: { id: profile.id },
		data,
	});
};

const getMyFeedbacks = async (
	actorUserId: string,
	query: IFeedbackListQuery,
) => {
	const profile = await getProfileByUserId(actorUserId);
	return getFeedbacks(profile.id, query);
};

const getMyStats = async (actorUserId: string): Promise<ITechnicianStats> => {
	const profile = await getProfileByUserId(actorUserId);

	const [groupedAssignments, completedJobs, rating] = await Promise.all([
		prisma.assignment.groupBy({
			by: ["status"],
			where: { technicianId: profile.id, isDeleted: false },
			_count: { _all: true },
		}),
		prisma.assignment.count({
			where: {
				technicianId: profile.id,
				isDeleted: false,
				workOrder: {
					status: WorkOrderStatus.COMPLETED,
					isDeleted: false,
				},
			},
		}),
		getRatingStats(profile.id),
	]);

	const assignmentsByStatus: Record<AssignmentStatus, number> = {
		[AssignmentStatus.PENDING]: 0,
		[AssignmentStatus.ACCEPTED]: 0,
		[AssignmentStatus.REJECTED]: 0,
		[AssignmentStatus.CANCELLED]: 0,
	};

	for (const group of groupedAssignments) {
		assignmentsByStatus[group.status] = group._count._all;
	}

	const totalAssignments = Object.values(assignmentsByStatus).reduce(
		(sum, count) => sum + count,
		0,
	);

	return {
		assignmentsByStatus,
		totalAssignments,
		completedJobs,
		averageRating: rating.averageRating,
		totalReviews: rating.totalReviews,
	};
};

const getTechnicians = async (query: ITechnicianListQuery) => {
	const { page, limit, skip } = getPagination(query);

	const andConditions: TechnicianProfileWhereInput[] = [
		{ isDeleted: false },
		{ user: { isDeleted: false } },
	];

	if (query.searchTerm) {
		const searchTerm = query.searchTerm;
		andConditions.push({
			OR: [
				{ professionalTitle: { contains: searchTerm, mode: "insensitive" } },
				{ user: { name: { contains: searchTerm, mode: "insensitive" } } },
				{ user: { email: { contains: searchTerm, mode: "insensitive" } } },
			],
		});
	}

	const where: TechnicianProfileWhereInput = { AND: andConditions };

	const profiles = await prisma.technicianProfile.findMany({
		where,
		take: limit,
		skip,
		orderBy: {
			[query.sortBy]: query.sortOrder,
		} as TechnicianProfileOrderByWithRelationInput,
		include: {
			user: {
				select: {
					id: true,
					name: true,
					email: true,
					phone: true,
					imageUrl: true,
					status: true,
				},
			},
		},
	});

	const total = await prisma.technicianProfile.count({ where });

	const ids = profiles.map((profile) => profile.id);

	const ratingGroups =
		ids.length > 0
			? await prisma.feedback.groupBy({
					by: ["technicianId"],
					where: { technicianId: { in: ids }, isDeleted: false },
					_avg: { rating: true },
					_count: { _all: true },
				})
			: [];

	const ratingMap = new Map(
		ratingGroups.map((group) => [
			group.technicianId,
			{
				averageRating:
					group._avg.rating === null
						? null
						: Math.round(group._avg.rating * 100) / 100,
				totalReviews: group._count._all,
			},
		]),
	);

	const data = profiles.map((profile) => ({
		...profile,
		...(ratingMap.get(profile.id) ?? {
			averageRating: null,
			totalReviews: 0,
		}),
	}));

	return {
		data,
		meta: buildPaginationMeta(page, limit, total),
	};
};

const getAvailableTechnicians = async (workOrderId: string) => {
	const workOrder = await prisma.workOrder.findFirst({
		where: { id: workOrderId, isDeleted: false },
		select: {
			serviceRequest: {
				select: {
					customerId: true,
					isDeleted: true,
					service: {
						select: { requiredSkill: true },
					},
				},
			},
		},
	});

	if (!workOrder || workOrder.serviceRequest.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Work order not found");
	}

	const requiredSkill = workOrder.serviceRequest.service.requiredSkill
		.trim()
		.toLowerCase();

	const profiles = await prisma.technicianProfile.findMany({
		where: {
			isDeleted: false,
			userId: { not: workOrder.serviceRequest.customerId },
			user: {
				isDeleted: false,
				status: UserStatus.ACTIVE,
			},
		},
		select: {
			id: true,
			professionalTitle: true,
			skills: true,
			serviceAreas: true,
			user: {
				select: { name: true },
			},
		},
	});

	const matchedProfiles = profiles.filter((profile) => {
		const skills = Array.isArray(profile.skills) ? profile.skills : [];

		return skills.some(
			(skill) =>
				typeof skill === "string" &&
				skill.trim().toLowerCase() === requiredSkill,
		);
	});

	const ids = matchedProfiles.map((profile) => profile.id);

	const ratingGroups =
		ids.length > 0
			? await prisma.feedback.groupBy({
					by: ["technicianId"],
					where: { technicianId: { in: ids }, isDeleted: false },
					_avg: { rating: true },
				})
			: [];

	const ratingMap = new Map(
		ratingGroups.map((group) => [
			group.technicianId,
			group._avg.rating === null
				? null
				: Math.round(group._avg.rating * 100) / 100,
		]),
	);

	return matchedProfiles.map((profile) => ({
		id: profile.id,
		name: profile.user.name,
		professionalTitle: profile.professionalTitle,
		skills: profile.skills,
		serviceAreas: profile.serviceAreas,
		averageRating: ratingMap.get(profile.id) ?? null,
	}));
};

const adminUpdateTechnician = async (
	id: string,
	payload: IAdminUpdateTechnicianPayload,
	actorUserId: string,
) => {
	const profile = await prisma.technicianProfile.findFirst({
		where: { id, isDeleted: false },
		select: { id: true },
	});

	if (!profile) {
		throw new AppError(httpStatus.NOT_FOUND, "Technician profile not found");
	}

	if (payload.isDeleted === true) {
		return prisma.$transaction(async (tx) => {
			const updated = await tx.technicianProfile.update({
				where: { id },
				data: { isDeleted: true, deletedAt: new Date() },
			});

			await createAuditLog(tx, {
				userId: actorUserId,
				action: AuditAction.RECORD_DELETED,
				entityType: "TechnicianProfile",
				entityId: id,
			});

			return updated;
		});
	}

	const data = buildProfileUpdateData(payload);

	return prisma.technicianProfile.update({
		where: { id },
		data,
	});
};

export const TechnicianServices = {
	getPublicProfile,
	getPublicFeedbacks,
	getMyProfile,
	updateMyProfile,
	getMyFeedbacks,
	getMyStats,
	getTechnicians,
	getAvailableTechnicians,
	adminUpdateTechnician,
};
