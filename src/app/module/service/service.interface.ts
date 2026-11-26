export type ServiceSortField =
	| "name"
	| "basePriceAmount"
	| "estimatedDurationMinutes"
	| "isActive"
	| "isDeleted"
	| "createdAt"
	| "updatedAt";

export interface ICreateServicePayload {
	name: string;
	description?: string;
	requiredSkill: string;
	basePriceAmount: string;
	estimatedDurationMinutes: number;
	isActive?: boolean;
}

export interface IUpdateServicePayload {
	name?: string;
	description?: string | null;
	requiredSkill?: string;
	basePriceAmount?: string;
	estimatedDurationMinutes?: number;
	isActive?: boolean;
}

export interface IServiceListQuery {
	page: number;
	limit: number;
	searchTerm?: string;
	sortBy: ServiceSortField;
	sortOrder: "asc" | "desc";
	isActive?: boolean;
}
