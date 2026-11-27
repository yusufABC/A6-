import httpStatus from "http-status";
import {
	AppointmentStatus,
	AssignmentStatus,
	NotificationCategory,
	UserStatus,
	WorkOrderStatus,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { AuditAction, createAuditLog } from "../../utils/auditLog";
import { createNotification } from "../../utils/notification";
import {
	assertTransition,
	workOrderMachine,
} from "../../utils/statusMachine";
import type { IAssignTechnicianPayload } from "./work-order.interface";

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

export const WorkOrderServices = {
	assignTechnician,
};
