"use client";

import { useState } from "react";
import type { ZodError } from "zod";

import { becomeClientAction } from "@/domains/auth/actions";
import { becomeClientInputSchema } from "@/domains/auth/auth.schema";
import type { BecomeClientFormField, BecomeClientFormValues } from "@/domains/auth/types";

const EMPTY_VALUES: BecomeClientFormValues = {
	instagramHandle: "",
	phone: "",
	firstName: "",
	lastName: "",
	dateOfBirth: "",
};

function toSchemaInput(value: BecomeClientFormValues) {
	return {
		instagramHandle: value.instagramHandle,
		phone: value.phone.trim() === "" ? undefined : value.phone,
		firstName: value.firstName.trim() === "" ? undefined : value.firstName,
		lastName: value.lastName.trim() === "" ? undefined : value.lastName,
		dateOfBirth: value.dateOfBirth.trim() === "" ? undefined : value.dateOfBirth,
	};
}

// Searching ZodError array for every input field on every render, it would run $O(N)$ lookups. 
// By converting this array into a record keyed by field name (result["firstName"]), the form component
// can look up field errors in $O(1)$ constant time - only the highest priority error for each field is
// returned, preventing flickering of multiple error messages for the same field:
function mapZodErrors(error: ZodError): Partial<Record<BecomeClientFormField, { message: string }>> {
	const result: Partial<Record<BecomeClientFormField, { message: string }>> = {};
	for (const issue of error.issues) {
		const field = issue.path[0];
		if (typeof field === "string" && !(field in result)) {
			result[field as BecomeClientFormField] = { message: issue.message };
		}
	}
	return result;
}

export function useBecomeClient() {
	const [values, setValues] = useState<BecomeClientFormValues>(EMPTY_VALUES);
	const [errors, setErrors] = useState<Partial<Record<BecomeClientFormField, { message?: string }>>>({});
	const [serverError, setServerError] = useState<string | undefined>(undefined);
	const [isPending, setIsPending] = useState(false);
	const [isSuccess, setIsSuccess] = useState(false);
	const [clientProfileId, setClientProfileId] = useState<string | undefined>(undefined);
	// Updates the single changed field and clears only that field's stale error, without re-running validation.
	// This is cheap, avoids re-render churn from a fresh Zod pass on every keystroke, and gives immediate
	// error-dismissal feedback once the user starts fixing a field — a common, low-risk UX affordance that
	// doesn't contradict "validate on submit."
	function onFieldChange(field: BecomeClientFormField, value: string) {
		setValues((prev) => ({ ...prev, [field]: value }));
		setErrors((prev) => {
			if (!prev[field]) return prev;
			const next = { ...prev };
			delete next[field];
			return next;
		});
		setServerError(undefined);
		setIsSuccess(false);
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		if (isPending) return;
		event.preventDefault();
		setServerError(undefined);
		setClientProfileId(undefined);
		setIsSuccess(false);

		const candidate = toSchemaInput(values);
		const parsed = becomeClientInputSchema.safeParse(candidate);

		if (!parsed.success) {
			setErrors(mapZodErrors(parsed.error));
			return;
		}

		setErrors({});
		setIsPending(true);

		const result = await becomeClientAction(parsed.data);

		setIsPending(false);

		if (!result.success) {
			setServerError(result.error);
			return;
		}

		setIsSuccess(true);
		setClientProfileId(result.clientProfileId);
	}
  
	return { values, onFieldChange, errors, serverError, onSubmit, isPending, isSuccess, clientProfileId };

}