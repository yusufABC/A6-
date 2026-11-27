import httpStatus from "http-status";
import {
	AppointmentStatus,
	AssignmentStatus,
	NotificationCategory,
	Role,
	UserStatus,
	WorkOrderStatus,
} from "../../../generated/prisma/enums";
import type {
	AssignmentOrderByWithRelationInput,
	AssignmentWhereInput,
} from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { AuditAction, createAuditLog } from "../../utils/auditLog";
import { createNotification } from "../../utils/notification";
import { buildPaginationMeta, getPagination } from "../../utils/pagination";
import {
	appointmentMachine,
	assertTransition,
	assignmentMachine,
	workOrderMachine,
} from "../../utils/statusMachine";
import type {
	IAssignmentListQuery,
	IReassignPayload,
	IRejectAssignmentPayload,
	IRequestActor,
} from "./assignment.interface";

const getAssignments = async (
	query: IAssignmentListQuery,
	actor: IRequestActor,
) => {
	const { page, limit, skip } = getPagination(query);

	const andConditions: AssignmentWhereInput[] = [{ isDeleted: false }];

	if (actor.role === Role.TECHNICIAN) {
		const technicianProfile = await prisma.technicianProfile.findFirst({
			where: { userId: actor.userId, isDeleted: false },
			select: { id: true },
		});

		if (!technicianProfile) {
			throw new AppError(httpStatus.NOT_FOUND, "Technician profile not found");
		}

		andConditions.push({ technicianId: technicianProfile.id });
	}

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	const where: AssignmentWhereInput = { AND: andConditions };

	const [data, total] = await Promise.all([
		prisma.assignment.findMany({
			where,
			take: limit,
			skip,
			orderBy: {
				[query.sortBy]: query.sortOrder,
			} as AssignmentOrderByWithRelationInput,
			include: {
				workOrder: {
					select: {
						id: true,
						status: true,
						serviceRequest: {
							select: {
								id: true,
								serviceNameSnapshot: true,
								serviceCity: true,
								serviceDistrict: true,
								preferredDateTime: true,
								customer: {
									select: {
										id: true,
										name: true,
										email: true,
										phone: true,
										imageUrl: true,
									},
								},
							},
						},
					},
				},
				appointment: {
					select: {
						id: true,
						startTime: true,
						endTime: true,
						status: true,
					},
				},
				technician: {
					select: {
						id: true,
						professionalTitle: true,
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
				},
			},
		}),
		prisma.assignment.count({ where }),
	]);

	return {
		data,
		meta: buildPaginationMeta(page, limit, total),
	};
};

const getAssignmentById = async (id: string, actor: IRequestActor) => {
	const assignment = await prisma.assignment.findFirst({
		where: { id, isDeleted: false },
		include: {
			workOrder: {
				select: {
					id: true,
					status: true,
					serviceRequest: {
						select: {
							id: true,
							description: true,
							serviceNameSnapshot: true,
							basePriceSnapshot: true,
							serviceAddressLine: true,
							serviceCity: true,
							serviceDistrict: true,
							servicePostalCode: true,
							preferredDateTime: true,
							attachments: true,
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
								select: {
									id: true,
									name: true,
									requiredSkill: true,
								},
							},
						},
					},
				},
			},
			appointment: {
				select: {
					id: true,
					startTime: true,
					endTime: true,
					status: true,
				},
			},
			technician: {
				select: {
					id: true,
					professionalTitle: true,
					skills: true,
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
			},
		},
	});

	if (!assignment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assignment not found");
	}

	if (actor.role === Role.TECHNICIAN) {
		const technicianProfile = await prisma.technicianProfile.findFirst({
			where: { userId: actor.userId, isDeleted: false },
			select: { id: true },
		});

		if (!technicianProfile) {
			throw new AppError(httpStatus.NOT_FOUND, "Technician profile not found");
		}

		if (assignment.technicianId !== technicianProfile.id) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You don't have permission to view this assignment",
			);
		}
	}

	return assignment;
};

const acceptAssignment = async (id: string, actorUserId: string) => {
	const technicianProfile = await prisma.technicianProfile.findFirst({
		where: { userId: actorUserId, isDeleted: false },
		select: { id: true },
	});

	if (!technicianProfile) {
		throw new AppError(httpStatus.NOT_FOUND, "Technician profile not found");
	}

	const assignment = await prisma.assignment.findFirst({
		where: { id, isDeleted: false },
		include: {
			workOrder: {
				include: {
					serviceRequest: {
						select: {
							customerId: true,
							serviceNameSnapshot: true,
						},
					},
				},
			},
			appointment: true,
			technician: {
				include: {
					user: {
						select: {
							name: true,
						},
					},
				},
			},
		},
	});

	if (!assignment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assignment not found");
	}

	if (assignment.technicianId !== technicianProfile.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not authorized to accept this assignment",
		);
	}

	assertTransition(
		assignmentMachine,
		assignment.status,
		AssignmentStatus.ACCEPTED,
	);
	assertTransition(
		workOrderMachine,
		assignment.workOrder.status,
		WorkOrderStatus.SCHEDULED,
	);

	if (
		!assignment.appointment ||
		assignment.appointment.isDeleted ||
		assignment.appointment.status !== AppointmentStatus.SCHEDULED
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"An active appointment is required to accept this assignment",
		);
	}

	return prisma.$transaction(
		async (tx) => {
			const updatedAssignment = await tx.assignment.update({
				where: { id: assignment.id },
				data: { status: AssignmentStatus.ACCEPTED },
				include: {
					workOrder: true,
					appointment: true,
				},
			});

			await tx.workOrder.update({
				where: { id: assignment.workOrderId },
				data: { status: WorkOrderStatus.SCHEDULED },
			});

			await createAuditLog(tx, {
				userId: actorUserId,
				action: AuditAction.ASSIGNMENT_ACCEPTED,
				entityType: "Assignment",
				entityId: assignment.id,
			});

			await createNotification(tx, {
				userId: assignment.workOrder.serviceRequest.customerId,
				category: NotificationCategory.ASSIGNMENT,
				title: "Assignment accepted",
				message: `Technician ${assignment.technician.user.name} has accepted the assignment for "${assignment.workOrder.serviceRequest.serviceNameSnapshot}".`,
			});

			return updatedAssignment;
		},
		{ maxWait: 10000, timeout: 30000 },
	);
};

const rejectAssignment = async (
	id: string,
	payload: IRejectAssignmentPayload,
	actorUserId: string,
) => {
	const technicianProfile = await prisma.technicianProfile.findFirst({
		where: { userId: actorUserId, isDeleted: false },
		select: { id: true },
	});

	if (!technicianProfile) {
		throw new AppError(httpStatus.NOT_FOUND, "Technician profile not found");
	}

	const assignment = await prisma.assignment.findFirst({
		where: { id, isDeleted: false },
		include: {
			workOrder: {
				include: {
					serviceRequest: {
						select: {
							customerId: true,
							serviceNameSnapshot: true,
						},
					},
				},
			},
			appointment: true,
			technician: {
				include: {
					user: {
						select: {
							name: true,
						},
					},
				},
			},
		},
	});

	if (!assignment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assignment not found");
	}

	if (assignment.technicianId !== technicianProfile.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not authorized to reject this assignment",
		);
	}

	assertTransition(
		assignmentMachine,
		assignment.status,
		AssignmentStatus.REJECTED,
	);

	if (
		assignment.appointment &&
		assignment.appointment.status === AppointmentStatus.SCHEDULED
	) {
		assertTransition(
			appointmentMachine,
			assignment.appointment.status,
			AppointmentStatus.CANCELLED,
		);
	}

	assertTransition(
		workOrderMachine,
		assignment.workOrder.status,
		WorkOrderStatus.AWAITING_ASSIGNMENT,
	);

	return prisma.$transaction(
		async (tx) => {
			const updatedAssignment = await tx.assignment.update({
				where: { id: assignment.id },
				data: {
					status: AssignmentStatus.REJECTED,
					rejectionReason: payload.rejectionReason,
				},
				include: {
					workOrder: true,
					appointment: true,
				},
			});

			if (
				assignment.appointment &&
				assignment.appointment.status === AppointmentStatus.SCHEDULED
			) {
				await tx.appointment.update({
					where: { id: assignment.appointment.id },
					data: { status: AppointmentStatus.CANCELLED },
				});
			}

			await tx.workOrder.update({
				where: { id: assignment.workOrderId },
				data: { status: WorkOrderStatus.AWAITING_ASSIGNMENT },
			});

			await createAuditLog(tx, {
				userId: actorUserId,
				action: AuditAction.ASSIGNMENT_REJECTED,
				entityType: "Assignment",
				entityId: assignment.id,
				metadata: { reason: payload.rejectionReason },
			});

			// Notify customer
			await createNotification(tx, {
				userId: assignment.workOrder.serviceRequest.customerId,
				category: NotificationCategory.ASSIGNMENT,
				title: "Assignment rejected",
				message: `Technician ${assignment.technician.user.name} was unable to accept the assignment for "${assignment.workOrder.serviceRequest.serviceNameSnapshot}".`,
			});

			// Notify managers and admins
			const managersAndAdmins = await tx.user.findMany({
				where: {
					role: { in: [Role.MANAGER, Role.ADMIN] },
					status: UserStatus.ACTIVE,
					isDeleted: false,
				},
				select: { id: true },
			});

			for (const managerOrAdmin of managersAndAdmins) {
				await createNotification(tx, {
					userId: managerOrAdmin.id,
					category: NotificationCategory.ASSIGNMENT,
					title: "Assignment rejected",
					message: `Technician ${assignment.technician.user.name} rejected assignment for work order ${assignment.workOrderId}. Reason: ${payload.rejectionReason}.`,
				});
			}

			return updatedAssignment;
		},
		{ maxWait: 10000, timeout: 30000 },
	);
};

const reassignAssignment = async (
	id: string,
	payload: IReassignPayload,
	actorUserId: string,
) => {
	const assignment = await prisma.assignment.findFirst({
		where: { id, isDeleted: false },
		include: {
			workOrder: {
				include: {
					serviceRequest: {
						select: {
							id: true,
							customerId: true,
							serviceNameSnapshot: true,
							service: {
								select: { estimatedDurationMinutes: true },
							},
						},
					},
				},
			},
			appointment: true,
			technician: {
				include: {
					user: {
						select: {
							id: true,
							name: true,
						},
					},
				},
			},
		},
	});

	if (!assignment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assignment not found");
	}

	const oldTechnicianId = assignment.technicianId;
	const oldTechnicianUserId = assignment.technician.user.id;

	// Allowed if assignment is REJECTED, or PENDING/ACCEPTED with a manager decision
	if (
		assignment.status !== AssignmentStatus.REJECTED &&
		assignment.status !== AssignmentStatus.PENDING &&
		assignment.status !== AssignmentStatus.ACCEPTED
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Assignment cannot be reassigned in its current status",
		);
	}

	const newTechnician = await prisma.technicianProfile.findFirst({
		where: { id: payload.technicianId, isDeleted: false },
		select: {
			id: true,
			userId: true,
			user: {
				select: {
					id: true,
					name: true,
					status: true,
					isDeleted: true,
				},
			},
		},
	});

	if (!newTechnician) {
		throw new AppError(httpStatus.NOT_FOUND, "New technician not found");
	}

	if (
		newTechnician.user.status !== UserStatus.ACTIVE ||
		newTechnician.user.isDeleted
	) {
		throw new AppError(httpStatus.BAD_REQUEST, "Technician is not active");
	}

	if (newTechnician.userId === assignment.workOrder.serviceRequest.customerId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Technician cannot be assigned to their own service request",
		);
	}

	const existingStartTime = assignment.appointment?.startTime ?? new Date();
	const startTime = payload.startTime ?? existingStartTime;
	const endTime =
		payload.endTime ??
		new Date(
			startTime.getTime() +
				assignment.workOrder.serviceRequest.service.estimatedDurationMinutes *
					60 *
					1000,
		);

	if (endTime.getTime() <= startTime.getTime()) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"endTime must be after startTime",
		);
	}

	const newTechnicianId = newTechnician.id;

	return prisma.$transaction(
		async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242, hashtext(${newTechnicianId}::text))`;

			const conflicts = await tx.$queryRaw<Array<{ id: string }>>`
				SELECT a.id
				FROM appointments a
				JOIN assignments asg ON a."assignmentId" = asg.id
				WHERE asg."technicianId" = ${newTechnicianId}
					AND a.status <> 'CANCELLED'
					AND a."isDeleted" = false
					AND a."startTime" < ${endTime}
					AND a."endTime" > ${startTime}
				LIMIT 1
			`;

			if (conflicts.length > 0) {
				throw new AppError(
					httpStatus.CONFLICT,
					"Technician has a conflicting appointment",
				);
			}

			// Cancel old appointment if active
			if (
				assignment.appointment &&
				assignment.appointment.status === AppointmentStatus.SCHEDULED
			) {
				await tx.appointment.update({
					where: { id: assignment.appointment.id },
					data: { status: AppointmentStatus.CANCELLED },
				});
			}

			// Update same assignment row
			const updatedAssignment = await tx.assignment.update({
				where: { id: assignment.id },
				data: {
					technicianId: newTechnician.id,
					status: AssignmentStatus.PENDING,
					rejectionReason: null,
				},
				include: {
					workOrder: {
						include: {
							serviceRequest: {
								select: {
									id: true,
									serviceNameSnapshot: true,
								},
							},
						},
					},
					appointment: true,
					technician: {
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
					},
				},
			});

			const newAppointment = await tx.appointment.create({
				data: {
					assignmentId: assignment.id,
					startTime,
					endTime,
					status: AppointmentStatus.SCHEDULED,
				},
			});

			await tx.workOrder.update({
				where: { id: assignment.workOrderId },
				data: { status: WorkOrderStatus.ASSIGNED },
			});

			await createAuditLog(tx, {
				userId: actorUserId,
				action: AuditAction.ASSIGNMENT_REPLACED,
				entityType: "Assignment",
				entityId: assignment.id,
				metadata: {
					oldTechnicianId,
					newTechnicianId: newTechnician.id,
				},
			});

			// Notify old technician
			await createNotification(tx, {
				userId: oldTechnicianUserId,
				category: NotificationCategory.ASSIGNMENT,
				title: "Assignment reassigned",
				message: `You have been unassigned from work order ${assignment.workOrderId}.`,
			});

			// Notify new technician
			await createNotification(tx, {
				userId: newTechnician.userId,
				category: NotificationCategory.ASSIGNMENT,
				title: "New job assigned",
				message: `You have been assigned to service request "${assignment.workOrder.serviceRequest.serviceNameSnapshot}" scheduled from ${startTime.toISOString()} to ${endTime.toISOString()}.`,
			});

			// Notify customer
			await createNotification(tx, {
				userId: assignment.workOrder.serviceRequest.customerId,
				category: NotificationCategory.ASSIGNMENT,
				title: "Technician reassigned",
				message: `Technician ${newTechnician.user.name} has been assigned to your service request "${assignment.workOrder.serviceRequest.serviceNameSnapshot}".`,
			});

			return {
				...updatedAssignment,
				appointment: newAppointment,
			};
		},
		{ maxWait: 10000, timeout: 30000 },
	);
};

export const AssignmentServices = {
	getAssignments,
	getAssignmentById,
	acceptAssignment,
	rejectAssignment,
	reassignAssignment,
};
