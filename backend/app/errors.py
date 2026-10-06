"""Domain errors raised by the service layer.

Services never import FastAPI; main.py translates these into JSON responses with
a consistent shape: {"detail": "<human message>", "code": "<machine code>"}.
"""


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class MeetingEndedError(AppError):
    status_code = 410
    code = "meeting_ended"
