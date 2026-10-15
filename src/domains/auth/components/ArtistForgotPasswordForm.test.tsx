// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArtistForgotPasswordForm } from "./ArtistForgotPasswordForm";
import type { ArtistForgotPasswordFormProps } from "../types";

const EMAIL = "artist@example.com";

function renderForm(props: Partial<ArtistForgotPasswordFormProps> = {}): ArtistForgotPasswordFormProps {
  const merged: ArtistForgotPasswordFormProps = {
    step: "email",
    email: "",
    onEmailChange: vi.fn(),
    onSubmit: vi.fn((event) => event.preventDefault()),
    onChangeEmail: vi.fn(),
    ...props,
  };
  render(<ArtistForgotPasswordForm {...merged} />);
  return merged;
}

describe("ArtistForgotPasswordForm", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the email field and submit button and none of the sent copy", () => {
    renderForm();

    expect(screen.getByRole("textbox", { name: "Email" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Send reset link" })).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the current email value and reports edits", () => {
    const props = renderForm({ email: EMAIL });
    const input = screen.getByRole("textbox", { name: "Email" }) as HTMLInputElement;

    expect(input.value).toBe(EMAIL);

    fireEvent.change(input, { target: { value: "other@example.com" } });
    expect(props.onEmailChange).toHaveBeenCalledWith("other@example.com");
  });

  it("calls onSubmit once when the form is submitted", () => {
    const props = renderForm({ email: EMAIL });

    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("disables the button and changes its label while pending", () => {
    renderForm({ isPending: true });

    const button = screen.getByRole("button", { name: "Sending link…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Send reset link" })).toBeNull();
  });

  it("leaves the button enabled when not pending", () => {
    renderForm();

    const button = screen.getByRole("button", { name: "Send reset link" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("announces an error and marks the input invalid", () => {
    renderForm({ error: "Enter a valid email address." });

    expect(screen.getByRole("alert").textContent).toBe("Enter a valid email address.");
    expect(screen.getByRole("textbox", { name: "Email" }).getAttribute("aria-invalid")).toBe("true");
  });

  it("shows no alert and a valid input when there is no error", () => {
    renderForm();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Email" }).getAttribute("aria-invalid")).toBe("false");
  });

  it("shows the generic confirmation with the email and the expiry", () => {
    renderForm({ step: "sent", email: EMAIL });

    const status = screen.getByRole("status");
    expect(status.textContent).toBe(
      `If ${EMAIL} belongs to an artist account, we've sent it a reset link. It expires in 1 hour; use the newest one.`
    );
  });

  it("has no email field and no submit button", () => {
    renderForm({ step: "sent", email: EMAIL });

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send reset link" })).toBeNull();
  });

  it("returns to the email step through Use a different email", () => {
    const props = renderForm({ step: "sent", email: EMAIL });

    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));

    expect(props.onChangeEmail).toHaveBeenCalledTimes(1);
  });
});
