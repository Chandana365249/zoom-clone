"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, TextInput } from "@/components/ui/Field";
import { ApiError, api, errorMessage } from "@/lib/api";
import { meetingRoomPath, parseMeetingInput } from "@/lib/meeting";

interface JoinMeetingDialogProps {
  open: boolean;
  onClose: () => void;
  defaultName: string;
}

export function JoinMeetingDialog({ open, onClose, defaultName }: JoinMeetingDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Join meeting" className="max-w-md">
      {/* Mounted only while open, so the form starts fresh every time. */}
      <JoinMeetingForm defaultName={defaultName} onCancel={onClose} />
    </Dialog>
  );
}

function JoinMeetingForm({ defaultName, onCancel }: { defaultName: string; onCancel: () => void }) {
  const router = useRouter();
  const [meetingInput, setMeetingInput] = useState("");
  const [name, setName] = useState(defaultName);
  const [errors, setErrors] = useState<{ meeting?: string; name?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const code = parseMeetingInput(meetingInput);
    const displayName = name.trim();
    const nextErrors = {
      meeting: !meetingInput.trim()
        ? "Enter a meeting ID or invite link."
        : !code
          ? "Meeting IDs are 9–11 digits, or paste the full invite link."
          : undefined,
      name: !displayName ? "Enter the name others will see." : undefined,
    };
    setErrors(nextErrors);
    if (!code || nextErrors.name) return;

    setSubmitting(true);
    try {
      const meeting = await api.getMeeting(code);
      if (meeting.status === "ended") {
        setErrors({ meeting: "This meeting has ended." });
        setSubmitting(false);
        return;
      }
      router.push(meetingRoomPath(code, { name: displayName }));
      // Keep the spinner while the meeting page loads.
    } catch (error) {
      setErrors(
        error instanceof ApiError && error.status === 404
          ? { meeting: error.message }
          : { form: errorMessage(error) },
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field id="join-meeting-id" label="Meeting ID or invite link" error={errors.meeting}>
        <TextInput
          id="join-meeting-id"
          autoFocus
          autoComplete="off"
          inputMode="text"
          placeholder="e.g. 852 1234 5678"
          value={meetingInput}
          invalid={Boolean(errors.meeting)}
          onChange={(event) => {
            setMeetingInput(event.target.value);
            setErrors((current) => ({ ...current, meeting: undefined, form: undefined }));
          }}
        />
      </Field>
      <Field id="join-name" label="Your name" error={errors.name}>
        <TextInput
          id="join-name"
          autoComplete="name"
          maxLength={50}
          value={name}
          invalid={Boolean(errors.name)}
          onChange={(event) => {
            setName(event.target.value);
            setErrors((current) => ({ ...current, name: undefined }));
          }}
        />
      </Field>

      {errors.form && (
        <p role="alert" className="rounded-lg bg-danger/8 px-3 py-2 text-sm font-medium text-danger">
          {errors.form}
        </p>
      )}

      <p className="text-[13px] leading-5 text-ink-muted">
        You&apos;ll be able to check your camera and microphone before entering the meeting.
      </p>

      <div className="mt-1 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting} disabled={!meetingInput.trim()}>
          Join
        </Button>
      </div>
    </form>
  );
}
