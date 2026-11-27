import { AppError } from "./app/utils/AppError";
import { AuditAction, createAuditLog } from "./app/utils/auditLog";
import {
	assertTransition,
	assignmentMachine,
	estimateMachine,
	serviceRequestMachine,
	workOrderMachine,
} from "./app/utils/statusMachine";
import { createNotification } from "./app/utils/notification";
import { prisma } from "./app/lib/prisma";

let passed = 0;
let failed = 0;

const shouldPass = (name: string, fn: () => void) => {
	try {
		fn();
		passed++;
		console.log("PASS", name);
	} catch (e) {
		failed++;
		console.log("FAIL (should be allowed)", name, e);
	}
};

const shouldThrow = (name: string, fn: () => void) => {
	try {
		fn();
		failed++;
		console.log("FAIL (should be blocked)", name);
	} catch (e) {
		if (e instanceof AppError) {
			passed++;
			console.log("PASS", name);
		} else {
			failed++;
			console.log("FAIL (wrong error type)", name, e);
		}
	}
};

const main = async () => {
	// ---- 1. Status machines (no database needed) ----
	shouldPass("request PENDING_REVIEW -> APPROVED", () =>
		assertTransition(serviceRequestMachine, "PENDING_REVIEW", "APPROVED"));
	shouldThrow("request PENDING_REVIEW -> COMPLETED", () =>
		assertTransition(serviceRequestMachine, "PENDING_REVIEW", "COMPLETED"));
	shouldThrow("request DECLINED is terminal", () =>
		assertTransition(serviceRequestMachine, "DECLINED", "APPROVED"));

	shouldPass("WO AWAITING_ASSIGNMENT -> ASSIGNED", () =>
		assertTransition(workOrderMachine, "AWAITING_ASSIGNMENT", "ASSIGNED"));
	shouldThrow("WO IN_PROGRESS -> COMPLETED (must go via WORK_COMPLETED)", () =>
		assertTransition(workOrderMachine, "IN_PROGRESS", "COMPLETED"));
	shouldPass("WO WORK_COMPLETED -> COMPLETED", () =>
		assertTransition(workOrderMachine, "WORK_COMPLETED", "COMPLETED"));
	shouldThrow("WO COMPLETED is terminal", () =>
		assertTransition(workOrderMachine, "COMPLETED", "CANCELLED"));

	// the 3 additions
	shouldPass("WO AWAITING_ESTIMATE_APPROVAL -> IN_PROGRESS (addition 1)", () =>
		assertTransition(workOrderMachine, "AWAITING_ESTIMATE_APPROVAL", "IN_PROGRESS"));
	shouldPass("Assignment REJECTED -> PENDING (addition 2)", () =>
		assertTransition(assignmentMachine, "REJECTED", "PENDING"));
	shouldThrow("Assignment CANCELLED is terminal", () =>
		assertTransition(assignmentMachine, "CANCELLED", "PENDING"));
	shouldPass("Estimate SENT -> SUPERSEDED (addition 3)", () =>
		assertTransition(estimateMachine, "SENT", "SUPERSEDED"));
	shouldPass("Estimate EXPIRED -> SUPERSEDED (addition 3)", () =>
		assertTransition(estimateMachine, "EXPIRED", "SUPERSEDED"));

	// error message check
	try {
		assertTransition(workOrderMachine, "COMPLETED", "ASSIGNED");
	} catch (e) {
		const err = e as AppError;
		console.log(
			err.statusCode === 400 && err.message === "Invalid status transition"
				? "PASS error is 400 + correct message"
				: `FAIL error shape: ${err.statusCode} ${err.message}`,
		);
	}

	// ---- 2. Audit log + notification (needs a real user in the DB) ----
	const user = await prisma.user.findFirst();
	if (!user) {
		console.log("No user in DB. Seed one first, then rerun this part.");
	} else {
		await prisma.$transaction(async (tx) => {
			await createAuditLog(tx, {
				userId: user.id,
				action: AuditAction.RECORD_DELETED,
				entityType: "Test",
				entityId: "test-1",
				metadata: { reason: "helper test" },
			});
			await createNotification(tx, {
				userId: user.id,
				category: "ASSIGNMENT",
				title: "Test",
				message: "Helper test notification",
			});
		});
		const a = await prisma.auditLog.findFirst({ where: { entityId: "test-1" } });
		const n = await prisma.notification.findFirst({ where: { message: "Helper test notification" } });
		console.log(a && n ? "PASS rows were created" : "FAIL rows missing");

		// rollback proof: row must NOT exist after the transaction throws
		try {
			await prisma.$transaction(async (tx) => {
				await createAuditLog(tx, {
					userId: user.id,
					action: AuditAction.RECORD_DELETED,
					entityType: "Test",
					entityId: "rollback-1",
				});
				throw new Error("force rollback");
			});
		} catch {}
		const r = await prisma.auditLog.findFirst({ where: { entityId: "rollback-1" } });
		console.log(!r ? "PASS rollback works (audit row not saved)" : "FAIL row survived rollback");

		// cleanup
		await prisma.auditLog.deleteMany({ where: { entityId: "test-1" } });
		await prisma.notification.deleteMany({ where: { message: "Helper test notification" } });
	}

	console.log(`\nDone. Passed: ${passed}, Failed: ${failed}`);
	await prisma.$disconnect();
};

main();