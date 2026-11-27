import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";
import httpStatus from "http-status";
import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AssignmentRoutes } from "./app/module/assignment/assignment.route";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { ServiceRequestRoutes } from "./app/module/service-request/service-request.route";
import { ServiceRoutes } from "./app/module/service/service.route";
import { TechnicianApplicationRoutes } from "./app/module/technician-application/technician-application.route";
import { TechnicianRoutes } from "./app/module/technician/technician.route";
import { UserRoutes } from "./app/module/user/user.route";
import { WorkOrderRoutes } from "./app/module/work-order/work-order.route";

const app: Application = express();

app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/users", UserRoutes);
app.use("/api/v1/services", ServiceRoutes);
app.use("/api/v1/service-requests", ServiceRequestRoutes);
app.use("/api/v1/technician-applications", TechnicianApplicationRoutes);
app.use("/api/v1/technicians", TechnicianRoutes);
app.use("/api/v1/work-orders", WorkOrderRoutes);
app.use("/api/v1/assignments", AssignmentRoutes);

// Basic route
app.get("/", async (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to PH Healthcare System Backend",
	});
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
