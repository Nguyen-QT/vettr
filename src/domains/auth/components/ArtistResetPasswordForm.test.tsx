// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArtistResetPasswordForm } from "./ArtistResetPasswordForm";
import {
  ARTIST_FORGOT_PASSWORD_PATH,
  INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE,
  MIN_ARTIST_PASSWORD_LENGTH,
} from "../constants";
import type { ArtistResetPasswordFormProps } from "../types";

function renderForm(props: Partial<ArtistResetPasswordFormProps> = {}): ArtistResetPasswordFormProps {
  const merged: ArtistResetPasswordFormProps = {
    step: "form",
    newPassword: "",
    confirmPassword: "",
    onFieldChange: vi.fn(),
    onSubmit: vi.fn((event) => event.preventDefault()),
    ...props,
  };
  render(<ArtistResetPasswordForm {...merged} />);
  return merged;
}

function getNewPassword(): HTMLInputElement {
  return screen.getByLabelText("New password") as HTMLInputElement;
}

function getConfirmPassword(): HTMLInputElement {
  return screen.getByLabelText("Confirm new password") as HTMLInputElement;
}

describe("ArtistResetPasswordForm", () => {
  afterEach(() => {
    cleanup();
  });

  describe("form step", () => {
    it("renders both password fields and the submit button and none of the invalid-link copy", () => {
      renderForm();

      expect(getNewPassword().type).toBe("password");
      expect(getConfirmPassword().type).toBe("password");
      expect(screen.getByRole("button", { name: "Set new password" })).not.toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("link")).toBeNull();
    });

    it("asks the browser for new-password autofill on both fields", () => {
      renderForm();

      expect(getNewPassword().getAttribute("autocomplete")).toBe("new-password");
      expect(getConfirmPassword().getAttribute("autocomplete")).toBe("new-password");
    });

    it("describes the new-password field with the minimum length", () => {
      renderForm();

      expect(
        screen.getByText(`At least ${MIN_ARTIST_PASSWORD_LENGTH} characters.`).id
      ).toBe(getNewPassword().getAttribute("aria-describedby"));
    });

    it("shows the current values and reports edits with the field name", () => {
      const props = renderForm({ newPassword: "first-value", confirmPassword: "second-value" });

      expect(getNewPassword().value).toBe("first-value");
      expect(getConfirmPassword().value).toBe("second-value");

      fireEvent.change(getNewPassword(), { target: { value: "changed-new" } });
      expect(props.onFieldChange).toHaveBeenLastCalledWith("newPassword", "changed-new");

      fireEvent.change(getConfirmPassword(), { target: { value: "changed-confirm" } });
      expect(props.onFieldChange).toHaveBeenLastCalledWith("confirmPassword", "changed-confirm");
    });

    it("calls onSubmit once when the form is submitted", () => {
      const props = renderForm();

      fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

      expect(props.onSubmit).toHaveBeenCalledTimes(1);
    });

    it("disables the button and changes its label while pending", () => {
      renderForm({ isPending: true });

      const button = screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(screen.queryByRole("button", { name: "Set new password" })).toBeNull();
    });

    it("leaves the button enabled when not pending", () => {
      renderForm();

      const button = screen.getByRole("button", { name: "Set new password" }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it("marks both inputs valid and shows no alert when there are no errors", () => {
      renderForm();

      expect(getNewPassword().getAttribute("aria-invalid")).toBe("false");
      expect(getConfirmPassword().getAttribute("aria-invalid")).toBe("false");
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("announces a new-password error and marks only that input invalid", () => {
      renderForm({ errors: { newPassword: "Password must be at least 12 characters." } });

      expect(screen.getByRole("alert").textContent).toBe("Password must be at least 12 characters.");
      expect(getNewPassword().getAttribute("aria-invalid")).toBe("true");
      expect(getConfirmPassword().getAttribute("aria-invalid")).toBe("false");
    });

    it("announces a confirmation error and marks only that input invalid", () => {
      renderForm({ errors: { confirmPassword: "Passwords do not match." } });

      expect(screen.getByRole("alert").textContent).toBe("Passwords do not match.");
      expect(getConfirmPassword().getAttribute("aria-invalid")).toBe("true");
      expect(getNewPassword().getAttribute("aria-invalid")).toBe("false");
    });

    it("announces a server error and keeps the form", () => {
      renderForm({ serverError: "Something went wrong resetting your password. Please try again." });

      expect(screen.getByRole("alert").textContent).toBe(
        "Something went wrong resetting your password. Please try again."
      );
      expect(getNewPassword()).not.toBeNull();
      expect(screen.getByRole("button", { name: "Set new password" })).not.toBeNull();
      expect(getNewPassword().getAttribute("aria-invalid")).toBe("false");
    });
  });

  describe("invalid step", () => {
    it("shows the generic invalid-link copy as an alert", () => {
      renderForm({ step: "invalid" });

      expect(screen.getByRole("alert").textContent).toBe(INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE);
    });

    it("links to the forgot-password page", () => {
      renderForm({ step: "invalid" });

      const link = screen.getByRole("link", { name: "Request a new link" });
      expect(link.getAttribute("href")).toBe(ARTIST_FORGOT_PASSWORD_PATH);
    });

    it("has no password fields and no submit button", () => {
      renderForm({ step: "invalid", newPassword: "left-over", confirmPassword: "left-over" });

      expect(screen.queryByLabelText("New password")).toBeNull();
      expect(screen.queryByLabelText("Confirm new password")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
    });
  });
});
