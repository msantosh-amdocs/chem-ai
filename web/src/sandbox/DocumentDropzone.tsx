import { useCallback, useState } from "react";
import clsx from "clsx";

const DEFAULT_ACCEPT = [".pdf", ".docx", ".txt", ".md"];

export interface DocumentDropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  accept?: string[];
  helperText?: string;
}

/**
 * Sandbox primitive: drag-and-drop / browse file picker with de-duplication.
 */
export function DocumentDropzone({
  files,
  onChange,
  disabled,
  accept = DEFAULT_ACCEPT,
  helperText,
}: DocumentDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const list = Array.from(incoming).filter((f) => {
        const lower = f.name.toLowerCase();
        return accept.some((ext) => lower.endsWith(ext));
      });
      const key = (f: File) => `${f.name}::${f.size}`;
      const map = new Map(files.map((f) => [key(f), f]));
      for (const f of list) map.set(key(f), f);
      onChange(Array.from(map.values()));
    },
    [files, onChange, accept],
  );

  const remove = (idx: number) => {
    const next = files.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  return (
    <div data-testid="document-dropzone">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled) return;
          if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={clsx(
          "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-8 px-4",
          "text-sm text-slate-500 cursor-pointer transition-all",
          dragging
            ? "border-slate-500 bg-slate-50 text-slate-800"
            : "border-slate-300 hover:border-slate-400 hover:text-slate-700 bg-slate-50/40",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <input
          type="file"
          multiple
          accept={accept.join(",")}
          className="hidden"
          disabled={disabled}
          data-testid="document-dropzone-input"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <UploadIcon />
        <span className="text-slate-900 font-medium">Drop files here</span>
        <span className="text-xs">
          {helperText ?? `or click to browse · accepts ${accept.join(", ")} · up to 25 MB each`}
        </span>
      </label>

      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5" data-testid="document-dropzone-list">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${i}`}
              className="flex items-center justify-between text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2"
            >
              <span className="truncate flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  {f.name.split(".").pop() ?? "?"}
                </span>
                {f.name}
              </span>
              <span className="text-xs text-slate-500 ml-3 whitespace-nowrap flex items-center gap-2">
                {(f.size / 1024).toFixed(0)} KB
                <button
                  disabled={disabled}
                  onClick={() => remove(i)}
                  className="text-rose-500 hover:text-rose-700 disabled:opacity-50"
                  title="Remove"
                  aria-label={`Remove ${f.name}`}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-slate-400"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
