import type { Role, UserStatus } from "../../../generated/prisma/enums";

export interface IUpdateProfilePayload {
	name?: string;
	phone?: string;
}

export interface IUpdateAddressPayload {
	addressLine?: string;
	city?: string;
	district?: string;
	postalCode?: string;
}

export type UserSortField =
	| "name"
	| "email"
	| "role"
	| "status"
	| "createdAt"
	| "updatedAt";

export interface IUserListQuery {
	page: number;
	limit: number;
	searchTerm?: string;
	role?: Role;
	status?: UserStatus;
	sortBy: UserSortField;
	sortOrder: "asc" | "desc";
}

export interface IUpdateUserRolePayload {
	role: Role;
}
