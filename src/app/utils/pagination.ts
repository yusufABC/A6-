export type TPaginationInput = {
	page?: number;
	limit?: number;
};

export const getPagination = ({ page = 1, limit = 10 }: TPaginationInput) => {
	const safePage = page > 0 ? page : 1;
	const safeLimit = limit > 0 ? limit : 10;

	return {
		page: safePage,
		limit: safeLimit,
		skip: (safePage - 1) * safeLimit,
	};
};

export const buildPaginationMeta = (
	page: number,
	limit: number,
	total: number,
) => ({
	page,
	limit,
	total,
	totalPages: Math.ceil(total / limit),
});
