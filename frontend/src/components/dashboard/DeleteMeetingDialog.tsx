"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import type { Meeting } from "@/lib/types";

interface DeleteMeetingDialogProps {
  meeting: Meeting | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteMeetingDialog({ meeting, onClose, onDeleted }: DeleteMeetingDialogProps) {
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!meeting) return;
    setDeleting(true);
    try {
      await api.deleteMeeting(meeting.meeting_code);
      toast.success("Meeting deleted");
      onDeleted();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={meeting !== null} onClose={onClose} title="Delete meeting?" className="max-w-sm">
      <p className="text-sm leading-6 text-ink-muted">
        <span className="font-semibold text-ink">{meeting?.title}</span> will be removed and its invite link will
        stop working. This can&apos;t be undone.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" loading={deleting} onClick={handleDelete}>
          Delete
        </Button>
      </div>
    </Dialog>
  );
}
