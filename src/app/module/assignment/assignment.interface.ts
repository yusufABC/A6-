import type { AssignmentStatus, Role } from "../../../generated/prisma/enums";

export interface IRequestActor {
	userId: string;
	role: Role;
}

export type AssignmentSortField = "status" | "createdAt" | "updatedAt";

export interface IAssignmentListQuery {
	page: number;
	limit: number;
	status?: AssignmentStatus;
	sortBy: AssignmentSortField;
	sortOrder: "asc" | "desc";
}

export interface IRejectAssignmentPayload {
	rejectionReason: string;
}

export interface IReassignPayload {
	technicianId: string;
	startTime?: Date;
	endTime?: Date;
}
