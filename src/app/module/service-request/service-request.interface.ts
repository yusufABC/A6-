import type {
	Role,
	ServiceRequestStatus,
} from "../../../generated/prisma/enums";

export interface ICreateServiceRequestPayload {
	serviceId: string;
	description: string;
	preferredDateTime?: Date;
}

export interface IAttachment {
	[key: string]: string;
	url: string;
	publicId: string;
}

export interface IRequestActor {
	userId: string;
	role: Role;
}

export type ServiceRequestSortField =
	| "status"
	| "serviceNameSnapshot"
	| "basePriceSnapshot"
	| "preferredDateTime"
	| "createdAt"
	| "updatedAt";

export interface IServiceRequestListQuery {
	page: number;
	limit: number;
	searchTerm?: string;
	status?: ServiceRequestStatus;
	sortBy: ServiceRequestSortField;
	sortOrder: "asc" | "desc";
}

export interface ICancelServiceRequestPayload {
	reason?: string;
}
