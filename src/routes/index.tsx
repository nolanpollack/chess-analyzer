import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { registerPlayer } from "#/server/players";

export const Route = createFileRoute("/")({ component: LandingPage });

type FormValues = {
	username: string;
};

function LandingPage() {
	const navigate = useNavigate();
	const [serverError, setServerError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<FormValues>();

	async function onSubmit(values: FormValues) {
		setServerError(null);
		setIsSubmitting(true);

		try {
			const result = await registerPlayer({ data: values });

			if ("error" in result && result.error) {
				setServerError(result.error);
				return;
			}

			if ("username" in result) {
				void navigate({
					to: "/$username",
					params: { username: result.username },
				});
			}
		} catch (err) {
			console.error("[registerPlayer] failed:", err);
			setServerError("Something went wrong. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl">Chess Analyzer</CardTitle>
					<CardDescription>
						Enter your chess.com username to view and analyze your games.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={handleSubmit(onSubmit)}
						className="flex flex-col gap-4"
					>
						<div>
							<Input
								placeholder="chess.com username"
								{...register("username", {
									required: "Username is required",
									maxLength: {
										value: 50,
										message: "Username is too long",
									},
								})}
								disabled={isSubmitting}
							/>
							{errors.username && (
								<p className="mt-1 text-sm text-destructive">
									{errors.username.message}
								</p>
							)}
							{serverError && (
								<p className="mt-1 text-sm text-destructive">{serverError}</p>
							)}
						</div>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Looking up..." : "View Games"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
