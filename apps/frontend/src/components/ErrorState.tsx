import { CircleAlert } from "lucide-react";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex min-h-[240px] items-center justify-center">
      <div className="max-w-md rounded-md border border-slate-200 bg-white p-4 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
          <CircleAlert size={20} strokeWidth={2} />
        </div>

        <h3 className="text-sm font-semibold text-slate-900">
          Đã xảy ra lỗi
        </h3>

        <p className="mt-2 text-sm text-slate-600">
          {message}
        </p>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:from-sky-700 hover:to-blue-700"
          >
            Thử lại
          </button>
        )}
      </div>
    </div>
  );
}