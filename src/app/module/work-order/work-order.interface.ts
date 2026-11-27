import type { Role, WorkOrderStatus } from "../../../generated/prisma/enums";

export interface IAssignTechnicianPayload {
	technicianId: string;
	startTime: Date;
	endTime?: Date;
}

export interface ICancelWorkOrderPayload {
	reason: string;
}

export interface IRequestActor {
	userId: string;
	role: Role;
}

export type WorkOrderSortField = "status" | "createdAt" | "updatedAt";

export interface IWorkOrderListQuery {
	page: number;
	limit: number;
	status?: WorkOrderStatus;
	searchTerm?: string;
	sortBy: WorkOrderSortField;
	sortOrder: "asc" | "desc";
}
