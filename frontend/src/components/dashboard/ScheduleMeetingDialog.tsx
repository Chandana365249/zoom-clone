"use client";

import { CalendarDays, CircleCheck, Clock, Copy, Link2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Select, TextArea, TextInput } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { api, errorMessage } from "@/lib/api";
import { formatDuration, formatLongDate, formatMeetingCode, formatTime } from "@/lib/format";
import { buildInvitation, meetingStart } from "@/lib/meeting";
import type { Meeting } from "@/lib/types";

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240];

interface ScheduleMeetingDialogProps {
  open: boolean;
  /** When set, the dialog edits this meeting instead of creating a new one. */
  editing: Meeting | null;
  defaultTitle: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ScheduleMeetingDialog({ open, editing, defaultTitle, onClose, onSaved }: ScheduleMeetingDialogProps) {
  const [created, setCreated] = useState<Meeting | null>(null);

  function close() {
    setCreated(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={created ? "Meeting scheduled" : editing ? "Edit meeting" : "Schedule meeting"}
    >
      {created ? (
        <ScheduledSuccess meeting={created} onDone={close} />
      ) : (
        <MeetingForm
          editing={editing}
          defaultTitle={defaultTitle}
          onCancel={close}
          onSaved={(meeting) => {
            onSaved();
            if (editing) close();
            else setCreated(meeting);
          }}
        />
      )}
    </Dialog>
  );
}

// ---------- Form ----------

interface FormValues {
  title: string;
  description: string;
  date: string; // yyyy-mm-dd (local)
  time: string; // HH:mm (local)
  duration: number;
}

type FormErrors = Partial<Record<keyof FormValues | "form", string>>;

const pad = (n: number) => n.toString().padStart(2, "0");
const toDateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function nextHalfHour(): Date {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() < 30 ? 30 : 60);
  return date;
}

function initialValues(editing: Meeting | null, defaultTitle: string): FormValues {
  const start = editing ? meetingStart(editing) : nextHalfHour();
  return {
    title: editing?.title ?? defaultTitle,
    description: editing?.description ?? "",
    date: toDateValue(start),
    time: toTimeValue(start),
    duration: editing?.duration_minutes ?? 30,
  };
}

function validate(values: FormValues): { errors: FormErrors; start: Date | null } {
  const errors: FormErrors = {};
  if (!values.title.trim()) errors.title = "Add a title for your meeting.";
  if (values.description.length > 2000) errors.description = "Keep the description under 2,000 characters.";

  // "2026-10-06T14:30" without a zone is parsed as the browser's local time.
  const start = values.date && values.time ? new Date(`${values.date}T${values.time}`) : null;
  if (!values.date) errors.date = "Pick a date.";
  if (!values.time) errors.time = "Pick a time.";
  if (start && start.getTime() < Date.now()) errors.time = "Choose a time in the future.";

  return { errors, start };
}

interface MeetingFormProps {
  editing: Meeting | null;
  defaultTitle: string;
  onCancel: () => void;
  onSaved: (meeting: Meeting) => void;
}

function MeetingForm({ editing, defaultTitle, onCancel, onSaved }: MeetingFormProps) {
  const toast = useToast();
  const [values, setValues] = useState(() => initialValues(editing, defaultTitle));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const durations = DURATION_OPTIONS.includes(values.duration)
    ? DURATION_OPTIONS
    : [...DURATION_OPTIONS, values.duration].sort((a, b) => a - b);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const { errors: nextErrors, start } = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !start) return;

    const payload = {
      title: values.title.trim(),
      description: values.description.trim() || null,
      scheduled_start: start.toISOString(),
      duration_minutes: values.duration,
    };

    setSubmitting(true);
    try {
      const meeting = editing
        ? await api.updateMeeting(editing.meeting_code, payload)
        : await api.scheduleMeeting(payload);
      if (editing) toast.success("Meeting updated");
      onSaved(meeting);
    } catch (error) {
      setErrors({ form: errorMessage(error) });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field id="meeting-title" label="Topic" error={errors.title}>
        <TextInput
          id="meeting-title"
          autoFocus
          maxLength={200}
          value={values.title}
          invalid={Boolean(errors.title)}
          onChange={(event) => update("title", event.target.value)}
        />
      </Field>

      <Field id="meeting-description" label="Description (optional)" error={errors.description}>
        <TextArea
          id="meeting-description"
          rows={3}
          maxLength={2000}
          placeholder="Agenda, links or notes for attendees"
          value={values.description}
          invalid={Boolean(errors.description)}
          onChange={(event) => update("description", event.target.value)}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.3fr_1fr]">
        <Field id="meeting-date" label="Date" error={errors.date}>
          <TextInput
            id="meeting-date"
            type="date"
            min={toDateValue(new Date())}
            value={values.date}
            invalid={Boolean(errors.date)}
            onChange={(event) => update("date", event.target.value)}
          />
        </Field>
        <Field id="meeting-time" label="Time" error={errors.time}>
          <TextInput
            id="meeting-time"
            type="time"
            step={300}
            value={values.time}
            invalid={Boolean(errors.time)}
            onChange={(event) => update("time", event.target.value)}
          />
        </Field>
      </div>

      <Field id="meeting-duration" label="Duration" hint={`Time zone: ${timeZone.replace(/_/g, " ")}`}>
        <Select
          id="meeting-duration"
          value={values.duration}
          onChange={(event) => update("duration", Number(event.target.value))}
        >
          {durations.map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatDuration(minutes)}
            </option>
          ))}
        </Select>
      </Field>

      {errors.form && (
        <p role="alert" className="rounded-lg bg-danger/8 px-3 py-2 text-sm font-medium text-danger">
          {errors.form}
        </p>
      )}

      <div className="mt-1 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {editing ? "Save changes" : "Schedule"}
        </Button>
      </div>
    </form>
  );
}

// ---------- Success ----------

function ScheduledSuccess({ meeting, onDone }: { meeting: Meeting; onDone: () => void }) {
  const copy = useCopyToClipboard();
  const start = meetingStart(meeting);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-xl bg-success/8 px-4 py-3 text-sm font-medium text-[#0c7a3c]">
        <CircleCheck className="size-5 shrink-0" />
        Saved — it now appears under Upcoming meetings.
      </div>

      <div className="rounded-xl border border-line">
        <p className="border-b border-line px-4 py-3 font-semibold">{meeting.title}</p>
        <dl className="grid gap-3 px-4 py-3 text-sm">
          <DetailRow icon={<CalendarDays />} label="Date">
            {formatLongDate(start)}
          </DetailRow>
          <DetailRow icon={<Clock />} label="Time">
            {formatTime(start)} · {formatDuration(meeting.duration_minutes)}
          </DetailRow>
          <DetailRow icon={<span className="text-[11px] font-bold">ID</span>} label="Meeting ID">
            <span className="tabular-nums">{formatMeetingCode(meeting.meeting_code)}</span>
          </DetailRow>
          <DetailRow icon={<Link2 />} label="Invite link">
            <span className="break-all text-brand">{meeting.join_url}</span>
          </DetailRow>
        </dl>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => copy(buildInvitation(meeting), "Invitation copied")}>
          <Copy className="size-4" />
          Copy invitation
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center text-ink-subtle [&>svg]:size-4">{icon}</span>
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}
