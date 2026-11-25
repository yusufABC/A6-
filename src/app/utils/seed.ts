import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import { Role, UserStatus } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";
import { AppError } from "./AppError";

const getSeedCredentials = (
	name: string | undefined,
	email: string | undefined,
	password: string | undefined,
	label: string,
) => {
	if (!name || !email || !password) {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			`${label} Name , Email, Password Missing In Env File!!!`,
		);
	}

	return {
		name: name.trim(),
		email: email.trim().toLowerCase(),
		password,
	};
};

const hashPassword = (password: string) =>
	bcrypt.hash(password, Number(config.bcrypt_salt_rounds));

const findSeedUser = async (email: string | undefined) => {
	if (!email) {
		return null;
	}

	return prisma.user.findUnique({
		where: {
			email: email.trim().toLowerCase(),
		},
	});
};

export const AdminSeed = async () => {
	const existingAdmin = await findSeedUser(config.admin_email);

	if (existingAdmin) {
		console.log("Admin Already Exists!");
		return;
	}

	const { name, email, password } = getSeedCredentials(
		config.admin_name,
		config.admin_email,
		config.admin_password,
		"Admin",
	);

	const admin = await prisma.user.create({
		data: {
			name,
			email,
			password: await hashPassword(password),
			role: Role.ADMIN,
			status: UserStatus.ACTIVE,
			emailVerified: true,
			needPasswordChange: false,
		},
		omit: {
			password: true,
		},
	});

	console.log("Admin Created : ", admin.email);
};

export const ManagerSeed = async () => {
	const existingManager = await findSeedUser(config.manager_email);

	if (existingManager) {
		console.log("Manager Already Exists!");
		return;
	}

	const { name, email, password } = getSeedCredentials(
		config.manager_name,
		config.manager_email,
		config.manager_password,
		"Manager",
	);

	const manager = await prisma.user.create({
		data: {
			name,
			email,
			password: await hashPassword(password),
			role: Role.MANAGER,
			status: UserStatus.ACTIVE,
			emailVerified: true,
			needPasswordChange: false,
		},
		omit: {
			password: true,
		},
	});

	console.log("Manager Created : ", manager.email);
};

export const TechnicianSeed = async () => {
	const existingTechnician = await findSeedUser(config.technician_email);

	if (existingTechnician) {
		console.log("Technician Already Exists!");
		return;
	}

	const { name, email, password } = getSeedCredentials(
		config.technician_name,
		config.technician_email,
		config.technician_password,
		"Technician",
	);

	const technician = await prisma.user.create({
		data: {
			name,
			email,
			password: await hashPassword(password),
			role: Role.TECHNICIAN,
			status: UserStatus.ACTIVE,
			emailVerified: true,
			needPasswordChange: false,
			technician: {
				create: {
					professionalTitle: "Senior Field Technician",
					yearsOfExperience: 5,
					bio: "Experienced field service technician for AC repair and plumbing work.",
					skills: ["AC Repair", "Plumbing"],
					serviceAreas: ["Dhaka", "Mirpur"],
					workingDays: ["Saturday", "Sunday", "Monday"],
					preferredHours: "09:00-18:00",
				},
			},
		},
		omit: {
			password: true,
		},
		include: {
			technician: true,
		},
	});

	console.log("Technician Created : ", technician.email);
};

export const CustomerSeed = async () => {
	const existingCustomer = await findSeedUser(config.customer_email);

	if (existingCustomer) {
		console.log("Customer Already Exists!");
		return;
	}

	const { name, email, password } = getSeedCredentials(
		config.customer_name,
		config.customer_email,
		config.customer_password,
		"Customer",
	);

	const customer = await prisma.user.create({
		data: {
			name,
			email,
			password: await hashPassword(password),
			role: Role.CUSTOMER,
			status: UserStatus.ACTIVE,
			emailVerified: true,
			needPasswordChange: false,
			phone: "+8801700000000",
			addressLine: "House 12, Road 5, Dhanmondi",
			city: "Dhaka",
			district: "Dhaka",
			postalCode: "1209",
		},
		omit: {
			password: true,
		},
	});

	console.log("Customer Created : ", customer.email);
};
