import type {
	AppointmentStatus,
	AssignmentStatus,
	EstimateStatus,
	PaymentStatus,
	ServiceRequestStatus,
	WorkOrderStatus,
} from "../../generated/prisma/enums";
import { AppError } from "./AppError";

export type StatusMachine<S extends string> = Record<S, S[]>;

export const serviceRequestMachine: StatusMachine<ServiceRequestStatus> = {
	PENDING_REVIEW: ["APPROVED", "DECLINED", "CANCELLED"],
	APPROVED: ["COMPLETED", "CLOSED_NO_WORK", "CANCELLED"],
	DECLINED: [],
	COMPLETED: [],
	CLOSED_NO_WORK: [],
	CANCELLED: [],
};

export const workOrderMachine: StatusMachine<WorkOrderStatus> = {
	AWAITING_ASSIGNMENT: ["ASSIGNED", "CANCELLED"],
	ASSIGNED: ["SCHEDULED", "AWAITING_ASSIGNMENT", "CANCELLED"],
	SCHEDULED: ["ARRIVED", "AWAITING_ASSIGNMENT", "CANCELLED"],
	ARRIVED: ["AWAITING_ESTIMATE_APPROVAL", "CANCELLED"],
	AWAITING_ESTIMATE_APPROVAL: [
		"ESTIMATE_APPROVED",
		"IN_PROGRESS",
		"CLOSED_NO_WORK",
		"CANCELLED",
	],
	ESTIMATE_APPROVED: ["IN_PROGRESS", "CLOSED_NO_WORK", "CANCELLED"],
	IN_PROGRESS: ["AWAITING_ESTIMATE_APPROVAL", "WORK_COMPLETED", "CANCELLED"],
	WORK_COMPLETED: ["COMPLETED"],
	COMPLETED: [],
	CLOSED_NO_WORK: [],
	CANCELLED: [],
};

export const assignmentMachine: StatusMachine<AssignmentStatus> = {
	PENDING: ["ACCEPTED", "REJECTED", "CANCELLED"],
	ACCEPTED: ["CANCELLED"],
	REJECTED: ["PENDING"],
	CANCELLED: [],
};

export const estimateMachine: StatusMachine<EstimateStatus> = {
	SENT: ["REVISION_REQUESTED", "APPROVED", "REJECTED", "EXPIRED", "SUPERSEDED"],
	REVISION_REQUESTED: ["SUPERSEDED"],
	SUPERSEDED: [],
	APPROVED: ["SUPERSEDED"],
	REJECTED: [],
	EXPIRED: ["SUPERSEDED"],
};

export const paymentMachine: StatusMachine<PaymentStatus> = {
	UNPAID: ["PAID", "FAILED", "CANCELLED"],
	PAID: [],
	FAILED: [],
	CANCELLED: [],
};

export const appointmentMachine: StatusMachine<AppointmentStatus> = {
	SCHEDULED: ["CANCELLED"],
	CANCELLED: [],
};

export const statusMachines = {
	serviceRequest: serviceRequestMachine,
	workOrder: workOrderMachine,
	assignment: assignmentMachine,
	estimate: estimateMachine,
	payment: paymentMachine,
	appointment: appointmentMachine,
} as const;

export const assertTransition = <S extends string>(
	machine: StatusMachine<S>,
	from: S,
	to: S,
): void => {
	const allowedTransitions = machine[from];

	if (!allowedTransitions?.includes(to)) {
		throw new AppError(400, "Invalid status transition");
	}
};
