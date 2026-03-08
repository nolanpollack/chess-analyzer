import { createServerFn } from "@tanstack/react-start";

export const healthcheck = createServerFn({ method: "GET" }).handler(() => ({
	status: "ok",
}));
