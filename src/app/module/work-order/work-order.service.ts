import httpStatus from "http-status";
import {
	AppointmentStatus,
	AssignmentStatus,
	NotificationCategory,
	Role,
	ServiceRequestStatus,
	UserStatus,
	WorkOrderStatus,
} from "../../../generated/prisma/enums";
import type {
	WorkOrderOrderByWithRelationInput,
	WorkOrderWhereInput,
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
	serviceRequestMachine,
	workOrderMachine,
} from "../../utils/statusMachine";
import type {
	IAssignTechnicianPayload,
	ICancelWorkOrderPayload,
	IRequestActor,
	IWorkOrderListQuery,
} from "./work-order.interface";

const assignTechnician = async (
	workOrderId: string,
	payload: IAssignTechnicianPayload,
	actorUserId: string,
) => {
	const workOrder = await prisma.workOrder.findFirst({
		where: { id: workOrderId, isDeleted: false },
		include: {
			serviceRequest: {
				select: {
					id: true,
					customerId: true,
					isDeleted: true,
					serviceNameSnapshot: true,
					service: {
						select: { estimatedDurationMinutes: true },
					},
				},
			},
		},
	});

	if (!workOrder || workOrder.serviceRequest.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Work order not found");
	}

	assertTransition(
		workOrderMachine,
		workOrder.status,
		WorkOrderStatus.ASSIGNED,
	);

	const technician = await prisma.technicianProfile.findFirst({
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

	if (!technician) {
		throw new AppError(httpStatus.NOT_FOUND, "Technician not found");
	}

	if (
		technician.user.status !== UserStatus.ACTIVE ||
		technician.user.isDeleted
	) {
		throw new AppError(httpStatus.BAD_REQUEST, "Technician is not active");
	}

	if (technician.userId === workOrder.serviceRequest.customerId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Technician cannot be assigned to their own service request",
		);
	}

	const startTime = payload.startTime;
	const endTime =
		payload.endTime ??
		new Date(
			startTime.getTime() +
				workOrder.serviceRequest.service.estimatedDurationMinutes * 60 * 1000,
		);

	if (endTime.getTime() <= startTime.getTime()) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"endTime must be after startTime",
		);
	}

	const technicianId = technician.id;

	return prisma.$transaction(
		async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242, hashtext(${technicianId}::text))`;

			const conflicts = await tx.$queryRaw<Array<{ id: string }>>`
				SELECT a.id
				FROM appointments a
				JOIN assignments asg ON a."assignmentId" = asg.id
				WHERE asg."technicianId" = ${technicianId}
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

			const assignment = await tx.assignment.create({
				data: {
					workOrderId: workOrder.id,
					technicianId: technician.id,
					status: AssignmentStatus.PENDING,
				},
			});

			const appointment = await tx.appointment.create({
				data: {
					assignmentId: assignment.id,
					startTime,
					endTime,
					status: AppointmentStatus.SCHEDULED,
				},
			});

			const updatedWorkOrder = await tx.workOrder.update({
				where: { id: workOrder.id },
				data: { status: WorkOrderStatus.ASSIGNED },
				include: {
					assignment: {
						include: {
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
							appointment: true,
						},
					},
				},
			});

			await createAuditLog(tx, {
				userId: actorUserId,
				action: AuditAction.TECHNICIAN_ASSIGNED,
				entityType: "Assignment",
				entityId: assignment.id,
			});

			await createAuditLog(tx, {
				userId: actorUserId,
				action: AuditAction.APPOINTMENT_SCHEDULED,
				entityType: "Appointment",
				entityId: appointment.id,
			});

			await createNotification(tx, {
				userId: workOrder.serviceRequest.customerId,
				category: NotificationCategory.ASSIGNMENT,
				title: "Technician assigned",
				message: `Technician ${technician.user.name} has been assigned to your service request "${workOrder.serviceRequest.serviceNameSnapshot}".`,
			});

			await createNotification(tx, {
				userId: technician.userId,
				category: NotificationCategory.ASSIGNMENT,
				title: "New job assigned",
				message: `You have been assigned a new job for "${workOrder.serviceRequest.serviceNameSnapshot}" scheduled from ${startTime.toISOString()} to ${endTime.toISOString()}.`,
			});

			return updatedWorkOrder;
		},
		{ maxWait: 10000, timeout: 30000 },
	);
};

const cancelWorkOrder = async (
	workOrderId: string,
	payload: ICancelWorkOrderPayload,
	actorUserId: string,
) => {
	const workOrder = await prisma.workOrder.findFirst({
		where: { id: workOrderId, isDeleted: false },
		include: {
			serviceRequest: {
				select: {
					id: true,
					status: true,
					customerId: true,
					serviceNameSnapshot: true,
					isDeleted: true,
				},
			},
			assignment: {
				include: {
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
			},
		},
	});

	if (!workOrder || workOrder.serviceRequest.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Work order not found");
	}

	assertTransition(
		workOrderMachine,
		workOrder.status,
		WorkOrderStatus.CANCELLED,
	);

	assertTransition(
		serviceRequestMachine,
		workOrder.serviceRequest.status,
		ServiceRequestStatus.CANCELLED,
	);

	if (
		workOrder.assignment &&
		workOrder.assignment.status !== AssignmentStatus.CANCELLED
	) {
		assertTransition(
			assignmentMachine,
			workOrder.assignment.status,
			AssignmentStatus.CANCELLED,
		);
	}

	if (
		workOrder.assignment?.appointment &&
		workOrder.assignment.appointment.status !== AppointmentStatus.CANCELLED
	) {
		assertTransition(
			appointmentMachine,
			workOrder.assignment.appointment.status,
			AppointmentStatus.CANCELLED,
		);
	}

	return prisma.$transaction(async (tx) => {
		const updatedWorkOrder = await tx.workOrder.update({
			where: { id: workOrder.id },
			data: { status: WorkOrderStatus.CANCELLED },
		});

		await tx.serviceRequest.update({
			where: { id: workOrder.serviceRequestId },
			data: { status: ServiceRequestStatus.CANCELLED },
		});

		if (
			workOrder.assignment &&
			workOrder.assignment.status !== AssignmentStatus.CANCELLED
		) {
			await tx.assignment.update({
				where: { id: workOrder.assignment.id },
				data: { status: AssignmentStatus.CANCELLED },
			});
		}

		if (
			workOrder.assignment?.appointment &&
			workOrder.assignment.appointment.status !== AppointmentStatus.CANCELLED
		) {
			await tx.appointment.update({
				where: { id: workOrder.assignment.appointment.id },
				data: { status: AppointmentStatus.CANCELLED },
			});
		}

		await createAuditLog(tx, {
			userId: actorUserId,
			action: AuditAction.WORK_ORDER_CANCELLED,
			entityType: "WorkOrder",
			entityId: workOrder.id,
			metadata: { reason: payload.reason },
		});

		// Notify customer
		await createNotification(tx, {
			userId: workOrder.serviceRequest.customerId,
			category: NotificationCategory.ASSIGNMENT,
			title: "Work order cancelled",
			message: `Work order for "${workOrder.serviceRequest.serviceNameSnapshot}" has been cancelled. Reason: ${payload.reason}.`,
		});

		// Notify technician if assigned
		if (workOrder.assignment?.technician?.user?.id) {
			await createNotification(tx, {
				userId: workOrder.assignment.technician.user.id,
				category: NotificationCategory.ASSIGNMENT,
				title: "Work order cancelled",
				message: `Work order for "${workOrder.serviceRequest.serviceNameSnapshot}" has been cancelled. Reason: ${payload.reason}.`,
			});
		}

		return updatedWorkOrder;
	});
};

const getWorkOrders = async (query: IWorkOrderListQuery) => {
	const { page, limit, skip } = getPagination(query);

	const andConditions: WorkOrderWhereInput[] = [{ isDeleted: false }];

	if (query.status) {
		andConditions.push({ status: query.status });
	}

	if (query.searchTerm) {
		const searchTerm = query.searchTerm;
		andConditions.push({
			serviceRequest: {
				isDeleted: false,
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
			},
		});
	}

	const where: WorkOrderWhereInput = { AND: andConditions };

	const [data, total] = await Promise.all([
		prisma.workOrder.findMany({
			where,
			take: limit,
			skip,
			orderBy: {
				[query.sortBy]: query.sortOrder,
			} as WorkOrderOrderByWithRelationInput,
			include: {
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
				assignment: {
					include: {
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
						appointment: true,
					},
				},
			},
		}),
		prisma.workOrder.count({ where }),
	]);

	return {
		data,
		meta: buildPaginationMeta(page, limit, total),
	};
};

const getWorkOrderById = async (id: string, actor: IRequestActor) => {
	const workOrder = await prisma.workOrder.findFirst({
		where: { id, isDeleted: false },
		include: {
			serviceRequest: {
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
						select: {
							id: true,
							name: true,
							requiredSkill: true,
							basePriceAmount: true,
							estimatedDurationMinutes: true,
						},
					},
				},
			},
			assignment: {
				include: {
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
					appointment: true,
				},
			},
			estimates: {
				where: { isDeleted: false },
				include: { items: { where: { isDeleted: false } } },
			},
			invoice: {
				include: { items: true },
			},
			feedback: {
				where: { isDeleted: false },
			},
		},
	});

	if (!workOrder) {
		throw new AppError(httpStatus.NOT_FOUND, "Work order not found");
	}

	if (actor.role === Role.CUSTOMER) {
		if (workOrder.serviceRequest.customerId !== actor.userId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You don't have permission to view this work order",
			);
		}
	} else if (actor.role === Role.TECHNICIAN) {
		if (workOrder.assignment?.technician.userId !== actor.userId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You don't have permission to view this work order",
			);
		}
	}

	return workOrder;
};

export const WorkOrderServices = {
	assignTechnician,
	cancelWorkOrder,
	getWorkOrders,
	getWorkOrderById,
};
