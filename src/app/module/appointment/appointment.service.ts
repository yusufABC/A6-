import httpStatus from "http-status";
import {
	AppointmentStatus,
	NotificationCategory,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { AuditAction, createAuditLog } from "../../utils/auditLog";
import { createNotification } from "../../utils/notification";
import {
	appointmentMachine,
	assertTransition,
} from "../../utils/statusMachine";
import type { IRescheduleAppointmentPayload } from "./appointment.interface";

const rescheduleAppointment = async (
	id: string,
	payload: IRescheduleAppointmentPayload,
	actorUserId: string,
) => {
	const appointment = await prisma.appointment.findFirst({
		where: { id, isDeleted: false },
		include: {
			assignment: {
				include: {
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
				},
			},
		},
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
	}

	if (appointment.status === AppointmentStatus.CANCELLED) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot reschedule a cancelled appointment",
		);
	}

	const technicianId = appointment.assignment.technicianId;
	const oldStartTime = appointment.startTime;
	const oldEndTime = appointment.endTime;

	return prisma.$transaction(
		async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242, hashtext(${technicianId}::text))`;

			const conflicts = await tx.$queryRaw<Array<{ id: string }>>`
				SELECT a.id
				FROM appointments a
				JOIN assignments asg ON a."assignmentId" = asg.id
				WHERE asg."technicianId" = ${technicianId}
					AND a.id <> ${appointment.id}
					AND a.status <> 'CANCELLED'
					AND a."isDeleted" = false
					AND a."startTime" < ${payload.endTime}
					AND a."endTime" > ${payload.startTime}
				LIMIT 1
			`;

			if (conflicts.length > 0) {
				throw new AppError(
					httpStatus.CONFLICT,
					"Technician has a conflicting appointment",
				);
			}

			const updatedAppointment = await tx.appointment.update({
				where: { id: appointment.id },
				data: {
					startTime: payload.startTime,
					endTime: payload.endTime,
				},
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
										},
									},
								},
							},
						},
					},
				},
			});

			await createAuditLog(tx, {
				userId: actorUserId,
				action: AuditAction.APPOINTMENT_RESCHEDULED,
				entityType: "Appointment",
				entityId: appointment.id,
				metadata: {
					oldStartTime: oldStartTime.toISOString(),
					oldEndTime: oldEndTime.toISOString(),
					newStartTime: payload.startTime.toISOString(),
					newEndTime: payload.endTime.toISOString(),
				},
			});

			// Notify technician
			await createNotification(tx, {
				userId: appointment.assignment.technician.user.id,
				category: NotificationCategory.ASSIGNMENT,
				title: "Appointment rescheduled",
				message: `Your appointment for "${appointment.assignment.workOrder.serviceRequest.serviceNameSnapshot}" has been rescheduled to ${payload.startTime.toISOString()} - ${payload.endTime.toISOString()}.`,
			});

			// Notify customer
			await createNotification(tx, {
				userId: appointment.assignment.workOrder.serviceRequest.customerId,
				category: NotificationCategory.ASSIGNMENT,
				title: "Appointment rescheduled",
				message: `Your appointment for "${appointment.assignment.workOrder.serviceRequest.serviceNameSnapshot}" has been rescheduled to ${payload.startTime.toISOString()} - ${payload.endTime.toISOString()}.`,
			});

			return updatedAppointment;
		},
		{ maxWait: 10000, timeout: 30000 },
	);
};

const cancelAppointment = async (id: string, actorUserId: string) => {
	const appointment = await prisma.appointment.findFirst({
		where: { id, isDeleted: false },
		include: {
			assignment: {
				include: {
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
				},
			},
		},
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
	}

	assertTransition(
		appointmentMachine,
		appointment.status,
		AppointmentStatus.CANCELLED,
	);

	return prisma.$transaction(
		async (tx) => {
			const updatedAppointment = await tx.appointment.update({
				where: { id: appointment.id },
				data: {
					status: AppointmentStatus.CANCELLED,
				},
			});

			await createAuditLog(tx, {
				userId: actorUserId,
				action: AuditAction.APPOINTMENT_CANCELLED,
				entityType: "Appointment",
				entityId: appointment.id,
			});

			// Notify technician
			await createNotification(tx, {
				userId: appointment.assignment.technician.user.id,
				category: NotificationCategory.ASSIGNMENT,
				title: "Appointment cancelled",
				message: `The appointment for "${appointment.assignment.workOrder.serviceRequest.serviceNameSnapshot}" has been cancelled.`,
			});

			return updatedAppointment;
		},
		{ maxWait: 10000, timeout: 30000 },
	);
};

export const AppointmentServices = {
	rescheduleAppointment,
	cancelAppointment,
};
